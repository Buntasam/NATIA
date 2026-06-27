use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;
use std::process::Command;

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

pub(crate) fn git_run(notes_dir: &PathBuf, args: &[&str]) -> String {
    Command::new("git")
        .args(args)
        .current_dir(notes_dir)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

pub(crate) fn init_git(notes_dir: &PathBuf) {
    let git_dir = notes_dir.join(".git");
    if !git_dir.exists() {
        git_run(notes_dir, &["init"]);
        git_run(notes_dir, &["config", "user.email", "natia@local"]);
        git_run(notes_dir, &["config", "user.name", "NATIA"]);
    }
}

pub(crate) fn git_commit_note(notes_dir: &PathBuf, note_id: &str, message: &str) {
    let file = format!("{}.html", note_id);
    git_run(notes_dir, &["add", &file]);
    git_run(notes_dir, &["commit", "-m", message, "--allow-empty"]);
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
        params![id, note_id, maybe_enc(key, content_plain), message, now],
    )?;
    db.execute(
        "DELETE FROM note_versions WHERE note_id=?1 AND id NOT IN (
            SELECT id FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 200
        )",
        [note_id],
    )?;
    Ok(())
}
