// Sauvegarde automatique : export ZIP (le même que Paramètres → Données) écrit à
// intervalle régulier dans un dossier choisi par l'utilisateur, en gardant les N derniers.
//
// L'interface appelle `run_backup` au déverrouillage puis régulièrement : la
// sauvegarde n'est faite que si la précédente est assez ancienne.

use chrono::{DateTime, Local, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::crypto::{maybe_dec, maybe_enc};
use crate::db::{keychain_get, keychain_set};
use crate::notes::{build_notes_zip, import_notes_in, protect_zip, unwrap_export, ImportReport, Protection};
use crate::AppState;

pub(crate) const BACKUP_PASSWORD_NAME: &str = "backup_password";
const FILE_PREFIX: &str = "NATIA-sauvegarde-";
const KEYCHAIN_MARKER: &str = "__keychain__";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BackupConfig {
    pub enabled: bool,
    pub dir: String,
    /// "daily" ou "weekly".
    pub frequency: String,
    /// Nombre de sauvegardes gardées dans le dossier.
    pub keep: u32,
    /// Mot de passe de l'archive (AES-256) ; vide = archive non protégée.
    pub password: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BackupFile {
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct BackupStatus {
    /// Dernière sauvegarde réussie (RFC 3339).
    pub last: Option<String>,
    /// Dernière erreur, effacée par une sauvegarde réussie.
    pub error: Option<String>,
}

type Key = Option<[u8; 32]>;

fn get(db: &Connection, key: &Key, name: &str) -> Option<String> {
    db.query_row("SELECT value FROM settings WHERE key=?1", [name], |r| r.get::<_, String>(0))
        .ok()
        .map(|raw| maybe_dec(key, &raw))
}

fn put(db: &Connection, key: &Key, name: &str, value: &str) -> Result<(), String> {
    db.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
        params![name, maybe_enc(key, value)],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Sans mot de passe NATIA, le mot de passe des sauvegardes va dans le coffre de Windows,
/// comme les clés API ; avec, il est chiffré dans la base.
fn read_password(db: &Connection, key: &Key) -> String {
    match get(db, key, BACKUP_PASSWORD_NAME) {
        Some(v) if v != KEYCHAIN_MARKER => v,
        _ => keychain_get(BACKUP_PASSWORD_NAME).unwrap_or_default(),
    }
}

fn write_password(db: &Connection, key: &Key, password: &str) -> Result<(), String> {
    if key.is_none() {
        keychain_set(BACKUP_PASSWORD_NAME, password)?;
        put(db, key, BACKUP_PASSWORD_NAME, KEYCHAIN_MARKER)
    } else {
        let _ = keychain_set(BACKUP_PASSWORD_NAME, "");
        put(db, key, BACKUP_PASSWORD_NAME, password)
    }
}

fn read_config(db: &Connection, key: &Key) -> BackupConfig {
    BackupConfig {
        enabled: get(db, key, "backup_enabled").as_deref() == Some("true"),
        dir: get(db, key, "backup_dir").unwrap_or_default(),
        frequency: get(db, key, "backup_frequency").filter(|f| f == "weekly").unwrap_or_else(|| "daily".to_string()),
        keep: get(db, key, "backup_keep").and_then(|k| k.parse().ok()).unwrap_or(7),
        password: read_password(db, key),
    }
}

fn read_status(db: &Connection, key: &Key) -> BackupStatus {
    BackupStatus {
        last: get(db, key, "backup_last").filter(|s| !s.is_empty()),
        error: get(db, key, "backup_error").filter(|s| !s.is_empty()),
    }
}

fn interval(frequency: &str) -> chrono::Duration {
    if frequency == "weekly" { chrono::Duration::days(7) } else { chrono::Duration::days(1) }
}

/// Une sauvegarde est-elle due ? Jamais faite, ou plus ancienne que l'intervalle.
fn is_due(last: Option<&str>, frequency: &str, now: DateTime<Utc>) -> bool {
    match last.and_then(|l| DateTime::parse_from_rfc3339(l).ok()) {
        Some(l) => now.signed_duration_since(l.with_timezone(&Utc)) >= interval(frequency),
        None => true,
    }
}

fn validate(config: &BackupConfig, app_protected: bool) -> Result<(), String> {
    if config.dir.trim().is_empty() {
        return Err("Choisissez le dossier des sauvegardes".to_string());
    }
    if !(1..=100).contains(&config.keep) {
        return Err("Nombre de sauvegardes gardées : entre 1 et 100".to_string());
    }
    if !config.password.is_empty() && config.password.chars().count() < 8 {
        return Err("Mot de passe des sauvegardes : 8 caractères minimum".to_string());
    }
    // Les notes chiffrées seraient sinon copiées en clair hors de NATIA.
    if app_protected && config.password.is_empty() {
        return Err("Vos notes sont protégées par un mot de passe : protégez aussi les sauvegardes".to_string());
    }
    Ok(())
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with(FILE_PREFIX) && name.ends_with(".zip") && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

/// Sauvegardes de NATIA présentes dans le dossier, de la plus ancienne à la plus récente
/// (les noms datés se trient dans l'ordre).
fn backup_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.file_name().and_then(|n| n.to_str()).is_some_and(is_backup_name))
        .collect();
    files.sort();
    Ok(files)
}

/// Supprime les plus anciennes sauvegardes de NATIA du dossier au-delà de `keep`.
/// Seuls les fichiers nommés par NATIA sont concernés.
fn prune(dir: &Path, keep: u32) -> Result<(), String> {
    let files = backup_files(dir)?;
    let excess = files.len().saturating_sub(keep as usize);
    for f in &files[..excess] {
        let _ = std::fs::remove_file(f);
    }
    Ok(())
}

fn write_backup(state: &AppState, key: &Key, config: &BackupConfig) -> Result<PathBuf, String> {
    let dir = PathBuf::from(config.dir.trim());
    if !dir.is_dir() {
        return Err("Dossier des sauvegardes introuvable (disque ou clé USB débranché ?)".to_string());
    }
    let zip = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        build_notes_zip(&db, &state.notes_dir, key)?
    };
    let bytes = if config.password.is_empty() { zip } else { protect_zip(&zip, &config.password, Protection::Aes)? };
    let path = dir.join(format!("{}{}.zip", FILE_PREFIX, Local::now().format("%Y-%m-%d_%H%M%S")));
    // Écrit à côté puis renomme : une coupure ne laisse pas une archive tronquée sous un nom valide.
    let tmp = path.with_extension("zip.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    prune(&dir, config.keep)?;
    Ok(path)
}

#[tauri::command]
pub fn get_backup_config(state: State<AppState>) -> Result<(BackupConfig, BackupStatus), String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok((read_config(&db, &key), read_status(&db, &key)))
}

#[tauri::command]
pub fn set_backup_config(config: BackupConfig, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    if config.enabled { validate(&config, key.is_some())?; }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    put(&db, &key, "backup_enabled", if config.enabled { "true" } else { "false" })?;
    put(&db, &key, "backup_dir", config.dir.trim())?;
    put(&db, &key, "backup_frequency", if config.frequency == "weekly" { "weekly" } else { "daily" })?;
    put(&db, &key, "backup_keep", &config.keep.to_string())?;
    write_password(&db, &key, &config.password)
}

/// Fait la sauvegarde si elle est due (ou tout de suite avec `now: true`) et renvoie l'état.
#[tauri::command]
pub fn run_backup(now: bool, state: State<AppState>) -> Result<BackupStatus, String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let (config, status) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        (read_config(&db, &key), read_status(&db, &key))
    };
    if !now && (!config.enabled || !is_due(status.last.as_deref(), &config.frequency, Utc::now())) {
        return Ok(status);
    }
    let result = validate(&config, key.is_some()).and_then(|_| write_backup(&state, &key, &config));
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match result {
        Ok(_) => {
            put(&db, &key, "backup_last", &Utc::now().to_rfc3339())?;
            put(&db, &key, "backup_error", "")?;
        }
        Err(e) => put(&db, &key, "backup_error", &e)?,
    }
    Ok(read_status(&db, &key))
}

