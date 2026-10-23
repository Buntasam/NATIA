use chrono::Utc;
use rand::RngCore;
use rusqlite::params;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::HashMap;
use tauri::{State, Theme};
use uuid::Uuid;

use zeroize::Zeroize;

use crate::{AppState, ApiKey, PromptVersion, Settings};
use crate::crypto::{decrypt_all_data, derive_64, encrypt_all_data, maybe_dec, maybe_enc, generate_dek, encrypt_dek, decrypt_dek};
use crate::db::{delete_color_where, keychain_get, keychain_set, load_color_rows, upsert_color, API_KEY_NAMES, DEVICE_SECRET_NAME};

// ─── Password commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn has_password(state: State<AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let exists: bool = db
        .query_row("SELECT 1 FROM app_config WHERE key='password_hash' LIMIT 1", [], |_| Ok(true))
        .unwrap_or(false);
    Ok(exists)
}

#[tauri::command]
pub fn get_password_type(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let pw_type = db
        .query_row("SELECT value FROM app_config WHERE key='password_type'", [], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "alpha".to_string());
    Ok(pw_type)
}

// ─── Liaison à l'appareil ─────────────────────────────────────────────────────
// Un secret aléatoire, rangé dans le coffre d'identifiants Windows (protégé par
// DPAPI, donc lié à la session Windows), est injecté dans Argon2. Une base copiée
// sur une autre machine ne permet alors de tester aucun mot de passe ni PIN.

const DEVICE_MISSING: &str = "Clé de sécurité de cet appareil introuvable. Les notes ne peuvent être déchiffrées que sur le PC et la session Windows où le mot de passe a été créé. Si vous avez changé de PC ou de compte Windows, utilisez votre clé de récupération.";

fn load_device_secret() -> Option<[u8; 32]> {
    let bytes = B64.decode(keychain_get(DEVICE_SECRET_NAME)?).ok()?;
    <[u8; 32]>::try_from(bytes.as_slice()).ok()
}

fn get_or_create_device_secret() -> Option<[u8; 32]> {
    if let Some(s) = load_device_secret() { return Some(s); }
    let mut s = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut s);
    let res = keychain_set(DEVICE_SECRET_NAME, &B64.encode(s));
    s.zeroize();
    if let Err(e) = res {
        eprintln!("Coffre Windows indisponible, mot de passe non lié à l'appareil : {}", e);
        return None;
    }
    // Relecture : on ne lie la base que si le secret est réellement persisté.
    load_device_secret()
}

fn config_get(db: &rusqlite::Connection, key: &str) -> Result<String, String> {
    db.query_row("SELECT value FROM app_config WHERE key=?1", [key], |r| r.get::<_, String>(0))
        .map_err(|_| "Aucune donnée de sécurité trouvée".to_string())
}

fn device_secret_for(db: &rusqlite::Connection, load: fn() -> Option<[u8; 32]>) -> Result<Option<[u8; 32]>, String> {
    let bound = db
        .query_row("SELECT value FROM app_config WHERE key='device_bound'", [], |r| r.get::<_, String>(0))
        .map(|v| v == "1")
        .unwrap_or(false);
    if !bound { return Ok(None); }
    load().map(Some).ok_or_else(|| DEVICE_MISSING.to_string())
}

struct DerivedKeys { verif: [u8; 32], kek: [u8; 32] }

impl Drop for DerivedKeys {
    fn drop(&mut self) { self.verif.zeroize(); self.kek.zeroize(); }
}

fn derive_keys(password: &str, salt: &[u8], secret: Option<&[u8; 32]>) -> Result<DerivedKeys, String> {
    let mut d = derive_64(password, salt, secret)?;
    let mut keys = DerivedKeys { verif: [0u8; 32], kek: [0u8; 32] };
    keys.verif.copy_from_slice(&d[..32]);
    keys.kek.copy_from_slice(&d[32..]);
    d.zeroize();
    Ok(keys)
}

/// Vérifie le mot de passe et renvoie (DEK, base liée à l'appareil ?). `None` = mauvais mot de passe.
fn unwrap_dek(db: &rusqlite::Connection, password: &str) -> Result<Option<([u8; 32], bool)>, String> {
    unwrap_dek_with(db, password, load_device_secret)
}

