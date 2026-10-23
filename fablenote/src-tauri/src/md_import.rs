// Import depuis d'autres applications : un coffre Obsidian (dossier de fichiers .md)
// ou un export Notion (.zip de Markdown, éventuellement découpé en sous-archives).
//
// Le Markdown est converti en HTML (titres, listes, tâches, tableaux, images), les
// liens [[Note]] deviennent des wikilinks NATIA, l'arborescence devient des dossiers,
// le tout rangé sous un dossier au nom du coffre ou de l'export.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Utc};
use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag};
use rusqlite::params;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

use crate::crypto::{maybe_dec, maybe_dec_opt, maybe_enc, maybe_enc_opt};
use crate::db::save_version_inner;
use crate::notes::{create_folder_in, sanitize_note_html, ImportReport};
use crate::AppState;

/// Au-delà, l'import est refusé : protège la mémoire si l'on choisit le mauvais dossier.
const MAX_TOTAL_BYTES: u64 = 1 << 30;
const MAX_FILES: usize = 20_000;
/// Une image plus grosse reste un lien texte plutôt que d'alourdir la note.
const MAX_IMAGE_BYTES: usize = 5 << 20;
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

struct SourceFile {
    /// Chemin relatif, séparé par des « / ».
    path: String,
    bytes: Vec<u8>,
    modified: Option<DateTime<Utc>>,
}

// ─── Lecture de la source ─────────────────────────────────────────────────────

fn read_dir_files(root: &Path) -> Result<Vec<SourceFile>, String> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<SourceFile>, total: &mut u64) -> Result<(), String> {
        let mut entries: Vec<_> = std::fs::read_dir(dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            // .obsidian, .trash, .git… : réglages et corbeille du coffre, pas des notes.
            if name.starts_with('.') { continue; }
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() { continue; }
            let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            if kind.is_dir() {
                walk(&entry.path(), &path, out, total)?;
            } else if kind.is_file() {
                let lower = name.to_lowercase();
                let wanted = lower.ends_with(".md") || IMAGE_EXTENSIONS.iter().any(|x| lower.ends_with(&format!(".{x}")));
                if !wanted { continue; }
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                *total += meta.len();
                if *total > MAX_TOTAL_BYTES || out.len() >= MAX_FILES {
                    return Err("Dossier trop volumineux pour un import (1 Go ou 20 000 fichiers maximum)".to_string());
                }
                let bytes = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
                out.push(SourceFile { path, bytes, modified: meta.modified().ok().map(DateTime::<Utc>::from) });
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(root, "", &mut out, &mut 0)?;
    Ok(out)
}

fn zip_time<R: Read>(f: &zip::read::ZipFile<'_, R>) -> Option<DateTime<Utc>> {
    let t = f.last_modified()?;
    chrono::NaiveDate::from_ymd_opt(t.year().into(), t.month().into(), t.day().into())?
        .and_hms_opt(t.hour().into(), t.minute().into(), t.second().into())
        .map(|d| d.and_utc())
}

/// Fichiers d'une archive ; les sous-archives (exports Notion découpés) sont ouvertes une fois.
fn read_zip_files(bytes: Vec<u8>, nested: bool, out: &mut Vec<SourceFile>, total: &mut u64) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|_| "Ce fichier n'est pas une archive ZIP valide".to_string())?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() || f.encrypted() { continue; }
        // Chemin sûr : pas de « .. » ni de chemin absolu.
        let Some(path) = f.enclosed_name().map(|p| p.to_string_lossy().replace('\\', "/")) else { continue };
        let lower = path.to_lowercase();
        let is_zip = lower.ends_with(".zip");
        let wanted = lower.ends_with(".md") || is_zip || IMAGE_EXTENSIONS.iter().any(|x| lower.ends_with(&format!(".{x}")));
        if !wanted || (is_zip && nested) { continue; }
        *total += f.size();
        if *total > MAX_TOTAL_BYTES || out.len() >= MAX_FILES {
            return Err("Archive trop volumineuse pour un import (1 Go ou 20 000 fichiers maximum)".to_string());
        }
        let modified = zip_time(&f);
        let mut data = Vec::new();
        (&mut f).take(MAX_TOTAL_BYTES + 1).read_to_end(&mut data).map_err(|e| e.to_string())?;
        if is_zip {
            read_zip_files(data, true, out, total)?;
        } else {
            out.push(SourceFile { path, bytes: data, modified });
        }
    }
    Ok(())
}

