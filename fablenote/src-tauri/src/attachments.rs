// Fichiers joints aux notes (PDF, documents, archives…), listés dans « Fichiers liés ».
//
// Rangés dans `attachments/<id>` à côté de `notes/`, chiffrés (AES-256-GCM) avec un mot
// de passe NATIA comme le reste ; le nom du fichier est chiffré dans la base. Pour ouvrir
// un fichier avec son application, une copie déchiffrée est écrite dans un dossier
// temporaire, vidé au verrouillage, au démarrage et à la fermeture.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::crypto::{is_valid_uuid, maybe_dec, maybe_dec_bytes, maybe_enc, maybe_enc_bytes, sanitize_name};
use crate::AppState;

/// Un fichier plus gros alourdirait la base de sauvegarde et l'export.
pub(crate) const MAX_ATTACHMENT_BYTES: u64 = 100 << 20;

type Key = Option<[u8; 32]>;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub name: String,
    pub size: u64,
    pub created_at: String,
}

#[derive(Serialize, Debug)]
pub struct AttachmentInfo {
    #[serde(flatten)]
    pub attachment: Attachment,
    /// Titre de la note, vide si elle a été supprimée définitivement entre-temps.
    pub note_title: String,
    /// La note est dans la corbeille.
    pub note_deleted: bool,
}

/// Dossier des fichiers joints : à côté du dossier des notes.
pub(crate) fn attachments_dir(notes_dir: &Path) -> PathBuf {
    notes_dir.parent().unwrap_or(notes_dir).join("attachments")
}

fn file_path(notes_dir: &Path, id: &str) -> PathBuf {
    attachments_dir(notes_dir).join(id)
}

/// Copies déchiffrées ouvertes avec une autre application.
fn open_dir() -> PathBuf {
    std::env::temp_dir().join("natia-fichiers-ouverts")
}

/// Efface les copies déchiffrées (verrouillage, démarrage, fermeture).
pub fn clear_open_copies() {
    let _ = std::fs::remove_dir_all(open_dir());
}

fn row_to_attachment(key: &Key, id: String, note_id: String, name: String, size: i64, created_at: String) -> Attachment {
    Attachment { id, note_id, name: maybe_dec(key, &name), size: size.max(0) as u64, created_at }
}