fn unwrap_dek_with(db: &rusqlite::Connection, password: &str, load: fn() -> Option<[u8; 32]>) -> Result<Option<([u8; 32], bool)>, String> {
    let salt = B64.decode(config_get(db, "password_salt")?).map_err(|e| e.to_string())?;
    let stored = B64.decode(config_get(db, "password_hash")?).map_err(|e| e.to_string())?;
    if stored.len() != 32 { return Err("Hash corrompu".to_string()); }
    let secret = device_secret_for(db, load)?;
    let keys = derive_keys(password, &salt, secret.as_ref())?;
    if !same_bytes(&keys.verif, &stored) { return Ok(None); }

    let nonce = config_get(db, "dek_nonce").map_err(|_| "DEK nonce introuvable")?;
    let ct = config_get(db, "dek_encrypted").map_err(|_| "DEK chiffrée introuvable")?;
    let dek = decrypt_dek(&nonce, &ct, &keys.kek)?;
    Ok(Some((dek, secret.is_some())))
}

/// Chiffre la DEK avec `password` (nouveau sel) et enregistre le tout en une transaction.
fn wrap_dek(db: &rusqlite::Connection, password: &str, dek: &[u8; 32], secret: Option<[u8; 32]>, pw_type: Option<&str>) -> Result<(), String> {
    if pw_type.is_some_and(|t| t != "pin" && t != "alpha") {
        return Err("Type de mot de passe invalide".to_string());
    }
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let keys = derive_keys(password, &salt, secret.as_ref())?;
    let (dek_nonce, dek_ct) = encrypt_dek(dek, &keys.kek);
    let salt_b64 = B64.encode(salt);
    let verif_b64 = B64.encode(keys.verif);
    let bound = if secret.is_some() { "1" } else { "0" };

    let mut rows = vec![
        ("password_salt", salt_b64.as_str()),
        ("password_hash", verif_b64.as_str()),
        ("dek_nonce", dek_nonce.as_str()),
        ("dek_encrypted", dek_ct.as_str()),
        ("device_bound", bound),
    ];
    if let Some(t) = pw_type { rows.push(("password_type", t)); }
    config_set_all(db, &rows)
}

