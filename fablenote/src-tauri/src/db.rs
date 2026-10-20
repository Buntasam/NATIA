use rusqlite::{Connection, Result as SqlResult, params};
use std::path::Path;

use crate::crypto::maybe_enc;

const KEYCHAIN_SERVICE: &str = "com.natia.app";
pub(crate) const API_KEY_NAMES: &[&str] = &[
    "claude_api_key",
    "openai_api_key",
    "gemini_api_key",
    "mistral_api_key",
];

pub(crate) fn keychain_get(key_name: &str) -> Option<String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, key_name)
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

pub(crate) fn keychain_set(key_name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, key_name)
        .map_err(|e| format!("Keychain: {}", e))?;
    if value.is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(value).map_err(|e| format!("Keychain: {}", e))?;
    }
    Ok(())
}

pub(crate) fn init_db(db: &Connection) -> SqlResult<()> {
    db.execute_batch(
        "
        PRAGMA secure_delete = ON;
        CREATE TABLE IF NOT EXISTS user_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            folder TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS folders (
            path TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS item_colors (
            item_key TEXT PRIMARY KEY,
            color TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT '',
            key_value TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6366f1'
        );
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id TEXT PRIMARY KEY,
            prompt_key TEXT NOT NULL,
            value TEXT NOT NULL,
            saved_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS note_versions (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            content TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_nv_note ON note_versions(note_id, created_at DESC);
        ",
    )?;
    let _ = db.execute("ALTER TABLE notes ADD COLUMN deleted_at TEXT", []);
    let _ = db.execute("ALTER TABLE folders ADD COLUMN deleted_at TEXT", []);
    let _ = db.execute("ALTER TABLE api_keys ADD COLUMN model TEXT NOT NULL DEFAULT ''", []);
    Ok(())
}

/// Les anciennes versions de NATIA versionnaient les notes dans un dépôt Git
/// jamais relu, qui gardait des copies en clair : on le supprime s'il existe.
pub(crate) fn remove_legacy_git(notes_dir: &Path) {
    let git_dir = notes_dir.join(".git");
    if !git_dir.exists() { return; }
    // Git marque ses objets en lecture seule, ce qui bloque la suppression sous Windows.
    clear_readonly(&git_dir);
    if let Err(e) = std::fs::remove_dir_all(&git_dir) {
        eprintln!("Suppression de l'ancien dépôt Git impossible : {}", e);
    }
}

fn clear_readonly(path: &Path) {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        let mut perms = meta.permissions();
        if perms.readonly() {
            #[allow(clippy::permissions_set_readonly_false)]
            perms.set_readonly(false);
            let _ = std::fs::set_permissions(path, perms);
        }
        if meta.is_dir() {
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    clear_readonly(&entry.path());
                }
            }
        }
    }
}

/// (clé brute en base, clé en clair, couleur)
pub(crate) fn load_color_rows(db: &Connection, key: &Option<[u8; 32]>) -> Result<Vec<(String, String, String)>, String> {
    use crate::crypto::maybe_dec;
    let mut s = db.prepare("SELECT item_key, color FROM item_colors").map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(raw, c)| { let p = maybe_dec(key, &raw); (raw, p, c) }).collect())
}

pub(crate) fn delete_color_where(db: &Connection, key: &Option<[u8; 32]>, pred: impl Fn(&str) -> bool) -> Result<(), String> {
    for (raw, plain, _) in load_color_rows(db, key)? {
        if pred(&plain) {
            db.execute("DELETE FROM item_colors WHERE item_key=?1", [&raw]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn upsert_color(db: &Connection, key: &Option<[u8; 32]>, item_key: &str, color: &str) -> Result<(), String> {
    delete_color_where(db, key, |k| k == item_key)?;
    db.execute(
        "INSERT OR REPLACE INTO item_colors(item_key,color) VALUES(?1,?2)",
        params![maybe_enc(key, item_key), color],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn save_version_inner(
    db: &Connection,
    note_id: &str,
    content_plain: &str,
    message: &str,
    now: &str,
    key: &Option<[u8; 32]>,
) -> SqlResult<()> {
    let last_raw: Option<String> = db.query_row(
        "SELECT content FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 1",
        [note_id],
        |r| r.get(0),
    ).ok();
    if let Some(raw) = last_raw {
        use crate::crypto::maybe_dec;
        let last_plain = maybe_dec(key, &raw);
        if last_plain == content_plain {
            return Ok(());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO note_versions(id, note_id, content, message, created_at) VALUES(?1,?2,?3,?4,?5)",
        params![id, note_id, maybe_enc(key, content_plain), maybe_enc(key, message), now],
    )?;
    db.execute(
        "DELETE FROM note_versions WHERE note_id=?1 AND id NOT IN (
            SELECT id FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 200
        )",
        [note_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn remove_legacy_git_handles_readonly_objects() {
        let dir = std::env::temp_dir().join(format!("natia-git-{}", uuid::Uuid::new_v4()));
        let obj = dir.join(".git").join("objects").join("ab");
        std::fs::create_dir_all(&obj).unwrap();
        let f = obj.join("cdef");
        std::fs::write(&f, "blob en clair").unwrap();
        let mut p = std::fs::metadata(&f).unwrap().permissions();
        p.set_readonly(true);
        std::fs::set_permissions(&f, p).unwrap();
        std::fs::write(dir.join("note.html"), "garde-moi").unwrap();

        super::remove_legacy_git(&dir);

        assert!(!dir.join(".git").exists());
        assert!(dir.join("note.html").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
