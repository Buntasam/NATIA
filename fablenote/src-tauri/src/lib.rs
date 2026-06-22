use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm,
};
use argon2::{Algorithm, Argon2, Params, Version as Argon2Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use rand::RngCore;
use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Theme};
use uuid::Uuid;

// ─── Encryption constants ─────────────────────────────────────────────────────

const ENC_PREFIX: &str = "ENC:v1:";
const ARGON2_MEM_KB: u32 = 19456;
const ARGON2_TIME: u32 = 2;
const ARGON2_PARALLEL: u32 = 1;
const DERIVED_LEN: usize = 64; // [0..32] = verif hash, [32..64] = enc key

// ─── App state ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub db: Mutex<Connection>,
    pub notes_dir: PathBuf,
    pub enc_key: Mutex<Option<[u8; 32]>>,
}

// ─── Data structs ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteMetadata {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub folder: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub folder: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Version {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub date: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub default_model: String,
    pub ollama_url: String,
    pub global_shadow_prompt: String,
    pub correct_prompt: String,
    pub summary_prompt: String,
    pub rename_prompt: String,
    pub sort_prompt: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
}

fn default_temperature() -> f64 { 0.7 }

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_model: "gemma3:1b".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            global_shadow_prompt: "Tu es un assistant de prise de notes, précis et concis. Réponds toujours en français.".to_string(),
            correct_prompt: "Corrige les fautes de grammaire et d'orthographe. Réponds uniquement avec le texte corrigé, sans explication :".to_string(),
            summary_prompt: "Résume en 2-3 phrases en français :".to_string(),
            rename_prompt: "Propose un titre court (5 mots max) en français. Réponds uniquement avec le titre :".to_string(),
            sort_prompt: "Organise ces notes par sujet. Utilise des sous-dossiers avec / si utile (ex: Travail/Projets). Réponds UNIQUEMENT avec du JSON valide, sans texte autour : [{\"id\":\"...\",\"folder\":\"NomDossier\"}]".to_string(),
            temperature: 0.7,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptVersion {
    pub id: String,
    pub prompt_key: String,
    pub value: String,
    pub saved_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub key_value: String,
    pub color: String,
}

// ─── Database init ────────────────────────────────────────────────────────────

