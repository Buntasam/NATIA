// Acceptation des conditions d'utilisation et de la politique de confidentialité.
// Gardée dans un fichier du dossier de données, hors de la base : lisible avant le
// déverrouillage, et effacée avec le dossier de données (réinitialisation), ce qui
// redemande l'acceptation.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const TERMS_FILE: &str = "terms.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TermsAcceptance {
    /// Version des textes acceptés (voir `LEGAL_VERSION` côté interface).
    pub version: String,
    /// Date d'acceptation, RFC 3339.
    pub accepted_at: String,
}

fn terms_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(TERMS_FILE))
}

fn read_in(path: &Path) -> Option<TermsAcceptance> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn write_in(path: &Path, version: &str) -> Result<TermsAcceptance, String> {
    let version = version.trim();
    if version.is_empty() || version.len() > 32 {
        return Err("Version des conditions invalide".to_string());
    }
    let acceptance = TermsAcceptance {
        version: version.to_string(),
        accepted_at: chrono::Local::now().to_rfc3339(),
    };
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(&acceptance).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(acceptance)
}

#[tauri::command]
pub fn get_terms_acceptance(app: AppHandle) -> Result<Option<TermsAcceptance>, String> {
    Ok(read_in(&terms_path(&app)?))
}

#[tauri::command]
pub fn accept_terms(app: AppHandle, version: String) -> Result<TermsAcceptance, String> {
    write_in(&terms_path(&app)?, &version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acceptance_round_trip() {
        let dir = std::env::temp_dir().join(format!("natia-terms-{}", std::process::id()));
        let path = dir.join(TERMS_FILE);
        assert_eq!(read_in(&path), None);
        let written = write_in(&path, "2026-10-23").unwrap();
        assert_eq!(read_in(&path), Some(written));
        assert!(write_in(&path, "  ").is_err());
        std::fs::write(&path, "pas du json").unwrap();
        assert_eq!(read_in(&path), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