// ─── Noms ─────────────────────────────────────────────────────────────────────

/// Notion ajoute un identifiant de 32 caractères hexadécimaux aux noms : « Projet 1a2b…9f ».
fn strip_notion_id(name: &str) -> &str {
    let trimmed = name.trim_end();
    if let Some((head, tail)) = trimmed.rsplit_once(' ') {
        if tail.len() == 32 && tail.chars().all(|c| c.is_ascii_hexdigit()) { return head.trim_end(); }
    }
    trimmed
}

fn clean_component(name: &str) -> String {
    strip_notion_id(name).replace(['/', '\\'], "-").trim().to_string()
}

/// (dossier relatif, titre) d'un fichier .md.
fn note_place(path: &str) -> (Vec<String>, String) {
    let mut parts: Vec<&str> = path.split('/').collect();
    let file = parts.pop().unwrap_or_default();
    let stem = file.strip_suffix(".md").or_else(|| file.strip_suffix(".MD")).unwrap_or(file);
    let folders = parts.iter().map(|p| clean_component(p)).filter(|p| !p.is_empty()).collect();
    let title = clean_component(stem);
    (folders, if title.is_empty() { "Note importée".to_string() } else { title })
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Chemin relatif résolu depuis le dossier de la note (« ../ » compris).
fn resolve(base_dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = if base_dir.is_empty() { vec![] } else { base_dir.split('/').collect() };
    for p in target.split('/') {
        match p {
            "" | "." => {}
            ".." => { parts.pop(); }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

// ─── Contenu ──────────────────────────────────────────────────────────────────

/// En-tête YAML d'Obsidian (« --- … --- ») : retiré du texte, ses tags sont gardés.
fn split_frontmatter(md: &str) -> (Vec<String>, &str) {
    let Some(rest) = md.strip_prefix("---\n").or_else(|| md.strip_prefix("---\r\n")) else { return (vec![], md) };
    let Some(end) = rest.find("\n---") else { return (vec![], md) };
    let yaml = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['\r', '\n']);
    let mut tags = Vec::new();
    let mut in_tags = false;
    for line in yaml.lines() {
        let l = line.trim();
        if let Some(v) = l.strip_prefix("tags:").or_else(|| l.strip_prefix("tag:")) {
            let v = v.trim().trim_start_matches('[').trim_end_matches(']');
            tags.extend(v.split(',').map(|t| t.trim().trim_matches(['"', '\'', '#']).to_string()).filter(|t| !t.is_empty()));
            in_tags = v.is_empty();
        } else if in_tags && l.starts_with("- ") {
            let t = l[2..].trim().trim_matches(['"', '\'', '#']);
            if !t.is_empty() { tags.push(t.to_string()); }
        } else {
            in_tags = false;
        }
    }
    (tags, body)
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

struct Assets<'a> {
    by_path: HashMap<String, &'a [u8]>,
    by_name: HashMap<String, &'a [u8]>,
}

impl Assets<'_> {
    fn data_url(&self, base_dir: &str, target: &str) -> Option<String> {
        let target = percent_decode(target.split(['?', '#']).next().unwrap_or(target));
        let lower = target.to_lowercase();
        let ext = lower.rsplit('.').next()?;
        if !IMAGE_EXTENSIONS.contains(&ext) || lower.starts_with("http:") || lower.starts_with("https:") { return None; }
        let bytes = self.by_path.get(&resolve(base_dir, &target).to_lowercase())
            .or_else(|| self.by_name.get(lower.rsplit('/').next()?))?;
        if bytes.len() > MAX_IMAGE_BYTES { return None; }
        let mime = match ext { "jpg" => "jpeg", "svg" => "svg+xml", e => e };
        Some(format!("data:image/{};base64,{}", mime, B64.encode(bytes)))
    }
}

/// `[[Cible|texte]]`, `[[Cible#titre]]` et `![[image.png]]` d'Obsidian, remplacés avant la
/// conversion par des marqueurs que le Markdown laisse intacts, puis par leur HTML.
fn extract_wikilinks(md: &str, base_dir: &str, links: &HashMap<String, String>, assets: &Assets) -> (String, Vec<String>) {
    let mut out = String::with_capacity(md.len());
    let mut html_parts = Vec::new();
    let mut rest = md;
    while let Some(start) = rest.find("[[") {
        let Some(len) = rest[start + 2..].find("]]") else { break };
        let inner = &rest[start + 2..start + 2 + len];
        if inner.contains('\n') || inner.is_empty() {
            out.push_str(&rest[..start + 2]);
            rest = &rest[start + 2..];
            continue;
        }
        let embed = start > 0 && rest.as_bytes()[start - 1] == b'!';
        out.push_str(&rest[..if embed { start - 1 } else { start }]);
        let (target, label) = inner.split_once('|').unwrap_or((inner, inner));
        let target = target.trim();
        let html = if embed {
            match assets.data_url(base_dir, target) {
                Some(src) => format!("<img src=\"{}\" alt=\"{}\">", src, escape(label.trim())),
                None => escape(&format!("[{}]", label.trim())),
            }
        } else {
            let note = target.split('#').next().unwrap_or(target).trim();
            let shown = if inner.contains('|') { label.trim() } else { note };
            match links.get(&note.to_lowercase()) {
                Some(id) => format!(
                    "<span data-wikilink=\"true\" class=\"wikilink\" data-note-id=\"{}\" data-note-title=\"{}\">{}</span>",
                    id, escape(note), escape(shown)
                ),
                // Cible inconnue : le texte [[…]] reste, NATIA le propose comme lien à créer.
                None => escape(&format!("[[{}]]", note)),
            }
        };
        out.push_str(&format!("\u{E000}{}\u{E001}", html_parts.len()));
        html_parts.push(html);
        rest = &rest[start + 2 + len + 2..];
    }
    out.push_str(rest);
    (out, html_parts)
}

/// Listes de tâches au format de l'éditeur (TipTap) : `ul[data-type=taskList] > li[data-type=taskItem]`.
fn tiptap_tasks(html: &str) -> String {
    const UNCHECKED: &str = "<li><input disabled=\"\" type=\"checkbox\"/>";
    const CHECKED: &str = "<li><input disabled=\"\" type=\"checkbox\" checked=\"\"/>";
    html.replace(&format!("<ul>\n{UNCHECKED}"), &format!("<ul data-type=\"taskList\">\n{UNCHECKED}"))
        .replace(&format!("<ul>\n{CHECKED}"), &format!("<ul data-type=\"taskList\">\n{CHECKED}"))
        .replace(CHECKED, "<li data-type=\"taskItem\" data-checked=\"true\">")
        .replace(UNCHECKED, "<li data-type=\"taskItem\" data-checked=\"false\">")
}

fn markdown_to_html(md: &str, base_dir: &str, links: &HashMap<String, String>, assets: &Assets) -> String {
    let (md, parts) = extract_wikilinks(md, base_dir, links, assets);
    let opts = Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS | Options::ENABLE_STRIKETHROUGH;
    let parser = Parser::new_ext(&md, opts).map(|ev| match ev {
        // Images locales du coffre ou de l'export : intégrées à la note.
        Event::Start(Tag::Image { link_type, dest_url, title, id }) => {
            let dest = assets.data_url(base_dir, &dest_url).map(CowStr::from).unwrap_or(dest_url);
            Event::Start(Tag::Image { link_type, dest_url: dest, title, id })
        }
        // Le HTML brut du Markdown est affiché comme texte, jamais interprété.
        Event::Html(s) | Event::InlineHtml(s) => Event::Text(s),
        other => other,
    });
    let mut out = String::new();
    html::push_html(&mut out, parser);
    let mut out = tiptap_tasks(&out);
    for (i, part) in parts.iter().enumerate() {
        out = out.replace(&format!("\u{E000}{i}\u{E001}"), part);
    }
    out
}

// ─── Import ───────────────────────────────────────────────────────────────────

fn import_files(
    db: &rusqlite::Connection,
    notes_dir: &Path,
    key: &Option<[u8; 32]>,
    root_name: &str,
    files: Vec<SourceFile>,
) -> Result<ImportReport, String> {
    let assets = Assets {
        by_path: files.iter().filter(|f| !f.path.to_lowercase().ends_with(".md"))
            .map(|f| (f.path.to_lowercase(), f.bytes.as_slice())).collect(),
        by_name: files.iter().filter(|f| !f.path.to_lowercase().ends_with(".md"))
            .filter_map(|f| Some((f.path.rsplit('/').next()?.to_lowercase(), f.bytes.as_slice()))).collect(),
    };
    let notes: Vec<&SourceFile> = files.iter().filter(|f| f.path.to_lowercase().ends_with(".md")).collect();
    if notes.is_empty() { return Err("Aucune note Markdown (.md) trouvée".to_string()); }

    // Notes déjà présentes : pas de doublon à un second import, et liens [[…]] vers elles.
    let mut existing: HashMap<(String, String), String> = HashMap::new();
    let mut links: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = db.prepare("SELECT id, title, folder FROM notes WHERE deleted_at IS NULL").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, title, folder) = row.map_err(|e| e.to_string())?;
            let title = maybe_dec(key, &title);
            links.entry(title.to_lowercase()).or_insert_with(|| id.clone());
            existing.insert((title.to_lowercase(), maybe_dec_opt(key, &folder).unwrap_or_default().to_lowercase()), id);
        }
    }

    let root = clean_component(root_name);
    let root = if root.is_empty() { "Import".to_string() } else { root };
    let planned: Vec<(String, String, String)> = notes.iter().map(|f| {
        let (folders, title) = note_place(&f.path);
        let folder = std::iter::once(root.clone()).chain(folders).collect::<Vec<_>>().join("/");
        let id = existing.get(&(title.to_lowercase(), folder.to_lowercase())).cloned().unwrap_or_else(|| Uuid::new_v4().to_string());
        (id, title, folder)
    }).collect();
    // Les notes importées passent avant les homonymes déjà présents pour les liens internes.
    for (id, title, _) in &planned { links.insert(title.to_lowercase(), id.clone()); }

    let now = Utc::now().to_rfc3339();
    let mut report = ImportReport { imported: 0, skipped: 0 };
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut folders_done: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (f, (id, title, folder)) in notes.iter().zip(&planned) {
        if existing.contains_key(&(title.to_lowercase(), folder.to_lowercase())) {
            report.skipped += 1;
            continue;
        }
        let text = String::from_utf8_lossy(&f.bytes);
        let (tags, body) = split_frontmatter(&text);
        let base_dir = f.path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        let content = sanitize_note_html(&markdown_to_html(body, base_dir, &links, &assets));
        let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
        let date = f.modified.map(|d| d.to_rfc3339()).unwrap_or_else(|| now.clone());
        let folder_opt = Some(folder.clone());
        tx.execute(
            "INSERT INTO notes (id, title, tags, folder, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![id, maybe_enc(key, title), maybe_enc(key, &tags_json), maybe_enc_opt(key, &folder_opt), date, date],
        ).map_err(|e| e.to_string())?;
        std::fs::write(notes_dir.join(format!("{}.html", id)), maybe_enc(key, &content)).map_err(|e| e.to_string())?;
        save_version_inner(&tx, id, &content, "Importé", &now, key, false).map_err(|e| e.to_string())?;
        let mut prefix = String::new();
        for part in folder.split('/') {
            if !prefix.is_empty() { prefix.push('/'); }
            prefix.push_str(part);
            if folders_done.insert(prefix.clone()) { create_folder_in(&tx, key, &prefix)?; }
        }
        report.imported += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(report)
}