fn init_db(db: &Connection) -> SqlResult<()> {
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
    Ok(())
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

fn git_run(notes_dir: &PathBuf, args: &[&str]) -> String {
    Command::new("git")
        .args(args)
        .current_dir(notes_dir)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

fn init_git(notes_dir: &PathBuf) {
    let git_dir = notes_dir.join(".git");
    if !git_dir.exists() {
        git_run(notes_dir, &["init"]);
        git_run(notes_dir, &["config", "user.email", "natia@local"]);
        git_run(notes_dir, &["config", "user.name", "NATIA"]);
    }
}

fn git_commit_note(notes_dir: &PathBuf, note_id: &str, message: &str) {
    let file = format!("{}.html", note_id);
    git_run(notes_dir, &["add", &file]);
    git_run(notes_dir, &["commit", "-m", message, "--allow-empty"]);
}

// ─── SQLite version helpers ───────────────────────────────────────────────────

fn save_version_inner(
    db: &Connection,
    note_id: &str,
    content_plain: &str,
    message: &str,
    now: &str,
    key: &Option<[u8; 32]>,
) -> SqlResult<()> {
    // Skip if content unchanged from last version
    let last_raw: Option<String> = db.query_row(
        "SELECT content FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 1",
        [note_id],
        |r| r.get(0),
    ).ok();
    if let Some(raw) = last_raw {
        let last_plain = maybe_dec(key, &raw);
        if last_plain == content_plain {
            return Ok(());
        }
    }
    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO note_versions(id, note_id, content, message, created_at) VALUES(?1,?2,?3,?4,?5)",
        params![id, note_id, maybe_enc(key, content_plain), message, now],
    )?;
    // Keep max 200 versions per note in DB (UI can apply stricter limit)
    db.execute(
        "DELETE FROM note_versions WHERE note_id=?1 AND id NOT IN (
            SELECT id FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 200
        )",
        [note_id],
    )?;
    Ok(())
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/// Derive 64 bytes from password+salt.
/// [0..32] = verification hash, [32..64] = encryption key.
fn derive_64(password: &str, salt: &[u8]) -> Result<[u8; DERIVED_LEN], String> {
    let params = Params::new(ARGON2_MEM_KB, ARGON2_TIME, ARGON2_PARALLEL, Some(DERIVED_LEN))
        .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Argon2Version::V0x13, params);
    let mut out = [0u8; DERIVED_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

fn encrypt_value(key: &[u8; 32], plaintext: &str) -> String {
    let cipher = Aes256Gcm::new_from_slice(key).expect("32-byte key");
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .expect("encryption failure");
    format!(
        "{}{}:{}",
        ENC_PREFIX,
        B64.encode(nonce.as_slice()),
        B64.encode(&ct)
    )
}

fn decrypt_value(key: &[u8; 32], encoded: &str) -> Result<String, String> {
    if !encoded.starts_with(ENC_PREFIX) {
        return Ok(encoded.to_string());
    }
    let data = &encoded[ENC_PREFIX.len()..];
    let mut parts = data.splitn(2, ':');
    let nonce_b64 = parts.next().ok_or("bad format")?;
    let ct_b64 = parts.next().ok_or("bad format")?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    let ct = B64.decode(ct_b64).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new_from_slice(key).expect("32-byte key");
    let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
    let plain = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "Déchiffrement échoué — mot de passe incorrect ?".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

fn maybe_dec(key: &Option<[u8; 32]>, s: &str) -> String {
    match key {
        Some(k) => decrypt_value(k, s).unwrap_or_else(|_| s.to_string()),
        None => s.to_string(),
    }
}

fn maybe_enc(key: &Option<[u8; 32]>, s: &str) -> String {
    match key {
        Some(k) => encrypt_value(k, s),
        None => s.to_string(),
    }
}

// ─── Migration helpers ────────────────────────────────────────────────────────

fn sanitize_name(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect()
}

#[tauri::command]
fn export_zip(state: State<AppState>) -> Result<String, String> {
    use std::io::Write;
    use zip::write::FileOptions;

    let enc_key: Option<[u8; 32]> = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let notes_dir = state.notes_dir.clone();

    // Collect all note rows while holding DB lock
    let rows = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        collect_notes_export(&db)?
    };

    let cursor = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut metadata_entries: Vec<serde_json::Value> = Vec::new();

    for (id, title, tags, folder, created_at, updated_at) in &rows {
        let title_dec = maybe_dec(&enc_key, title);
        let tags_dec = maybe_dec(&enc_key, tags);

        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else {
            String::new()
        };

        let safe_title = sanitize_name(&title_dec);
        let zip_path = match folder {
            Some(f) => format!("notes/{}/{}.html", f, safe_title),
            None => format!("notes/{}.html", safe_title),
        };

        zip.start_file(&zip_path, options).map_err(|e| e.to_string())?;
        zip.write_all(content.as_bytes()).map_err(|e| e.to_string())?;

        metadata_entries.push(serde_json::json!({
            "id": id,
            "title": title_dec,
            "tags": tags_dec,
            "folder": folder,
            "created_at": created_at,
            "updated_at": updated_at,
        }));
    }

    zip.start_file("metadata.json", options).map_err(|e| e.to_string())?;
    let meta_str = serde_json::to_string_pretty(&metadata_entries).map_err(|e| e.to_string())?;
    zip.write_all(meta_str.as_bytes()).map_err(|e| e.to_string())?;

    let finished = zip.finish().map_err(|e| e.to_string())?;
    Ok(B64.encode(finished.into_inner()))
}

#[tauri::command]
fn save_zip_to_path(path: String, state: State<AppState>) -> Result<(), String> {
    use std::io::Write;
    use zip::write::FileOptions;

    let enc_key: Option<[u8; 32]> = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let notes_dir = state.notes_dir.clone();
    let rows = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        collect_notes_export(&db)?
    };

    let cursor = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut metadata_entries: Vec<serde_json::Value> = Vec::new();

    for (id, title, tags, folder, created_at, updated_at) in &rows {
        let title_dec = maybe_dec(&enc_key, title);
        let tags_dec = maybe_dec(&enc_key, tags);
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else {
            String::new()
        };
        let safe_title = sanitize_name(&title_dec);
        let zip_path = match folder {
            Some(f) => format!("notes/{}/{}.html", f, safe_title),
            None => format!("notes/{}.html", safe_title),
        };
        zip.start_file(&zip_path, options).map_err(|e| e.to_string())?;
        zip.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        metadata_entries.push(serde_json::json!({
            "id": id, "title": title_dec, "tags": tags_dec,
            "folder": folder, "created_at": created_at, "updated_at": updated_at,
        }));
    }

    zip.start_file("metadata.json", options).map_err(|e| e.to_string())?;
    let meta_str = serde_json::to_string_pretty(&metadata_entries).map_err(|e| e.to_string())?;
    zip.write_all(meta_str.as_bytes()).map_err(|e| e.to_string())?;

    let finished = zip.finish().map_err(|e| e.to_string())?;
    std::fs::write(&path, finished.into_inner()).map_err(|e| e.to_string())?;
    Ok(())
}

fn collect_notes_export(db: &Connection) -> Result<Vec<(String, String, String, Option<String>, String, String)>, String> {
    let mut s = db.prepare(
        "SELECT id, title, tags, folder, created_at, updated_at FROM notes ORDER BY folder, title"
    ).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((
        r.get::<_, String>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, Option<String>>(3)?,
        r.get::<_, String>(4)?,
        r.get::<_, String>(5)?,
    )))
    .map_err(|e| e.to_string())?
    .collect::<SqlResult<Vec<_>>>()
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn collect_rows2(db: &Connection, sql: &str) -> Result<Vec<(String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn collect_rows3(db: &Connection, sql: &str) -> Result<Vec<(String, String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn collect_rows4(db: &Connection, sql: &str) -> Result<Vec<(String, String, String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn encrypt_all_data(db: &Connection, notes_dir: &PathBuf, key: &[u8; 32]) -> Result<(), String> {
    for (id, title, tags) in collect_rows3(db, "SELECT id, title, tags FROM notes")? {
        if !title.starts_with(ENC_PREFIX) {
            db.execute(
                "UPDATE notes SET title=?1, tags=?2 WHERE id=?3",
                params![encrypt_value(key, &title), encrypt_value(key, &tags), id],
            ).map_err(|e| e.to_string())?;
        }
        let fp = notes_dir.join(format!("{}.html", id));
        if fp.exists() {
            let content = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            if !content.starts_with(ENC_PREFIX) {
                std::fs::write(&fp, encrypt_value(key, &content)).map_err(|e| e.to_string())?;
            }
        }
    }

    for (id, name, prov, kv) in collect_rows4(db, "SELECT id, name, provider, key_value FROM api_keys")? {
        if !kv.starts_with(ENC_PREFIX) {
            db.execute(
                "UPDATE api_keys SET name=?1, provider=?2, key_value=?3 WHERE id=?4",
                params![encrypt_value(key, &name), encrypt_value(key, &prov), encrypt_value(key, &kv), id],
            ).map_err(|e| e.to_string())?;
        }
    }

    for (k, v) in collect_rows2(db, "SELECT key, value FROM settings")? {
        if !v.starts_with(ENC_PREFIX) {
            db.execute("UPDATE settings SET value=?1 WHERE key=?2", params![encrypt_value(key, &v), k])
                .map_err(|e| e.to_string())?;
        }
    }

    for (id, v) in collect_rows2(db, "SELECT id, value FROM prompt_versions")? {
        if !v.starts_with(ENC_PREFIX) {
            db.execute("UPDATE prompt_versions SET value=?1 WHERE id=?2", params![encrypt_value(key, &v), id])
                .map_err(|e| e.to_string())?;
        }
    }

    for (id, c) in collect_rows2(db, "SELECT id, content FROM note_versions")? {
        if !c.starts_with(ENC_PREFIX) {
            db.execute("UPDATE note_versions SET content=?1 WHERE id=?2", params![encrypt_value(key, &c), id])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn decrypt_all_data(db: &Connection, notes_dir: &PathBuf, key: &[u8; 32]) -> Result<(), String> {
    for (id, title, tags) in collect_rows3(db, "SELECT id, title, tags FROM notes")? {
        let pt = if title.starts_with(ENC_PREFIX) { decrypt_value(key, &title)? } else { title };
        let tg = if tags.starts_with(ENC_PREFIX) { decrypt_value(key, &tags)? } else { tags };
        db.execute("UPDATE notes SET title=?1, tags=?2 WHERE id=?3", params![pt, tg, id])
            .map_err(|e| e.to_string())?;
        let fp = notes_dir.join(format!("{}.html", id));
        if fp.exists() {
            let content = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            if content.starts_with(ENC_PREFIX) {
                std::fs::write(&fp, decrypt_value(key, &content)?).map_err(|e| e.to_string())?;
            }
        }
    }

    for (id, name, prov, kv) in collect_rows4(db, "SELECT id, name, provider, key_value FROM api_keys")? {
        let pn = if name.starts_with(ENC_PREFIX) { decrypt_value(key, &name)? } else { name };
        let pp = if prov.starts_with(ENC_PREFIX) { decrypt_value(key, &prov)? } else { prov };
        let pk = if kv.starts_with(ENC_PREFIX) { decrypt_value(key, &kv)? } else { kv };
        db.execute("UPDATE api_keys SET name=?1, provider=?2, key_value=?3 WHERE id=?4", params![pn, pp, pk, id])
            .map_err(|e| e.to_string())?;
    }

    for (k, v) in collect_rows2(db, "SELECT key, value FROM settings")? {
        let pv = if v.starts_with(ENC_PREFIX) { decrypt_value(key, &v)? } else { v };
        db.execute("UPDATE settings SET value=?1 WHERE key=?2", params![pv, k])
            .map_err(|e| e.to_string())?;
    }

    for (id, v) in collect_rows2(db, "SELECT id, value FROM prompt_versions")? {
        let pv = if v.starts_with(ENC_PREFIX) { decrypt_value(key, &v)? } else { v };
        db.execute("UPDATE prompt_versions SET value=?1 WHERE id=?2", params![pv, id])
            .map_err(|e| e.to_string())?;
    }

    for (id, c) in collect_rows2(db, "SELECT id, content FROM note_versions")? {
        let pc = if c.starts_with(ENC_PREFIX) { decrypt_value(key, &c)? } else { c };
        db.execute("UPDATE note_versions SET content=?1 WHERE id=?2", params![pc, id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ─── Security commands ────────────────────────────────────────────────────────

#[tauri::command]
fn has_password(state: State<AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let exists: bool = db
        .query_row(
            "SELECT 1 FROM app_config WHERE key='password_hash' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);
    Ok(exists)
}

#[tauri::command]
fn get_password_type(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let pw_type = db
        .query_row(
            "SELECT value FROM app_config WHERE key='password_type'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "alpha".to_string());
    Ok(pw_type)
}

#[tauri::command]
fn setup_password(
    password: String,
    pw_type: String,
    state: State<AppState>,
) -> Result<(), String> {
    // Generate salt
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let salt_b64 = B64.encode(&salt);

    // Derive 64 bytes
    let derived = derive_64(&password, &salt)?;
    let verif_b64 = B64.encode(&derived[..32]);
    let mut enc_key = [0u8; 32];
    enc_key.copy_from_slice(&derived[32..]);

    // Store credentials
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (k, v) in [
            ("password_salt", salt_b64.as_str()),
            ("password_hash", verif_b64.as_str()),
            ("password_type", pw_type.as_str()),
        ] {
            db.execute(
                "INSERT INTO app_config(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![k, v],
            )
            .map_err(|e| e.to_string())?;
        }

        // Migrate existing plaintext data
        let notes_dir = state.notes_dir.clone();
        encrypt_all_data(&db, &notes_dir, &enc_key)?;
    }

    // Activate key in memory
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(enc_key);

    Ok(())
}

#[tauri::command]
fn verify_password(password: String, state: State<AppState>) -> Result<bool, String> {
    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let salt = db
            .query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0))
            .map_err(|_| "Aucune donnée de sécurité trouvée".to_string())?;
        let verif = db
            .query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0))
            .map_err(|_| "Aucune donnée de sécurité trouvée".to_string())?;
        (salt, verif)
    };

    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let derived = derive_64(&password, &salt)?;

    // Constant-time comparison of verification hashes
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    if stored.len() != 32 {
        return Err("Hash corrompu".to_string());
    }
    let mut diff = 0u8;
    for (a, b) in derived[..32].iter().zip(stored.iter()) {
        diff |= a ^ b;
    }

    if diff != 0 {
        return Ok(false);
    }

    // Load key into memory
    let mut enc_key = [0u8; 32];
    enc_key.copy_from_slice(&derived[32..]);
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(enc_key);

    Ok(true)
}

#[tauri::command]
fn change_password(
    old_pass: String,
    new_pass: String,
    state: State<AppState>,
) -> Result<(), String> {
    // Verify old password and get old key
    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let s = db.query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let v = db.query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        (s, v)
    };

    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let old_derived = derive_64(&old_pass, &salt)?;
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    let mut diff = 0u8;
    for (a, b) in old_derived[..32].iter().zip(stored.iter()) {
        diff |= a ^ b;
    }
    if diff != 0 {
        return Err("Ancien mot de passe incorrect".to_string());
    }

    let mut old_key = [0u8; 32];
    old_key.copy_from_slice(&old_derived[32..]);

    // New key
    let mut new_salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut new_salt);
    let new_salt_b64 = B64.encode(&new_salt);
    let new_derived = derive_64(&new_pass, &new_salt)?;
    let new_verif_b64 = B64.encode(&new_derived[..32]);
    let mut new_key = [0u8; 32];
    new_key.copy_from_slice(&new_derived[32..]);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let notes_dir = state.notes_dir.clone();

        // Decrypt with old, re-encrypt with new
        decrypt_all_data(&db, &notes_dir, &old_key)?;
        encrypt_all_data(&db, &notes_dir, &new_key)?;

        // Update credentials
        db.execute("UPDATE app_config SET value=?1 WHERE key='password_salt'", [&new_salt_b64]).map_err(|e| e.to_string())?;
        db.execute("UPDATE app_config SET value=?1 WHERE key='password_hash'", [&new_verif_b64]).map_err(|e| e.to_string())?;
    }

    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(new_key);

    Ok(())
}

#[tauri::command]
fn remove_password(password: String, state: State<AppState>) -> Result<(), String> {
    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let s = db.query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let v = db.query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        (s, v)
    };

    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let derived = derive_64(&password, &salt)?;
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    let mut diff = 0u8;
    for (a, b) in derived[..32].iter().zip(stored.iter()) {
        diff |= a ^ b;
    }
    if diff != 0 {
        return Err("Mot de passe incorrect".to_string());
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&derived[32..]);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let notes_dir = state.notes_dir.clone();
        decrypt_all_data(&db, &notes_dir, &key)?;
        db.execute("DELETE FROM app_config WHERE key IN ('password_salt','password_hash','password_type')", [])
            .map_err(|e| e.to_string())?;
    }

    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = None;

    Ok(())
}

#[tauri::command]
fn lock_app(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

// ─── Note commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_all_notes(state: State<AppState>) -> Result<Vec<NoteMetadata>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare("SELECT id, title, tags, folder, created_at, updated_at FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let notes = rows
        .into_iter()
        .map(|(id, raw_title, raw_tags, folder, created_at, updated_at)| {
            let title = maybe_dec(&key, &raw_title);
            let tags_str = maybe_dec(&key, &raw_tags);
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            NoteMetadata { id, title, tags, folder, created_at, updated_at }
        })
        .collect();

    Ok(notes)
}

#[tauri::command]
fn get_note(id: String, state: State<AppState>) -> Result<Note, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (raw_title, raw_tags, folder, created_at, updated_at) = db
        .query_row(
            "SELECT title, tags, folder, created_at, updated_at FROM notes WHERE id=?1",
            [&id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let title = maybe_dec(&key, &raw_title);
    let tags_str = maybe_dec(&key, &raw_tags);
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

    drop(db);

    let file_path = state.notes_dir.join(format!("{}.html", id));
    let raw_content = if file_path.exists() {
        std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let content = maybe_dec(&key, &raw_content);

    Ok(Note { id, title, content, tags, folder, created_at, updated_at })
}

#[tauri::command]
fn create_note(
    title: String,
    content: String,
    tags: Vec<String>,
    folder: Option<String>,
    state: State<AppState>,
) -> Result<Note, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO notes (id, title, tags, folder, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                id,
                maybe_enc(&key, &title),
                maybe_enc(&key, &tags_json),
                folder,
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
    git_commit_note(&state.notes_dir, &id, &format!("Créer : {}", title));

    Ok(Note { id, title, content, tags, folder, created_at: now.clone(), updated_at: now })
}

#[tauri::command]
fn update_note(
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    folder: Option<String>,
    label: Option<String>,
    state: State<AppState>,
) -> Result<Note, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE notes SET title=?1, tags=?2, folder=?3, updated_at=?4 WHERE id=?5",
            params![maybe_enc(&key, &title), maybe_enc(&key, &tags_json), folder, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
    // Keep git as optional backup (silently fails if git unavailable)
    git_commit_note(&state.notes_dir, &id, &format!("Modifier : {}", title));

    let created_at = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let ca = db.query_row("SELECT created_at FROM notes WHERE id=?1", [&id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let msg = label.unwrap_or_else(|| format!("Modifier : {}", title));
        save_version_inner(&db, &id, &content, &msg, &now, &key)
            .map_err(|e| e.to_string())?;
        ca
    };

    Ok(Note { id, title, content, tags, folder, created_at, updated_at: now })
}

#[tauri::command]
fn rename_note(id: String, title: String, state: State<AppState>) -> Result<(), String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE notes SET title=?1, updated_at=?2 WHERE id=?3",
        params![maybe_enc(&key, &title), now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM notes WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM item_colors WHERE item_key=?1", [&format!("note:{}", id)])
            .map_err(|e| e.to_string())?;
    }
    let fp = state.notes_dir.join(format!("{}.html", id));
    if fp.exists() {
        std::fs::remove_file(&fp).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Version commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn trim_note_versions(note_id: String, keep: i64, state: State<AppState>) -> Result<(), String> {
    if keep <= 0 { return Ok(()); } // 0 or negative = unlimited
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM note_versions WHERE note_id=?1 AND id NOT IN (
            SELECT id FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT ?2
        )",
        params![note_id, keep],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_versions(note_id: String, state: State<AppState>) -> Result<Vec<Version>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, message, created_at FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let versions = stmt
        .query_map([&note_id], |row| {
            let id: String = row.get(0)?;
            let short = id[..8.min(id.len())].to_string();
            Ok(Version {
                hash: id,
                short_hash: short,
                message: row.get(1)?,
                date: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(versions)
}

#[tauri::command]
fn get_version_content(note_id: String, hash: String, state: State<AppState>) -> Result<String, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let raw: String = db.query_row(
        "SELECT content FROM note_versions WHERE id=?1 AND note_id=?2",
        params![hash, note_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    Ok(maybe_dec(&key, &raw))
}

#[tauri::command]
fn restore_version(note_id: String, hash: String, state: State<AppState>) -> Result<Note, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();

    let plain_content = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let raw: String = db.query_row(
            "SELECT content FROM note_versions WHERE id=?1 AND note_id=?2",
            params![hash, note_id],
            |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        maybe_dec(&key, &raw)
    };

    let fp = state.notes_dir.join(format!("{}.html", note_id));
    std::fs::write(&fp, maybe_enc(&key, &plain_content)).map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute("UPDATE notes SET updated_at=?1 WHERE id=?2", params![now, note_id])
            .map_err(|e| e.to_string())?;
        let short = &hash[..8.min(hash.len())];
        save_version_inner(&db, &note_id, &plain_content, &format!("Restauré ({})", short), &now, &key)
            .map_err(|e| e.to_string())?;
    }

    get_note(note_id, state)
}

// ─── Settings commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let defaults = Settings::default();

    let get = |k: &str, default: String| -> String {
        let raw = db
            .query_row("SELECT value FROM settings WHERE key=?1", [k], |r| r.get::<_, String>(0))
            .unwrap_or(default);
        maybe_dec(&key, &raw)
    };

    let temp_str = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["temperature"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "0.7".to_string());
    let temperature: f64 = temp_str.parse().unwrap_or(0.7);

    Ok(Settings {
        default_model: get("default_model", defaults.default_model),
        ollama_url: get("ollama_url", defaults.ollama_url),
        global_shadow_prompt: get("global_shadow_prompt", defaults.global_shadow_prompt),
        correct_prompt: get("correct_prompt", defaults.correct_prompt),
        summary_prompt: get("summary_prompt", defaults.summary_prompt),
        rename_prompt: get("rename_prompt", defaults.rename_prompt),
        sort_prompt: get("sort_prompt", defaults.sort_prompt),
        temperature,
    })
}

#[tauri::command]
fn update_settings(settings: Settings, state: State<AppState>) -> Result<(), String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // Auto-save prompt versions (compare plaintext values)
    let prompts = [
        ("global_shadow_prompt", settings.global_shadow_prompt.as_str()),
        ("correct_prompt",       settings.correct_prompt.as_str()),
        ("summary_prompt",       settings.summary_prompt.as_str()),
        ("rename_prompt",        settings.rename_prompt.as_str()),
        ("sort_prompt",          settings.sort_prompt.as_str()),
    ];
    for &(pk, new_val) in &prompts {
        let last_raw: Option<String> = db.query_row(
            "SELECT value FROM prompt_versions WHERE prompt_key=?1 ORDER BY saved_at DESC LIMIT 1",
            [pk], |r| r.get(0),
        ).ok();
        let last_plain = last_raw.as_deref().map(|r| maybe_dec(&key, r));
        if last_plain.as_deref() != Some(new_val) {
            let vid = Uuid::new_v4().to_string();
            db.execute(
                "INSERT INTO prompt_versions(id,prompt_key,value,saved_at) VALUES(?1,?2,?3,?4)",
                params![vid, pk, maybe_enc(&key, new_val), now],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let temp_str = settings.temperature.to_string();
    let all = [
        ("default_model",        settings.default_model.as_str()),
        ("ollama_url",           settings.ollama_url.as_str()),
        ("global_shadow_prompt", settings.global_shadow_prompt.as_str()),
        ("correct_prompt",       settings.correct_prompt.as_str()),
        ("summary_prompt",       settings.summary_prompt.as_str()),
        ("rename_prompt",        settings.rename_prompt.as_str()),
        ("sort_prompt",          settings.sort_prompt.as_str()),
        ("temperature",          temp_str.as_str()),
    ];
    for &(k, v) in &all {
        db.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![k, maybe_enc(&key, v)],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ─── Folder commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_folders(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT path FROM folders ORDER BY path").map_err(|e| e.to_string())?;
    let folders = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
fn create_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [&path]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let prefix = format!("{}/%", path);
    db.execute("DELETE FROM folders WHERE path=?1 OR path LIKE ?2", params![path, prefix]).map_err(|e| e.to_string())?;
    db.execute("UPDATE notes SET folder=NULL WHERE folder=?1 OR folder LIKE ?2", params![path, prefix]).map_err(|e| e.to_string())?;
    let ck = format!("folder:{}", path);
    let cp = format!("folder:{}/%", path);
    db.execute("DELETE FROM item_colors WHERE item_key=?1 OR item_key LIKE ?2", params![ck, cp]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_folder(old_path: String, new_path: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let op = format!("{}/%", old_path);
    let np = format!("{}/%", new_path);
    db.execute(
        "UPDATE folders SET path=REPLACE(path,?1,?2) WHERE path=?1 OR path LIKE ?3",
        params![old_path, new_path, op],
    ).map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE notes SET folder=REPLACE(folder,?1,?2) WHERE folder=?1 OR folder LIKE ?3",
        params![old_path, new_path, op],
    ).map_err(|e| e.to_string())?;
    db.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [&new_path]).map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM folders WHERE path LIKE ?1 AND path NOT LIKE ?2",
        params![op, np],
    ).map_err(|e| e.to_string())?;
    let oc = format!("folder:{}", old_path);
    let nc = format!("folder:{}", new_path);
    let ocp = format!("folder:{}/%", old_path);
    db.execute(
        "UPDATE item_colors SET item_key=REPLACE(item_key,?1,?2) WHERE item_key=?1 OR item_key LIKE ?3",
        params![oc, nc, ocp],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn move_note(id: String, folder: Option<String>, state: State<AppState>) -> Result<NoteMetadata, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE notes SET folder=?1, updated_at=?2 WHERE id=?3", params![folder, now, id])
        .map_err(|e| e.to_string())?;
    let (raw_title, raw_tags, new_folder, created_at, updated_at) = db.query_row(
        "SELECT title, tags, folder, created_at, updated_at FROM notes WHERE id=?1",
        [&id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?)),
    ).map_err(|e| e.to_string())?;
    let title = maybe_dec(&key, &raw_title);
    let tags_str = maybe_dec(&key, &raw_tags);
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    Ok(NoteMetadata { id, title, tags, folder: new_folder, created_at, updated_at })
}

// ─── Prompt version commands ──────────────────────────────────────────────────

#[tauri::command]
fn get_prompt_versions(prompt_key: String, state: State<AppState>) -> Result<Vec<PromptVersion>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, prompt_key, value, saved_at FROM prompt_versions WHERE prompt_key=?1 ORDER BY saved_at DESC LIMIT 30")
        .map_err(|e| e.to_string())?;
    let versions = stmt
        .query_map([&prompt_key], |row| {
            Ok(PromptVersion {
                id: row.get(0)?,
                prompt_key: row.get(1)?,
                value: row.get(2)?,
                saved_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|mut pv| { pv.value = maybe_dec(&key, &pv.value); pv })
        .collect();
    Ok(versions)
}

#[tauri::command]
fn delete_prompt_version(id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM prompt_versions WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── API Key commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_api_keys(state: State<AppState>) -> Result<Vec<ApiKey>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, name, provider, key_value, color FROM api_keys ORDER BY name")
        .map_err(|e| e.to_string())?;
    let keys = stmt
        .query_map([], |row| {
            Ok(ApiKey {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                key_value: row.get(3)?,
                color: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<ApiKey>>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|mut k| {
            k.name = maybe_dec(&key, &k.name);
            k.provider = maybe_dec(&key, &k.provider);
            k.key_value = maybe_dec(&key, &k.key_value);
            k
        })
        .collect();
    Ok(keys)
}

#[tauri::command]
fn upsert_api_key(key: ApiKey, state: State<AppState>) -> Result<(), String> {
    let enc_key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO api_keys(id,name,provider,key_value,color) VALUES(?1,?2,?3,?4,?5)
         ON CONFLICT(id) DO UPDATE SET name=?2, provider=?3, key_value=?4, color=?5",
        params![
            key.id,
            maybe_enc(&enc_key, &key.name),
            maybe_enc(&enc_key, &key.provider),
            maybe_enc(&enc_key, &key.key_value),
            key.color
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_api_key(id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM api_keys WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Color commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_colors(state: State<AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT item_key, color FROM item_colors").map_err(|e| e.to_string())?;
    let map = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<HashMap<_, _>>();
    Ok(map)
}

#[tauri::command]
fn set_color(item_key: String, color: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO item_colors(item_key,color) VALUES(?1,?2) ON CONFLICT(item_key) DO UPDATE SET color=?2",
        params![item_key, color],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_color(item_key: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM item_colors WHERE item_key=?1", [&item_key]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Ollama commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn ollama_test_simple(base_url: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Réponds juste le mot: OK"}],
        "stream": false
    });
    let resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama erreur: {}", body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("(vide)").to_string())
}

#[tauri::command]
async fn ollama_chat(base_url: String, model: String, system: String, message: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": message}
        ],
        "stream": false
    });
    let resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn ollama_models(base_url: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tags", base_url))
        .send()
        .await
        .map_err(|e| format!("Impossible de contacter Ollama : {}", e))?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = json["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["name"].as_str().map(String::from))
        .collect();
    Ok(models)
}

#[tauri::command]
async fn ollama_stream(
    app: tauri::AppHandle,
    base_url: String,
    model: String,
    system: String,
    message: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": message}
        ],
        "stream": true
    });
    let mut resp = client
        .post(format!("{}/api/chat", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Erreur Ollama : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama a répondu {} : {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(content) = json["message"]["content"].as_str() {
                    if !content.is_empty() {
                        let _ = app.emit("ollama-token", content.to_string());
                    }
                }
                if json["done"].as_bool().unwrap_or(false) {
                    let _ = app.emit("ollama-done", "");
                    return Ok(());
                }
            }
        }
    }
    let _ = app.emit("ollama-done", "");
    Ok(())
}

#[tauri::command]
async fn ollama_pull(app: tauri::AppHandle, base_url: String, model: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "model": model, "stream": true });
    let mut resp = client
        .post(format!("{}/api/pull", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Connexion impossible : {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, body));
    }
    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = json["status"].as_str().unwrap_or("").to_string();
                let total = json["total"].as_u64().unwrap_or(0);
                let completed = json["completed"].as_u64().unwrap_or(0);
                let percent = if total > 0 { (completed * 100) / total } else { 0 };
                let _ = app.emit("ollama-pull-progress", serde_json::json!({
                    "status": status, "total": total, "completed": completed, "percent": percent,
                }));
                if status == "success" { return Ok(()); }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn set_window_theme(window: tauri::Window, dark: bool) -> Result<(), String> {
    window
        .set_theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .map_err(|e| e.to_string())
}

// ─── Entry point ──────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("cannot resolve app data dir");
            let notes_dir = data_dir.join("notes");
            std::fs::create_dir_all(&notes_dir).expect("cannot create notes dir");
            init_git(&notes_dir);

            let db_path = data_dir.join("natia.db");
            let db = Connection::open(&db_path).expect("cannot open database");
            init_db(&db).expect("cannot init database");

            app.manage(AppState {
                db: Mutex::new(db),
                notes_dir,
                enc_key: Mutex::new(None),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_all_notes,
            get_note,
            create_note,
            update_note,
            rename_note,
            delete_note,
            get_versions,
            get_version_content,
            restore_version,
            get_settings,
            update_settings,
            get_folders,
            create_folder,
            delete_folder,
            rename_folder,
            move_note,
            ollama_test_simple,
            ollama_chat,
            ollama_models,
            ollama_stream,
            ollama_pull,
            set_window_theme,
            get_colors,
            set_color,
            delete_color,
            get_api_keys,
            upsert_api_key,
            delete_api_key,
            get_prompt_versions,
            delete_prompt_version,
            has_password,
            get_password_type,
            setup_password,
            verify_password,
            change_password,
            remove_password,
            lock_app,
            export_zip,
            save_zip_to_path,
            trim_note_versions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
