// Export de toutes les notes en Markdown : un dossier « NATIA-export-AAAA-MM-JJ » avec
// les sous-dossiers, un fichier .md par note, les images et les fichiers joints à côté.
// Lisible par Obsidian ou n'importe quel éditeur de texte.
//
// L'interface convertit chaque note (lib/markdownExport.ts) ; ici on ne fait qu'écrire,
// et seulement dans le dossier préparé par `begin_markdown_export`.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Deserialize;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

use crate::crypto::sanitize_name;
use crate::AppState;

/// Dossier de l'export en cours : les écritures n'ont lieu que dedans.
static TARGET: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Deserialize, Debug)]
pub struct ExportEntry {
    /// Chemin relatif au dossier d'export, avec « / ».
    pub path: String,
    pub text: Option<String>,
    pub base64: Option<String>,
    /// Fichier joint à recopier (déchiffré).
    pub attachment_id: Option<String>,
}

/// Chemin relatif sûr : pas de « .. », pas de disque, pas de caractère interdit sous Windows.
pub(crate) fn safe_relative(path: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in path.split('/') {
        let clean = sanitize_name(part.trim());
        let clean = clean.trim_end_matches(['.', ' ']);
        if clean.is_empty() { return None; }
        let p = Path::new(clean);
        if p.components().any(|c| !matches!(c, Component::Normal(_))) { return None; }
        out.push(clean);
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

/// Nouveau dossier « NATIA-export-AAAA-MM-JJ » (ou « … (2) ») dans `dir` ; renvoie son chemin.
pub(crate) fn new_export_dir(dir: &Path, date: &str) -> Result<PathBuf, String> {
    let base = format!("NATIA-export-{date}");
    let mut target = dir.join(&base);
    let mut n = 2;
    while target.exists() {
        target = dir.join(format!("{base} ({n})"));
        n += 1;
    }
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(target)
}

#[tauri::command]
pub fn begin_markdown_export(dir: String, state: State<AppState>) -> Result<String, String> {
    crate::require_unlocked(&state)?;
    let target = new_export_dir(Path::new(&dir), &chrono::Local::now().format("%Y-%m-%d").to_string())?;
    *TARGET.lock().map_err(|e| e.to_string())? = Some(target.clone());
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn write_markdown_files(entries: Vec<ExportEntry>, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let target = TARGET.lock().map_err(|e| e.to_string())?.clone().ok_or("Aucun export en cours")?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    for e in entries {
        let rel = safe_relative(&e.path).ok_or_else(|| format!("Chemin refusé : {}", e.path))?;
        let bytes = if let Some(text) = e.text {
            text.into_bytes()
        } else if let Some(b) = e.base64 {
            B64.decode(b).map_err(|e| e.to_string())?
        } else if let Some(id) = e.attachment_id {
            crate::attachments::read_attachment(&state.notes_dir, &key, &id)?
        } else {
            continue;
        };
        let path = target.join(rel);
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ouvre le dossier du dernier export dans l'Explorateur.
#[tauri::command]
pub fn open_markdown_export(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = TARGET.lock().map_err(|e| e.to_string())?.clone().ok_or("Aucun export")?;
    app.opener().open_path(target.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_paths_stay_inside_the_folder() {
        assert_eq!(safe_relative("Travail/Projets/Budget.md"), Some(PathBuf::from("Travail").join("Projets").join("Budget.md")));
        assert_eq!(safe_relative("Notes/Réunion: bilan?.md"), Some(PathBuf::from("Notes").join("Réunion_ bilan_.md")));
        assert!(safe_relative("../hors.md").map_or(true, |p| !p.starts_with("..")));
        assert!(safe_relative("").is_none());
        assert!(safe_relative("a//b.md").is_none());
        assert!(safe_relative("C:\\Windows\\x.md").map_or(true, |p| p.components().count() == 1));
    }

    #[test]
    fn a_new_folder_each_time() {
        let root = std::env::temp_dir().join(format!("natia-mdexport-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let a = new_export_dir(&root, "2026-11-10").unwrap();
        let b = new_export_dir(&root, "2026-11-10").unwrap();
        assert!(a.ends_with("NATIA-export-2026-11-10"));
        assert!(b.ends_with("NATIA-export-2026-11-10 (2)"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