fn config_set_all(db: &rusqlite::Connection, rows: &[(&str, &str)]) -> Result<(), String> {
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    for (k, v) in rows {
        tx.execute(
            "INSERT INTO app_config(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![k, v],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Comparaison en temps constant.
fn same_bytes(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() { return false; }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) { diff |= x ^ y; }
    diff == 0
}

// ─── Clé de récupération ──────────────────────────────────────────────────────
// Une deuxième copie de la DEK, chiffrée par un code aléatoire de 25 caractères
// (125 bits) affiché une seule fois. Ce code n'est PAS lié à l'appareil : il
// permet de rouvrir les notes après une réinstallation de Windows, sur un autre
// PC ou en cas d'oubli du mot de passe. Il est trop long pour être deviné.

const RECOVERY_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_LEN: usize = 25;
const RECOVERY_CONFIG_KEYS: &str = "'recovery_salt','recovery_hash','recovery_dek_nonce','recovery_dek_encrypted'";

fn generate_recovery_code() -> String {
    let mut bytes = [0u8; RECOVERY_LEN];
    rand::thread_rng().fill_bytes(&mut bytes);
    // 256 est un multiple de 32 : chaque caractère est équiprobable.
    let chars: Vec<char> = bytes.iter().map(|b| RECOVERY_ALPHABET[(b & 31) as usize] as char).collect();
    bytes.zeroize();
    chars.chunks(5).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join("-")
}

/// Saisie tolérante : minuscules, espaces et tirets acceptés, O lu comme 0, I et L comme 1.
fn normalize_recovery_code(input: &str) -> Option<String> {
    let s: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() { 'O' => '0', 'I' | 'L' => '1', c => c })
        .collect();
    (s.len() == RECOVERY_LEN && s.bytes().all(|b| RECOVERY_ALPHABET.contains(&b))).then_some(s)
}

fn wrap_recovery(db: &rusqlite::Connection, code: &str, dek: &[u8; 32]) -> Result<(), String> {
    let code = normalize_recovery_code(code).ok_or("Clé de récupération invalide")?;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let keys = derive_keys(&code, &salt, None)?;
    let (nonce, ct) = encrypt_dek(dek, &keys.kek);
    let (salt_b64, verif_b64) = (B64.encode(salt), B64.encode(keys.verif));
    config_set_all(db, &[
        ("recovery_salt", salt_b64.as_str()),
        ("recovery_hash", verif_b64.as_str()),
        ("recovery_dek_nonce", nonce.as_str()),
        ("recovery_dek_encrypted", ct.as_str()),
    ])
}

/// DEK retrouvée grâce à la clé de récupération. `None` = mauvaise clé.
fn unwrap_recovery(db: &rusqlite::Connection, code: &str) -> Result<Option<[u8; 32]>, String> {
    let salt = config_get(db, "recovery_salt").map_err(|_| "Aucune clé de récupération n'a été créée pour ces notes.")?;
    let Some(code) = normalize_recovery_code(code) else { return Ok(None) };
    let salt = B64.decode(salt).map_err(|e| e.to_string())?;
    let stored = B64.decode(config_get(db, "recovery_hash")?).map_err(|e| e.to_string())?;
    let keys = derive_keys(&code, &salt, None)?;
    if !same_bytes(&keys.verif, &stored) { return Ok(None); }
    let nonce = config_get(db, "recovery_dek_nonce")?;
    let ct = config_get(db, "recovery_dek_encrypted")?;
    decrypt_dek(&nonce, &ct, &keys.kek).map(Some)
}

fn has_recovery_in(db: &rusqlite::Connection) -> bool {
    config_get(db, "recovery_hash").is_ok()
}

/// Remplace le mot de passe à l'aide de la clé de récupération (la clé reste valable).
fn recover_in(db: &rusqlite::Connection, code: &str, new_password: &str, pw_type: &str, secret: Option<[u8; 32]>) -> Result<Option<[u8; 32]>, String> {
    let Some(dek) = unwrap_recovery(db, code)? else { return Ok(None) };
    wrap_dek(db, new_password, &dek, secret, Some(pw_type))?;
    Ok(Some(dek))
}

/// Vérifie un mot de passe saisi dans les paramètres, avec le même compteur
/// d'échecs que l'écran de verrouillage.
fn check_password(db: &rusqlite::Connection, password: &str, wrong: &str) -> Result<[u8; 32], String> {
    begin_attempt(db, unix_now())?;
    let (dek, _) = unwrap_dek(db, password)?.ok_or_else(|| wrong.to_string())?;
    write_lockout(db, 0, 0)?;
    Ok(dek)
}

// ─── Password commands ────────────────────────────────────────────────────────

#[tauri::command]
/// Renvoie la clé de récupération, à montrer une seule fois à l'utilisateur.
pub fn setup_password(password: String, pw_type: String, state: State<AppState>) -> Result<String, String> {
    let mut dek = generate_dek();
    let code = generate_recovery_code();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        wrap_dek(&db, &password, &dek, get_or_create_device_secret(), Some(&pw_type))?;
        wrap_recovery(&db, &code, &dek)?;
        encrypt_all_data(&db, &state.notes_dir, &dek)?;
        // Réécrit le fichier SQLite pour qu'aucune page libérée ne garde l'ancien texte clair.
        db.execute_batch("VACUUM").map_err(|e| e.to_string())?;
    }
    *state.enc_key.lock().map_err(|e| e.to_string())? = Some(dek);
    dek.zeroize();
    Ok(code)
}

#[tauri::command]
pub fn has_recovery_code(state: State<AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(has_recovery_in(&db))
}

/// Crée (ou remplace) la clé de récupération. L'ancienne clé ne fonctionne plus.
#[tauri::command]
pub fn create_recovery_code(password: String, state: State<AppState>) -> Result<String, String> {
    crate::require_unlocked(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut dek = check_password(&db, &password, "Mot de passe incorrect")?;
    let code = generate_recovery_code();
    let res = wrap_recovery(&db, &code, &dek);
    dek.zeroize();
    res.map(|_| code)
}

/// Écran de verrouillage : clé de récupération + nouveau mot de passe.
#[tauri::command]
pub fn recover_with_code(code: String, new_password: String, pw_type: String, state: State<AppState>) -> Result<bool, String> {
    let result = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        begin_attempt(&db, unix_now())?;
        let r = recover_in(&db, &code, &new_password, &pw_type, get_or_create_device_secret())?;
        if r.is_some() { write_lockout(&db, 0, 0)?; }
        r
    };
    let Some(mut dek) = result else { return Ok(false) };
    *state.enc_key.lock().map_err(|e| e.to_string())? = Some(dek);
    dek.zeroize();
    Ok(true)
}