pub(crate) fn load_attachments(db: &Connection, key: &Key, note_id: Option<&str>) -> Result<Vec<Attachment>, String> {
    let sql = "SELECT id, note_id, name, size, created_at FROM attachments WHERE (?1 IS NULL OR note_id=?1) ORDER BY created_at DESC";
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([note_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map(|(a, b, c, d, e)| row_to_attachment(key, a, b, c, d, e)).map_err(|e| e.to_string())).collect()
}

/// Enregistre un fichier joint ; `bytes` est le contenu en clair.
pub(crate) fn store_attachment(
    db: &Connection, notes_dir: &Path, key: &Key,
    id: &str, note_id: &str, name: &str, bytes: &[u8], created_at: &str,
) -> Result<(), String> {
    let dir = attachments_dir(notes_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(id), maybe_enc_bytes(key, bytes)).map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO attachments (id, note_id, name, size, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![id, note_id, maybe_enc(key, name), bytes.len() as i64, created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Contenu en clair d'un fichier joint.
pub(crate) fn read_attachment(notes_dir: &Path, key: &Key, id: &str) -> Result<Vec<u8>, String> {
    if !is_valid_uuid(id) { return Err("ID invalide".to_string()); }
    let raw = std::fs::read(file_path(notes_dir, id)).map_err(|_| "Fichier joint introuvable".to_string())?;
    maybe_dec_bytes(key, &raw)
}

/// Supprime les fichiers joints d'une note supprimée définitivement.
pub(crate) fn delete_note_attachments(db: &Connection, notes_dir: &Path, note_id: &str) -> Result<(), String> {
    let ids: Vec<String> = {
        let mut stmt = db.prepare("SELECT id FROM attachments WHERE note_id=?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([note_id], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for id in &ids { let _ = std::fs::remove_file(file_path(notes_dir, id)); }
    db.execute("DELETE FROM attachments WHERE note_id=?1", [note_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Texte des fichiers joints (recherche) ────────────────────────────────────

/// Au-delà, le texte d'un fichier n'est pas gardé en entier : la recherche n'en a pas besoin.
const MAX_TEXT_CHARS: usize = 300_000;

/// Texte lisible d'un fichier joint : PDF, ou fichier texte. Vide si rien à lire.
pub(crate) fn extract_text(name: &str, bytes: &[u8]) -> String {
    let ext = Path::new(name).extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let text = match ext.as_str() {
        // pdf-extract peut paniquer sur un PDF mal formé : on l'isole.
        "pdf" => std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(bytes).ok())
            .ok()
            .flatten()
            .unwrap_or_default(),
        "txt" | "md" | "csv" | "json" | "log" | "xml" | "html" | "htm" => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    };
    let clean = text.split_whitespace().collect::<Vec<_>>().join(" ");
    match clean.char_indices().nth(MAX_TEXT_CHARS) {
        Some((i, _)) => clean[..i].to_string(),
        None => clean,
    }
}

static INDEXING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Lit le texte des fichiers joints qui ne l'ont pas encore été (ajoutés, synchronisés,
/// importés). La base n'est verrouillée que pour lire la liste et enregistrer chaque texte.
pub(crate) fn index_pending(state: &AppState) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if INDEXING.swap(true, Ordering::SeqCst) { return Ok(()); }
    let result = (|| {
        let key = key_of(state)?;
        let pending: Vec<(String, String)> = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db.prepare("SELECT id, name FROM attachments WHERE text IS NULL").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for (id, enc_name) in pending {
            let name = maybe_dec(&key, &enc_name);
            let text = read_attachment(&state.notes_dir, &key, &id).map(|b| extract_text(&name, &b)).unwrap_or_default();
            let stored = if text.is_empty() { String::new() } else { maybe_enc(&key, &text) };
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.execute("UPDATE attachments SET text=?1 WHERE id=?2", params![stored, id]).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    INDEXING.store(false, Ordering::SeqCst);
    result
}

/// Fichiers joints (de notes hors corbeille) dont le texte contient `matches`.
/// Renvoie (id de la note, nom du fichier, texte).
pub(crate) fn searchable_texts(db: &Connection, key: &Key) -> Result<Vec<(String, String, String)>, String> {
    let mut stmt = db.prepare(
        "SELECT a.note_id, a.name, a.text FROM attachments a JOIN notes n ON n.id = a.note_id \
         WHERE n.deleted_at IS NULL AND a.text IS NOT NULL AND a.text != ''",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).map(|(n, name, text)| (n, maybe_dec(key, &name), maybe_dec(key, &text))).collect())
}

/// Nom d'origine du fichier, sans chemin et sans caractère interdit sous Windows.
fn clean_file_name(path: &Path) -> String {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let clean = sanitize_name(&name);
    if clean.trim().is_empty() { "fichier".to_string() } else { clean }
}

fn key_of(state: &AppState) -> Result<Key, String> {
    Ok(*state.enc_key.lock().map_err(|e| e.to_string())?)
}

/// `%C3%A9` → « é » : le nom du fichier déposé arrive encodé dans un en-tête.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) { out.push(h * 16 + l); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn check_note(db: &Connection, note_id: &str) -> Result<(), String> {
    if !is_valid_uuid(note_id) { return Err("ID invalide".to_string()); }
    if db.query_row("SELECT 1 FROM notes WHERE id=?1", [note_id], |_| Ok(())).is_err() {
        return Err("Enregistrez la note avant d'y joindre un fichier".to_string());
    }
    Ok(())
}

fn add_one(db: &Connection, state: &AppState, key: &Key, note_id: &str, name: String, bytes: &[u8]) -> Result<Attachment, String> {
    if bytes.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err(format!("{name} : fichier trop gros (100 Mo maximum)"));
    }
    let a = Attachment {
        id: Uuid::new_v4().to_string(), note_id: note_id.to_string(), name,
        size: bytes.len() as u64, created_at: Utc::now().to_rfc3339(),
    };
    store_attachment(db, &state.notes_dir, key, &a.id, &a.note_id, &a.name, bytes, &a.created_at)?;
    Ok(a)
}

// ─── Commandes ────────────────────────────────────────────────────────────────

/// Joint des fichiers (chemins choisis dans la fenêtre de sélection) à une note.
#[tauri::command]
pub fn add_attachments(note_id: String, paths: Vec<String>, state: State<AppState>) -> Result<Vec<Attachment>, String> {
    crate::require_unlocked(&state)?;
    let key = key_of(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    check_note(&db, &note_id)?;
    let mut added = Vec::new();
    for p in paths {
        let path = Path::new(&p);
        let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
        if size > MAX_ATTACHMENT_BYTES {
            return Err(format!("{} : fichier trop gros (100 Mo maximum)", clean_file_name(path)));
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        added.push(add_one(&db, &state, &key, &note_id, clean_file_name(path), &bytes)?);
    }
    Ok(added)
}

/// Joint un fichier glissé dans la note : son contenu arrive brut (pas en JSON),
/// l'id de la note et le nom du fichier dans les en-têtes `x-note-id` et `x-file-name`.
#[tauri::command]
pub fn add_attachment_data(request: tauri::ipc::Request<'_>, state: State<AppState>) -> Result<Attachment, String> {
    crate::require_unlocked(&state)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Contenu du fichier manquant".to_string());
    };
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let note_id = header("x-note-id").ok_or("ID invalide")?;
    let name = clean_file_name(Path::new(&percent_decode(&header("x-file-name").unwrap_or_default())));
    let key = key_of(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    check_note(&db, &note_id)?;
    add_one(&db, &state, &key, &note_id, name, bytes)
}

/// Lit le texte des fichiers joints pas encore indexés (PDF…), hors du fil de l'interface.
#[tauri::command]
pub async fn index_attachments(state: State<'_, AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    index_pending(&state)
}

/// Tous les fichiers joints (ou ceux d'une note), avec le titre de leur note.
#[tauri::command]
pub fn list_attachments(note_id: Option<String>, state: State<AppState>) -> Result<Vec<AttachmentInfo>, String> {
    crate::require_unlocked(&state)?;
    let key = key_of(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let list = load_attachments(&db, &key, note_id.as_deref())?;
    Ok(list.into_iter().map(|a| {
        let note: Option<(String, Option<String>)> = db
            .query_row("SELECT title, deleted_at FROM notes WHERE id=?1", [&a.note_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .ok();
        AttachmentInfo {
            note_title: note.as_ref().map(|(t, _)| maybe_dec(&key, t)).unwrap_or_default(),
            note_deleted: note.as_ref().is_some_and(|(_, d)| d.is_some()),
            attachment: a,
        }
    }).collect())
}

/// Ouvre le fichier avec l'application associée (copie déchiffrée temporaire).
#[tauri::command]
pub fn open_attachment(app: AppHandle, id: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = key_of(&state)?;
    let name = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let raw: String = db.query_row("SELECT name FROM attachments WHERE id=?1", [&id], |r| r.get(0))
            .map_err(|_| "Fichier joint introuvable".to_string())?;
        maybe_dec(&key, &raw)
    };
    let bytes = read_attachment(&state.notes_dir, &key, &id)?;
    let dir = open_dir().join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(sanitize_name(&name));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.opener().open_path(path.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
}

/// Enregistre une copie du fichier à l'endroit choisi.
#[tauri::command]
pub fn save_attachment_as(id: String, path: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = key_of(&state)?;
    let bytes = read_attachment(&state.notes_dir, &key, &id)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_attachment(id: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM attachments WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(file_path(&state.notes_dir, &id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachments_are_encrypted_and_follow_their_note() {
        let db = Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        let root = std::env::temp_dir().join(format!("natia-attach-{}", std::process::id()));
        let notes_dir = root.join("notes");
        std::fs::create_dir_all(&notes_dir).unwrap();
        let key: Key = Some([7u8; 32]);
        let note = Uuid::new_v4().to_string();
        let id = Uuid::new_v4().to_string();
        store_attachment(&db, &notes_dir, &key, &id, &note, "devis.pdf", b"%PDF contenu", "2026-10-23T10:00:00Z").unwrap();

        let on_disk = std::fs::read(file_path(&notes_dir, &id)).unwrap();
        assert!(!on_disk.windows(7).any(|w| w == b"contenu"), "le contenu n'est pas en clair sur le disque");
        let name_in_db: String = db.query_row("SELECT name FROM attachments", [], |r| r.get(0)).unwrap();
        assert!(!name_in_db.contains("devis"), "le nom n'est pas en clair dans la base");

        assert_eq!(read_attachment(&notes_dir, &key, &id).unwrap(), b"%PDF contenu");
        assert_eq!(load_attachments(&db, &key, Some(&note)).unwrap()[0].name, "devis.pdf");

        delete_note_attachments(&db, &notes_dir, &note).unwrap();
        assert!(load_attachments(&db, &key, None).unwrap().is_empty());
        assert!(!file_path(&notes_dir, &id).exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    fn temp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("natia-attach-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(root.join("notes")).unwrap();
        root
    }

    #[test]
    fn attachments_survive_export_and_import() {
        let (src, dst) = (temp_root("src"), temp_root("dst"));
        let db = Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        let note = Uuid::new_v4().to_string();
        db.execute("INSERT INTO notes (id, title, tags, created_at, updated_at) VALUES (?1,'Devis','[]','t','t')", [&note]).unwrap();
        std::fs::write(src.join("notes").join(format!("{note}.html")), "<p>voir pièce jointe</p>").unwrap();
        let id = Uuid::new_v4().to_string();
        store_attachment(&db, &src.join("notes"), &None, &id, &note, "devis.pdf", b"PDF", "t").unwrap();

        let zip = crate::notes::build_notes_zip(&db, &src.join("notes"), &None).unwrap();
        let fresh = Connection::open_in_memory().unwrap();
        crate::db::init_db(&fresh).unwrap();
        let archive = crate::notes::unwrap_export(zip.clone(), None).unwrap();
        let report = crate::notes::import_notes_in(&fresh, &dst.join("notes"), &None, archive).unwrap();
        assert_eq!(report.imported, 1);
        assert_eq!(load_attachments(&fresh, &None, Some(&note)).unwrap()[0].name, "devis.pdf");
        assert_eq!(read_attachment(&dst.join("notes"), &None, &id).unwrap(), b"PDF");

        // Une seconde restauration ne duplique rien.
        let archive = crate::notes::unwrap_export(zip, None).unwrap();
        crate::notes::import_notes_in(&fresh, &dst.join("notes"), &None, archive).unwrap();
        assert_eq!(load_attachments(&fresh, &None, None).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&dst);
    }

    #[test]
    fn password_toggle_encrypts_and_decrypts_files() {
        let root = temp_root("toggle");
        let notes_dir = root.join("notes");
        let db = Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        let id = Uuid::new_v4().to_string();
        store_attachment(&db, &notes_dir, &None, &id, &Uuid::new_v4().to_string(), "photo.jpg", b"JPEGDATA", "t").unwrap();
        let key = [3u8; 32];
        crate::crypto::encrypt_all_data(&db, &notes_dir, &key).unwrap();
        assert!(crate::crypto::is_encrypted_bytes(&std::fs::read(file_path(&notes_dir, &id)).unwrap()));
        assert_eq!(read_attachment(&notes_dir, &Some(key), &id).unwrap(), b"JPEGDATA");
        crate::crypto::decrypt_all_data(&db, &notes_dir, &key).unwrap();
        assert_eq!(std::fs::read(file_path(&notes_dir, &id)).unwrap(), b"JPEGDATA");
        assert_eq!(load_attachments(&db, &None, None).unwrap()[0].name, "photo.jpg");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn text_is_extracted_from_plain_files_only() {
        assert_eq!(extract_text("notes.txt", "Bonjour\n\n  le   monde".as_bytes()), "Bonjour le monde");
        assert_eq!(extract_text("photo.jpg", b"\xff\xd8binaire"), "");
        // Un PDF illisible ne fait pas planter l'application.
        assert_eq!(extract_text("casse.pdf", b"%PDF-1.4 pas vraiment un pdf"), "");
    }

    #[test]
    fn dropped_file_names_are_decoded() {
        assert_eq!(percent_decode("devis%20%C3%A9t%C3%A9.pdf"), "devis été.pdf");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("a%2"), "a%2");
    }

    #[test]
    fn file_names_cannot_escape() {
        assert_eq!(clean_file_name(Path::new("C:\\docs\\rapport final.pdf")), "rapport final.pdf");
        assert!(!clean_file_name(Path::new("..\\..\\x")).contains(".."));
    }
}