/// Sauvegardes du dossier choisi, de la plus récente à la plus ancienne.
#[tauri::command]
pub fn list_backups(state: State<AppState>) -> Result<Vec<BackupFile>, String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let dir = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        read_config(&db, &key).dir
    };
    let dir = PathBuf::from(dir.trim());
    if dir.as_os_str().is_empty() || !dir.is_dir() { return Ok(vec![]); }
    let mut files: Vec<BackupFile> = backup_files(&dir)?
        .into_iter()
        .filter_map(|p| Some(BackupFile {
            name: p.file_name()?.to_str()?.to_string(),
            size: std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
        }))
        .collect();
    files.reverse();
    Ok(files)
}

/// Réimporte une sauvegarde du dossier : les notes absentes reviennent, celles déjà
/// présentes ne sont pas remplacées. Sans `password`, celui des sauvegardes est essayé.
#[tauri::command]
pub fn restore_backup(name: String, password: Option<String>, state: State<AppState>) -> Result<ImportReport, String> {
    crate::require_unlocked(&state)?;
    if !is_backup_name(&name) { return Err("Nom de sauvegarde invalide".to_string()); }
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let config = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        read_config(&db, &key)
    };
    let path = PathBuf::from(config.dir.trim()).join(&name);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let password = password.filter(|p| !p.is_empty()).unwrap_or(config.password);
    let archive = unwrap_export(bytes, Some(password.as_str()).filter(|p| !p.is_empty()))?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    import_notes_in(&db, &state.notes_dir, &key, archive)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(dir: &str, password: &str) -> BackupConfig {
        BackupConfig { enabled: true, dir: dir.to_string(), frequency: "daily".to_string(), keep: 3, password: password.to_string() }
    }

    #[test]
    fn due_after_interval() {
        let now = Utc::now();
        assert!(is_due(None, "daily", now));
        let hours_ago = |h: i64| (now - chrono::Duration::hours(h)).to_rfc3339();
        assert!(!is_due(Some(&hours_ago(23)), "daily", now));
        assert!(is_due(Some(&hours_ago(25)), "daily", now));
        assert!(!is_due(Some(&hours_ago(25)), "weekly", now));
        assert!(is_due(Some(&hours_ago(24 * 7 + 1)), "weekly", now));
        assert!(is_due(Some("pas une date"), "daily", now));
    }

    #[test]
    fn protected_notes_need_protected_backups() {
        assert!(validate(&config("C:\\Sauvegardes", ""), false).is_ok());
        assert!(validate(&config("C:\\Sauvegardes", ""), true).is_err());
        assert!(validate(&config("C:\\Sauvegardes", "court"), true).is_err());
        assert!(validate(&config("C:\\Sauvegardes", "un-long-mot-de-passe"), true).is_ok());
        assert!(validate(&config("  ", "un-long-mot-de-passe"), false).is_err());
    }

    #[test]
    fn backup_names_cannot_leave_the_folder() {
        assert!(is_backup_name("NATIA-sauvegarde-2026-10-23_080000.zip"));
        assert!(!is_backup_name("NATIA-sauvegarde-../../secret.zip"));
        assert!(!is_backup_name("NATIA-sauvegarde-x\\..\\a.zip"));
        assert!(!is_backup_name("NATIA-sauvegarde-C:a.zip"));
        assert!(!is_backup_name("photo.zip"));
    }

    #[test]
    fn prune_keeps_newest_natia_files_only() {
        let dir = std::env::temp_dir().join(format!("natia-backup-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for d in ["2026-10-01_080000", "2026-10-02_080000", "2026-10-03_080000", "2026-10-04_080000"] {
            std::fs::write(dir.join(format!("{FILE_PREFIX}{d}.zip")), b"x").unwrap();
        }
        std::fs::write(dir.join("photo-perso.zip"), b"x").unwrap();
        prune(&dir, 2).unwrap();
        let mut left: Vec<String> = std::fs::read_dir(&dir).unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        left.sort();
        assert_eq!(left, vec![
            format!("{FILE_PREFIX}2026-10-03_080000.zip"),
            format!("{FILE_PREFIX}2026-10-04_080000.zip"),
            "photo-perso.zip".to_string(),
        ]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
