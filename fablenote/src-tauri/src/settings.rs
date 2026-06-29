use chrono::Utc;
use rand::RngCore;
use rusqlite::params;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::HashMap;
use tauri::{State, Theme};
use uuid::Uuid;

use zeroize::Zeroize;

use crate::{AppState, ApiKey, PromptVersion, Settings};
use crate::crypto::{decrypt_all_data, derive_64, encrypt_all_data, maybe_dec, maybe_enc};
use crate::db::{keychain_get, keychain_set, API_KEY_NAMES};

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

#[tauri::command]
pub fn setup_password(password: String, pw_type: String, state: State<AppState>) -> Result<(), String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let salt_b64 = B64.encode(&salt);
    let mut derived = derive_64(&password, &salt)?;
    let verif_b64 = B64.encode(&derived[..32]);
    let mut enc_key = [0u8; 32];
    enc_key.copy_from_slice(&derived[32..]);
    derived.zeroize();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (k, v) in [("password_salt", salt_b64.as_str()), ("password_hash", verif_b64.as_str()), ("password_type", pw_type.as_str())] {
            db.execute(
                "INSERT INTO app_config(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![k, v],
            ).map_err(|e| e.to_string())?;
        }
        let notes_dir = state.notes_dir.clone();
        encrypt_all_data(&db, &notes_dir, &enc_key)?;
    }
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(enc_key);
    Ok(())
}

#[tauri::command]
pub fn verify_password(password: String, state: State<AppState>) -> Result<bool, String> {
    // Check Rust-side lockout (process-lifetime, not bypassable via localStorage clear)
    {
        let now = std::time::Instant::now();
        let lock_until = state.lock_until.lock().map_err(|e| e.to_string())?;
        if let Some(until) = *lock_until {
            if until > now {
                let secs = (until - now).as_secs() + 1;
                return Err(format!("Trop de tentatives. Réessayez dans {} s.", secs));
            }
        }
    }

    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let salt = db.query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0))
            .map_err(|_| "Aucune donnée de sécurité trouvée".to_string())?;
        let verif = db.query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0))
            .map_err(|_| "Aucune donnée de sécurité trouvée".to_string())?;
        (salt, verif)
    };
    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let mut derived = derive_64(&password, &salt)?;
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    if stored.len() != 32 { derived.zeroize(); return Err("Hash corrompu".to_string()); }

    let mut diff = 0u8;
    for (a, b) in derived[..32].iter().zip(stored.iter()) { diff |= a ^ b; }

    if diff != 0 {
        derived.zeroize();
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s max
        let mut attempts = state.failed_attempts.lock().map_err(|e| e.to_string())?;
        *attempts += 1;
        let delay = (1u64 << (*attempts).min(5)).min(30);
        let mut lock_until = state.lock_until.lock().map_err(|e| e.to_string())?;
        *lock_until = Some(std::time::Instant::now() + std::time::Duration::from_secs(delay));
        return Ok(false);
    }

    // Success — reset counters
    {
        let mut attempts = state.failed_attempts.lock().map_err(|e| e.to_string())?;
        *attempts = 0;
        let mut lock_until = state.lock_until.lock().map_err(|e| e.to_string())?;
        *lock_until = None;
    }

    let mut enc_key = [0u8; 32];
    enc_key.copy_from_slice(&derived[32..]);
    derived.zeroize();
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(enc_key);
    Ok(true)
}

#[tauri::command]
pub fn change_password(old_pass: String, new_pass: String, state: State<AppState>) -> Result<(), String> {
    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let s = db.query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let v = db.query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        (s, v)
    };
    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let mut old_derived = derive_64(&old_pass, &salt)?;
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    let mut diff = 0u8;
    for (a, b) in old_derived[..32].iter().zip(stored.iter()) { diff |= a ^ b; }
    if diff != 0 { old_derived.zeroize(); return Err("Ancien mot de passe incorrect".to_string()); }
    let mut old_key = [0u8; 32];
    old_key.copy_from_slice(&old_derived[32..]);
    old_derived.zeroize();
    let mut new_salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut new_salt);
    let new_salt_b64 = B64.encode(&new_salt);
    let mut new_derived = derive_64(&new_pass, &new_salt)?;
    let new_verif_b64 = B64.encode(&new_derived[..32]);
    let mut new_key = [0u8; 32];
    new_key.copy_from_slice(&new_derived[32..]);
    new_derived.zeroize();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let notes_dir = state.notes_dir.clone();
        decrypt_all_data(&db, &notes_dir, &old_key)?;
        old_key.zeroize();
        encrypt_all_data(&db, &notes_dir, &new_key)?;
        db.execute("UPDATE app_config SET value=?1 WHERE key='password_salt'", [&new_salt_b64]).map_err(|e| e.to_string())?;
        db.execute("UPDATE app_config SET value=?1 WHERE key='password_hash'", [&new_verif_b64]).map_err(|e| e.to_string())?;
    }
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = Some(new_key);
    Ok(())
}

#[tauri::command]
pub fn remove_password(password: String, state: State<AppState>) -> Result<(), String> {
    let (salt_b64, verif_b64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let s = db.query_row("SELECT value FROM app_config WHERE key='password_salt'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let v = db.query_row("SELECT value FROM app_config WHERE key='password_hash'", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        (s, v)
    };
    let salt = B64.decode(&salt_b64).map_err(|e| e.to_string())?;
    let mut derived = derive_64(&password, &salt)?;
    let stored = B64.decode(&verif_b64).map_err(|e| e.to_string())?;
    let mut diff = 0u8;
    for (a, b) in derived[..32].iter().zip(stored.iter()) { diff |= a ^ b; }
    if diff != 0 { derived.zeroize(); return Err("Mot de passe incorrect".to_string()); }
    let mut key = [0u8; 32];
    key.copy_from_slice(&derived[32..]);
    derived.zeroize();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let notes_dir = state.notes_dir.clone();
        decrypt_all_data(&db, &notes_dir, &key)?;
        key.zeroize();
        db.execute("DELETE FROM app_config WHERE key IN ('password_salt','password_hash','password_type')", [])
            .map_err(|e| e.to_string())?;
    }
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn lock_app(state: State<AppState>) -> Result<(), String> {
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
    })
}

#[tauri::command]
pub fn update_settings(settings: Settings, state: State<AppState>) -> Result<(), String> {
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
pub fn set_color(item_key: String, color: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO item_colors(item_key,color) VALUES(?1,?2) ON CONFLICT(item_key) DO UPDATE SET color=?2",
        params![item_key, color],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_color(item_key: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM item_colors WHERE item_key=?1", [&item_key]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Window theme ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn set_window_theme(window: tauri::Window, dark: bool) -> Result<(), String> {
    window
        .set_theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .map_err(|e| e.to_string())
}