/// Importe un coffre Obsidian (dossier) ou un export Notion (.zip).
#[tauri::command]
pub async fn import_markdown(path: String, state: State<'_, AppState>) -> Result<ImportReport, String> {
    crate::require_unlocked(&state)?;
    let p = Path::new(&path);
    let root_name = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let files = if p.is_dir() {
        read_dir_files(p)?
    } else {
        let size = std::fs::metadata(p).map_err(|e| e.to_string())?.len();
        if size > MAX_TOTAL_BYTES { return Err("Archive trop volumineuse pour un import (1 Go ou 20 000 fichiers maximum)".to_string()); }
        let mut out = Vec::new();
        read_zip_files(std::fs::read(p).map_err(|e| e.to_string())?, false, &mut out, &mut 0)?;
        out
    };
    // Notion nomme l'export « Export-<id> » : un nom plus parlant pour le dossier racine.
    let root_name = if root_name.starts_with("Export-") { "Notion".to_string() } else { root_name };
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let report = import_files(&db, &state.notes_dir, &key, &root_name, files)?;
    crate::notes::clear_search_cache(&state);
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_assets() -> Assets<'static> { Assets { by_path: HashMap::new(), by_name: HashMap::new() } }

    #[test]
    fn notion_ids_are_removed_from_names() {
        assert_eq!(strip_notion_id("Projet Orion 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"), "Projet Orion");
        assert_eq!(strip_notion_id("Courses"), "Courses");
        assert_eq!(note_place("Travail 0123456789abcdef0123456789abcdef/Réunion 0123456789abcdef0123456789abcdef.md"),
            (vec!["Travail".to_string()], "Réunion".to_string()));
    }

    #[test]
    fn frontmatter_tags_are_kept() {
        let (tags, body) = split_frontmatter("---\ntags: [projet, \"urgent\"]\nauteur: moi\n---\n# Titre\n");
        assert_eq!(tags, vec!["projet", "urgent"]);
        assert_eq!(body, "# Titre\n");
        let (tags, _) = split_frontmatter("---\ntags:\n  - a\n  - '#b'\n---\ntexte");
        assert_eq!(tags, vec!["a", "b"]);
        assert_eq!(split_frontmatter("pas d'en-tête").1, "pas d'en-tête");
    }

    #[test]
    fn markdown_becomes_editor_html() {
        let mut links = HashMap::new();
        links.insert("budget".to_string(), "id-1".to_string());
        let html = markdown_to_html("# Titre\n\n- [ ] à faire\n- [x] fait\n\nVoir [[Budget|le budget]] et [[Inconnue]].\n\n<script>x</script>", "", &links, &no_assets());
        assert!(html.contains("<h1>Titre</h1>"));
        assert!(html.contains("<ul data-type=\"taskList\">"), "{html}");
        assert!(html.contains("<li data-type=\"taskItem\" data-checked=\"false\">"), "{html}");
        assert!(html.contains("<li data-type=\"taskItem\" data-checked=\"true\">"), "{html}");
        assert!(html.contains("data-note-id=\"id-1\" data-note-title=\"Budget\">le budget</span>"), "{html}");
        assert!(html.contains("[[Inconnue]]"));
        assert!(!html.contains("<script>"));
    }

    #[test]
    fn import_creates_notes_folders_and_links_once() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        let dir = std::env::temp_dir().join(format!("natia-mdimport-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let files = || vec![
            SourceFile { path: "Projets/Orion.md".into(), bytes: b"---\ntags: [travail]\n---\nBudget : voir [[Budget]].".to_vec(), modified: None },
            SourceFile { path: "Budget.md".into(), bytes: b"# Budget\n\n- [x] valider".to_vec(), modified: None },
        ];
        let first = import_files(&db, &dir, &None, "Coffre", files()).unwrap();
        assert_eq!((first.imported, first.skipped), (2, 0));
        let second = import_files(&db, &dir, &None, "Coffre", files()).unwrap();
        assert_eq!((second.imported, second.skipped), (0, 2));

        let (orion_id, folder, tags): (String, String, String) = db.query_row(
            "SELECT id, folder, tags FROM notes WHERE title='Orion'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();
        assert_eq!(folder, "Coffre/Projets");
        assert_eq!(tags, "[\"travail\"]");
        let budget_id: String = db.query_row("SELECT id FROM notes WHERE title='Budget'", [], |r| r.get(0)).unwrap();
        let html = std::fs::read_to_string(dir.join(format!("{orion_id}.html"))).unwrap();
        assert!(html.contains(&format!("data-note-id=\"{budget_id}\"")), "{html}");
        let folders: i64 = db.query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0)).unwrap();
        assert_eq!(folders, 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn local_images_are_embedded() {
        let png: &[u8] = b"\x89PNG";
        let assets = Assets {
            by_path: HashMap::from([("notes/img/chat.png".to_string(), png)]),
            by_name: HashMap::from([("chat.png".to_string(), png)]),
        };
        let html = markdown_to_html("![un chat](img/chat%2Epng) et ![[chat.png]]", "notes", &HashMap::new(), &assets);
        assert_eq!(html.matches("data:image/png;base64,").count(), 2, "{html}");
        assert_eq!(resolve("a/b", "../c/d.png"), "a/c/d.png");
    }
}