// ─── Blocage après échecs ─────────────────────────────────────────────────────
// Compteur et fin de blocage stockés en base (heure Unix) : redémarrer l'app,
// vider le localStorage ou tuer le processus ne les remet pas à zéro.

const FREE_ATTEMPTS: u32 = 4;
const MAX_LOCK_SECS: u64 = 24 * 3600;

/// Durée de blocage après `failures` échecs consécutifs : 4 essais libres,
/// puis 30 s, 1, 2, 4, 8 min, puis 15 min doublant à chaque échec (24 h max).
pub(crate) fn lock_delay_secs(failures: u32) -> u64 {
    match failures {
        0..=FREE_ATTEMPTS => 0,
        5..=9 => 30u64 << (failures - 5),
        _ => (900u64 << (failures - 10).min(16)).min(MAX_LOCK_SECS),
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_lockout(db: &rusqlite::Connection) -> (u32, u64) {
    let get = |k: &str| -> u64 {
        db.query_row("SELECT value FROM app_config WHERE key=?1", [k], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    };
    (get("failed_attempts") as u32, get("lock_until"))
}

fn write_lockout(db: &rusqlite::Connection, failures: u32, lock_until: u64) -> Result<(), String> {
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    for (k, v) in [("failed_attempts", failures.to_string()), ("lock_until", lock_until.to_string())] {
        tx.execute(
            "INSERT INTO app_config(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![k, v],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn format_wait(secs: u64) -> String {
    match secs {
        0..=59 => format!("{} s", secs.max(1)),
        60..=3599 => format!("{} min", secs.div_ceil(60)),
        _ => format!("{} h {:02} min", secs / 3600, (secs % 3600) / 60),
    }
}

#[derive(serde::Serialize)]
pub struct LockStatus {
    pub failed_attempts: u32,
    pub locked_for_secs: u64,
    pub attempts_before_lock: u32,
}

fn lock_status_at(db: &rusqlite::Connection, now: u64) -> LockStatus {
    let (failures, lock_until) = read_lockout(db);
    LockStatus {
        failed_attempts: failures,
        locked_for_secs: lock_until.saturating_sub(now),
        attempts_before_lock: (FREE_ATTEMPTS + 1).saturating_sub(failures),
    }
}

#[tauri::command]
pub fn get_lock_status(state: State<AppState>) -> Result<LockStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(lock_status_at(&db, unix_now()))
}

/// Compte la tentative AVANT de vérifier : interrompre l'app pendant le calcul
/// Argon2 ne permet pas d'esquiver le compteur. Remis à zéro si le mot de passe est bon.
fn begin_attempt(db: &rusqlite::Connection, now: u64) -> Result<(), String> {
    let (failures, lock_until) = read_lockout(db);
    if lock_until > now {
        return Err(format!("Trop de tentatives. Réessayez dans {}.", format_wait(lock_until - now)));
    }
    let failures = failures.saturating_add(1);
    write_lockout(db, failures, now + lock_delay_secs(failures))
}

#[tauri::command]
pub fn verify_password(password: String, state: State<AppState>) -> Result<bool, String> {
    let result = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        begin_attempt(&db, unix_now())?;
        unwrap_dek(&db, &password)?
    };

    let Some((mut dek, bound)) = result else {
        return Ok(false);
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        write_lockout(&db, 0, 0)?;
    }

    // Migration : une base créée avant la liaison à l'appareil est liée au premier déverrouillage.
    if !bound {
        if let Some(secret) = get_or_create_device_secret() {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            if let Err(e) = wrap_dek(&db, &password, &dek, Some(secret), None) {
                eprintln!("Liaison à l'appareil impossible : {}", e);
            }
        }
    }

    *state.enc_key.lock().map_err(|e| e.to_string())? = Some(dek);
    dek.zeroize();
    Ok(true)
}

#[tauri::command]
pub fn change_password(old_pass: String, new_pass: String, pw_type: Option<String>, state: State<AppState>) -> Result<(), String> {
    let mut dek = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let dek = check_password(&db, &old_pass, "Ancien mot de passe incorrect")?;
        wrap_dek(&db, &new_pass, &dek, get_or_create_device_secret(), pw_type.as_deref())?;
        dek
    };
    *state.enc_key.lock().map_err(|e| e.to_string())? = Some(dek);
    dek.zeroize();
    Ok(())
}

#[tauri::command]
pub fn remove_password(password: String, state: State<AppState>) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut dek = check_password(&db, &password, "Mot de passe incorrect")?;
        decrypt_all_data(&db, &state.notes_dir, &dek)?;
        dek.zeroize();
        db.execute(
            &format!("DELETE FROM app_config WHERE key IN ('password_salt','password_hash','password_type','dek_nonce','dek_encrypted','device_bound',{})", RECOVERY_CONFIG_KEYS),
            [],
        ).map_err(|e| e.to_string())?;
    }
    let _ = keychain_set(DEVICE_SECRET_NAME, "");
    *state.enc_key.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn lock_app(state: State<AppState>) -> Result<(), String> {
    crate::notes::clear_search_cache(&state);
    *state.lock_request.lock().map_err(|e| e.to_string())? = None;
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
    Ok(())
}

// ─── Settings commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let defaults = Settings::default();

    let get = |k: &str, default: String| -> String {
        let raw = db
            .query_row("SELECT value FROM settings WHERE key=?1", [k], |r| r.get::<_, String>(0))
            .unwrap_or(default);
        maybe_dec(&key, &raw)
    };

    let get_api_key = |k: &str| -> String {
        if key.is_none() {
            if let Some(v) = keychain_get(k) { return v; }
            let raw = db
                .query_row("SELECT value FROM settings WHERE key=?1", [k], |r| r.get::<_, String>(0))
                .unwrap_or_default();
            if !raw.is_empty() && raw != "__keychain__" {
                let _ = keychain_set(k, &raw);
                let _ = db.execute("UPDATE settings SET value='__keychain__' WHERE key=?1", [k]);
                return raw;
            }
            return String::new();
        }
        get(k, String::new())
    };

    let temperature: f64 = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["temperature"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "0.7".to_string())
        .parse().unwrap_or(0.7);
    let auto_lock_minutes: u32 = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["auto_lock_minutes"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "0".to_string())
        .parse().unwrap_or(0);
    let editor_font_size: u32 = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["editor_font_size"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "16".to_string())
        .parse().unwrap_or(16);
    let context_messages: u32 = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["context_messages"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "0".to_string())
        .parse().unwrap_or(0);
    let debug_mode = db
        .query_row("SELECT value FROM settings WHERE key=?1", ["debug_mode"], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "false".to_string()) == "true";

    Ok(Settings {
        default_model: get("default_model", defaults.default_model),
        ollama_url: get("ollama_url", defaults.ollama_url),
        global_shadow_prompt: get("global_shadow_prompt", defaults.global_shadow_prompt),
        correct_prompt: get("correct_prompt", defaults.correct_prompt),
        summary_prompt: get("summary_prompt", defaults.summary_prompt),
        rename_prompt: get("rename_prompt", defaults.rename_prompt),
        sort_prompt: get("sort_prompt", defaults.sort_prompt),
        formalize_prompt: get("formalize_prompt", defaults.formalize_prompt),
        translate_prompt: get("translate_prompt", defaults.translate_prompt),
        continue_prompt: get("continue_prompt", defaults.continue_prompt),
        temperature,
        ai_provider: get("ai_provider", defaults.ai_provider),
        claude_api_key: get_api_key("claude_api_key"),
        claude_model: get("claude_model", defaults.claude_model),
        openai_api_key: get_api_key("openai_api_key"),
        openai_model: get("openai_model", defaults.openai_model),
        gemini_api_key: get_api_key("gemini_api_key"),
        gemini_model: get("gemini_model", defaults.gemini_model),
        mistral_api_key: get_api_key("mistral_api_key"),
        mistral_model: get("mistral_model", defaults.mistral_model),
        auto_lock_minutes,
        editor_font_size,
        editor_font_family: get("editor_font_family", defaults.editor_font_family),
        editor_max_width: get("editor_max_width", defaults.editor_max_width),
        context_messages,
        debug_mode,
        prompt_intensity: get("prompt_intensity", defaults.prompt_intensity),
        local_model: get("local_model", defaults.local_model),
    })
}

