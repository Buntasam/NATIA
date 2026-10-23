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

/// Secret Argon2 qui lie le mot de passe à la session Windows (voir settings.rs).
pub(crate) const DEVICE_SECRET_NAME: &str = "device_secret";

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
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id);
        CREATE TABLE IF NOT EXISTS sync_notes (
            note_id TEXT PRIMARY KEY,
            base_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_attachments (
            id TEXT PRIMARY KEY
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
    // Début de la « session » d'une version automatique (NULL pour une version nommée).
    let _ = db.execute("ALTER TABLE note_versions ADD COLUMN session_start TEXT", []);
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

/// Durée pendant laquelle les enregistrements automatiques d'une note
/// mettent à jour la même version au lieu d'en créer une nouvelle.
const VERSION_SESSION_SECS: i64 = 5 * 60;

fn secs_between(start: &str, now: &str) -> Option<i64> {
    let a = chrono::DateTime::parse_from_rfc3339(start).ok()?;
    let b = chrono::DateTime::parse_from_rfc3339(now).ok()?;
    Some((b - a).num_seconds())
}

/// `coalesce` : enregistrement automatique. Pendant 5 min, il remplace la
/// dernière version automatique au lieu d'en ajouter une, pour que les
/// 200 versions couvrent des jours d'historique et non quelques minutes.
/// Les versions nommées (IA, restauration, import) ne sont jamais remplacées.
pub(crate) fn save_version_inner(
    db: &Connection,
    note_id: &str,
    content_plain: &str,
    message: &str,
    now: &str,
    key: &Option<[u8; 32]>,
    coalesce: bool,
) -> SqlResult<()> {
    let last: Option<(String, String, Option<String>)> = db.query_row(
        "SELECT id, content, session_start FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 1",
        [note_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).ok();
    if let Some((last_id, raw, session_start)) = last {
        use crate::crypto::maybe_dec;
        if maybe_dec(key, &raw) == content_plain {
            return Ok(());
        }
        let same_session = session_start
            .and_then(|s| secs_between(&s, now))
            .is_some_and(|d| (0..VERSION_SESSION_SECS).contains(&d));
        if coalesce && same_session {
            db.execute(
                "UPDATE note_versions SET content=?1, message=?2, created_at=?3 WHERE id=?4",
                params![maybe_enc(key, content_plain), maybe_enc(key, message), now, last_id],
            )?;
            return Ok(());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO note_versions(id, note_id, content, message, created_at, session_start) VALUES(?1,?2,?3,?4,?5,?6)",
        params![id, note_id, maybe_enc(key, content_plain), maybe_enc(key, message), now, coalesce.then_some(now)],
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
    use super::*;

    fn versions(db: &Connection) -> Vec<(String, String)> {
        let mut s = db.prepare("SELECT content, created_at FROM note_versions ORDER BY created_at").unwrap();
        s.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn autosaves_are_grouped_by_five_minutes_and_named_versions_are_kept() {
        let db = Connection::open_in_memory().unwrap();
        init_db(&db).unwrap();
        let t = |m: u32, s: u32| format!("2026-01-01T10:{:02}:{:02}+00:00", m, s);
        let save = |c: &str, now: &str, auto: bool| save_version_inner(&db, "n", c, "msg", now, &None, auto).unwrap();

        save("a", &t(0, 0), true);
        save("ab", &t(0, 2), true);
        save("abc", &t(4, 59), true);
        assert_eq!(versions(&db), [("abc".to_string(), t(4, 59))], "même session : une seule version, la plus récente");

        save("abcd", &t(5, 0), true);
        assert_eq!(versions(&db).len(), 2, "5 min après le début de la session : nouvelle version");

        save("IA", &t(5, 10), false);
        save("IA+", &t(5, 20), true);
        let v = versions(&db);
        assert_eq!(v.len(), 4, "une version nommée n'est jamais remplacée");
        assert_eq!(v[2].0, "IA");

        save("IA+", &t(5, 30), true);
        assert_eq!(versions(&db).len(), 4, "contenu identique : rien n'est ajouté");
    }

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