#[tauri::command]
pub fn update_settings(settings: Settings, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let prompts = [
        ("global_shadow_prompt", settings.global_shadow_prompt.as_str()),
        ("correct_prompt",       settings.correct_prompt.as_str()),
        ("summary_prompt",       settings.summary_prompt.as_str()),
        ("rename_prompt",        settings.rename_prompt.as_str()),
        ("sort_prompt",          settings.sort_prompt.as_str()),
        ("formalize_prompt",     settings.formalize_prompt.as_str()),
        ("translate_prompt",     settings.translate_prompt.as_str()),
        ("continue_prompt",      settings.continue_prompt.as_str()),
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
            ).map_err(|e| e.to_string())?;
        }
    }

    let temp_str = settings.temperature.to_string();
    let auto_lock_str = settings.auto_lock_minutes.to_string();
    let editor_font_size_str = settings.editor_font_size.to_string();
    let context_messages_str = settings.context_messages.to_string();
    let debug_mode_str = if settings.debug_mode { "true" } else { "false" };
    let all = [
        ("default_model",        settings.default_model.as_str()),
        ("ollama_url",           settings.ollama_url.as_str()),
        ("global_shadow_prompt", settings.global_shadow_prompt.as_str()),
        ("correct_prompt",       settings.correct_prompt.as_str()),
        ("summary_prompt",       settings.summary_prompt.as_str()),
        ("rename_prompt",        settings.rename_prompt.as_str()),
        ("sort_prompt",          settings.sort_prompt.as_str()),
        ("formalize_prompt",     settings.formalize_prompt.as_str()),
        ("translate_prompt",     settings.translate_prompt.as_str()),
        ("continue_prompt",      settings.continue_prompt.as_str()),
        ("temperature",          temp_str.as_str()),
        ("ai_provider",          settings.ai_provider.as_str()),
        ("claude_api_key",       settings.claude_api_key.as_str()),
        ("claude_model",         settings.claude_model.as_str()),
        ("openai_api_key",       settings.openai_api_key.as_str()),
        ("openai_model",         settings.openai_model.as_str()),
        ("gemini_api_key",       settings.gemini_api_key.as_str()),
        ("gemini_model",         settings.gemini_model.as_str()),
        ("mistral_api_key",      settings.mistral_api_key.as_str()),
        ("mistral_model",        settings.mistral_model.as_str()),
        ("auto_lock_minutes",    auto_lock_str.as_str()),
        ("editor_font_size",     editor_font_size_str.as_str()),
        ("editor_font_family",   settings.editor_font_family.as_str()),
        ("editor_max_width",     settings.editor_max_width.as_str()),
        ("context_messages",     context_messages_str.as_str()),
        ("debug_mode",           debug_mode_str),
        ("prompt_intensity",     settings.prompt_intensity.as_str()),
        ("local_model",          settings.local_model.as_str()),
    ];
    for &(k, v) in &all {
        if key.is_none() && API_KEY_NAMES.contains(&k) {
            keychain_set(k, v)?;
            db.execute(
                "INSERT INTO settings(key,value) VALUES(?1,'__keychain__') ON CONFLICT(key) DO UPDATE SET value='__keychain__'",
                params![k],
            ).map_err(|e| e.to_string())?;
        } else {
            db.execute(
                "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![k, maybe_enc(&key, v)],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ─── Prompt version commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_prompt_versions(prompt_key: String, state: State<AppState>) -> Result<Vec<PromptVersion>, String> {
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
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|mut pv| { pv.value = maybe_dec(&key, &pv.value); pv })
        .collect();
    Ok(versions)
}

#[tauri::command]
pub fn delete_prompt_version(id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM prompt_versions WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── API Key commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_api_keys(state: State<AppState>) -> Result<Vec<ApiKey>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, name, provider, key_value, color, model FROM api_keys ORDER BY name")
        .map_err(|e| e.to_string())?;
    let keys = stmt
        .query_map([], |row| {
            Ok(ApiKey {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                key_value: row.get(3)?,
                color: row.get(4)?,
                model: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<ApiKey>>>()
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
pub fn upsert_api_key(key: ApiKey, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let enc_key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO api_keys(id,name,provider,key_value,color,model) VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET name=?2, provider=?3, key_value=?4, color=?5, model=?6",
        params![
            key.id,
            maybe_enc(&enc_key, &key.name),
            maybe_enc(&enc_key, &key.provider),
            maybe_enc(&enc_key, &key.key_value),
            key.color,
            key.model
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_api_key(id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM api_keys WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Color commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_colors(state: State<AppState>) -> Result<HashMap<String, String>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(load_color_rows(&db, &key)?.into_iter().map(|(_, k, c)| (k, c)).collect())
}

#[tauri::command]
pub fn set_color(item_key: String, color: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    upsert_color(&db, &key, &item_key, &color)
}

#[tauri::command]
pub fn delete_color(item_key: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    delete_color_where(&db, &key, |k| k == item_key)
}

// ─── User data (mémoire IA, bibliothèque de prompts…) ─────────────────────────

#[tauri::command]
pub fn get_user_data(name: String, state: State<AppState>) -> Result<Option<String>, String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let raw: Option<String> = db
        .query_row("SELECT value FROM user_data WHERE key=?1", [&name], |r| r.get(0))
        .ok();
    Ok(raw.map(|r| maybe_dec(&key, &r)))
}

#[tauri::command]
pub fn set_user_data(name: String, value: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO user_data(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
        params![name, maybe_enc(&key, &value)],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Window theme ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn set_window_theme(window: tauri::Window, dark: bool) -> Result<(), String> {
    window
        .set_theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .map_err(|e| e.to_string())
}


#[cfg(test)]
mod tests {
    use super::*;

    // Sources de secret factices : les tests ne touchent jamais au vrai coffre Windows.
    fn secret_a() -> Option<[u8; 32]> { Some([7u8; 32]) }
    fn secret_b() -> Option<[u8; 32]> { Some([9u8; 32]) }
    fn no_secret() -> Option<[u8; 32]> { None }

    fn db() -> rusqlite::Connection {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        db
    }

    #[test]
    fn device_bound_pin_only_unlocks_with_the_device_secret() {
        let db = db();
        let dek = generate_dek();
        wrap_dek(&db, "1234", &dek, secret_a(), Some("pin")).unwrap();

        assert_eq!(unwrap_dek_with(&db, "1234", secret_a).unwrap(), Some((dek, true)));
        assert_eq!(unwrap_dek_with(&db, "0000", secret_a).unwrap(), None, "mauvais PIN refusé");
        // Base copiée sur une autre machine : un autre secret ne valide même pas le bon PIN.
        assert_eq!(unwrap_dek_with(&db, "1234", secret_b).unwrap(), None);
        // Secret absent du coffre : erreur explicite, pas un « mauvais mot de passe ».
        assert_eq!(unwrap_dek_with(&db, "1234", no_secret).unwrap_err(), DEVICE_MISSING);
        assert_eq!(config_get(&db, "password_type").unwrap(), "pin");
    }

    #[test]
    fn unbound_database_still_unlocks_and_can_be_rebound() {
        let db = db();
        let dek = generate_dek();
        wrap_dek(&db, "motdepasse", &dek, None, Some("alpha")).unwrap();
        assert_eq!(unwrap_dek_with(&db, "motdepasse", no_secret).unwrap(), Some((dek, false)));

        // Migration au déverrouillage : on relie la base à l'appareil.
        wrap_dek(&db, "motdepasse", &dek, secret_a(), None).unwrap();
        assert_eq!(unwrap_dek_with(&db, "motdepasse", secret_a).unwrap(), Some((dek, true)));
        assert_eq!(config_get(&db, "password_type").unwrap(), "alpha", "le type n'est pas écrasé");
    }

    #[test]
    fn lock_delays_escalate_and_cap() {
        let d: Vec<u64> = (0..=12).map(lock_delay_secs).collect();
        assert_eq!(d, [0, 0, 0, 0, 0, 30, 60, 120, 240, 480, 900, 1800, 3600]);
        assert_eq!(lock_delay_secs(40), MAX_LOCK_SECS);
        assert_eq!(lock_delay_secs(u32::MAX), MAX_LOCK_SECS);
    }

    #[test]
    fn lockout_is_persisted_and_blocks_until_expiry() {
        let db = db();
        let t0 = 1_000_000;
        for _ in 0..FREE_ATTEMPTS { begin_attempt(&db, t0).unwrap(); }
        assert_eq!(lock_status_at(&db, t0).locked_for_secs, 0, "4 essais libres");
        assert_eq!(lock_status_at(&db, t0).attempts_before_lock, 1);

        begin_attempt(&db, t0).unwrap(); // 5e échec compté → 30 s
        assert_eq!(lock_status_at(&db, t0).locked_for_secs, 30);
        let err = begin_attempt(&db, t0 + 10).unwrap_err();
        assert!(err.contains("20 s"), "{}", err);
        assert_eq!(read_lockout(&db).0, 5, "une tentative refusée n'est pas comptée en plus");

        begin_attempt(&db, t0 + 31).unwrap();
        assert_eq!(lock_status_at(&db, t0 + 31).locked_for_secs, 60);

        write_lockout(&db, 0, 0).unwrap(); // bon mot de passe
        assert_eq!(lock_status_at(&db, t0 + 31).failed_attempts, 0);
    }

    #[test]
    fn recovery_code_unlocks_without_the_device_and_sets_a_new_password() {
        let db = db();
        let dek = generate_dek();
        wrap_dek(&db, "1234", &dek, secret_a(), Some("pin")).unwrap();
        assert!(!has_recovery_in(&db));
        assert!(unwrap_recovery(&db, "x").is_err(), "aucune clé créée");

        let code = generate_recovery_code();
        assert_eq!(code.len(), 29);
        assert_eq!(code.matches('-').count(), 4);
        wrap_recovery(&db, &code, &dek).unwrap();
        assert!(has_recovery_in(&db));

        // Saisie tolérante : minuscules, espaces au lieu des tirets, O pour 0.
        let sloppy = code.replace('-', " ").to_lowercase().replace('0', "o");
        assert_eq!(unwrap_recovery(&db, &sloppy).unwrap(), Some(dek));
        let mut wrong = code.clone().into_bytes();
        wrong[0] = if wrong[0] == b'A' { b'B' } else { b'A' };
        assert_eq!(unwrap_recovery(&db, std::str::from_utf8(&wrong).unwrap()).unwrap(), None);
        assert_eq!(unwrap_recovery(&db, "trop court").unwrap(), None);

        // Autre PC (autre secret) : le PIN ne marche plus, la clé de récupération si.
        assert_eq!(unwrap_dek_with(&db, "1234", secret_b).unwrap(), None);
        assert_eq!(recover_in(&db, &code, "nouveau-mdp", "alpha", secret_b()).unwrap(), Some(dek));
        assert_eq!(unwrap_dek_with(&db, "nouveau-mdp", secret_b).unwrap(), Some((dek, true)));
        assert_eq!(config_get(&db, "password_type").unwrap(), "alpha");

        // Mauvaise clé : rien ne change, et la bonne clé reste valable.
        assert_eq!(recover_in(&db, "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", "pirate", "alpha", secret_b()).unwrap(), None);
        assert_eq!(unwrap_dek_with(&db, "nouveau-mdp", secret_b).unwrap(), Some((dek, true)));
        assert_eq!(unwrap_recovery(&db, &code).unwrap(), Some(dek));
    }

    #[test]
    fn changing_password_type_is_saved_and_validated() {
        let db = db();
        let dek = generate_dek();
        wrap_dek(&db, "1234", &dek, secret_a(), Some("pin")).unwrap();
        wrap_dek(&db, "chat2024", &dek, secret_a(), Some("alpha")).unwrap();
        assert_eq!(config_get(&db, "password_type").unwrap(), "alpha");
        assert_eq!(unwrap_dek_with(&db, "chat2024", secret_a).unwrap(), Some((dek, true)));
        assert!(wrap_dek(&db, "x", &dek, secret_a(), Some("emoji")).is_err());
        assert_eq!(unwrap_dek_with(&db, "chat2024", secret_a).unwrap(), Some((dek, true)), "un type refusé ne touche à rien");
    }
}
