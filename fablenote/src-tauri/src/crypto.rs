use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm,
};
use argon2::{Algorithm, Argon2, Params, Version as Argon2Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;

pub(crate) const ENC_PREFIX: &str = "ENC:v1:";
const ARGON2_MEM_KB: u32 = 19456;
const ARGON2_TIME: u32 = 2;
const ARGON2_PARALLEL: u32 = 1;
const DERIVED_LEN: usize = 64;

pub(crate) fn derive_64(password: &str, salt: &[u8]) -> Result<[u8; DERIVED_LEN], String> {
    let params = Params::new(ARGON2_MEM_KB, ARGON2_TIME, ARGON2_PARALLEL, Some(DERIVED_LEN))
        .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Argon2Version::V0x13, params);
    let mut out = [0u8; DERIVED_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

pub(crate) fn encrypt_value(key: &[u8; 32], plaintext: &str) -> String {
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

pub(crate) fn decrypt_value(key: &[u8; 32], encoded: &str) -> Result<String, String> {
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

pub(crate) fn maybe_dec(key: &Option<[u8; 32]>, s: &str) -> String {
    match key {
        Some(k) => decrypt_value(k, s).unwrap_or_else(|_| s.to_string()),
        None => s.to_string(),
    }
}

pub(crate) fn maybe_enc(key: &Option<[u8; 32]>, s: &str) -> String {
    match key {
        Some(k) => encrypt_value(k, s),
        None => s.to_string(),
    }
}

pub(crate) fn is_valid_uuid(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok()
}

pub(crate) fn sanitize_name(s: &str) -> String {
    let step1: String = s
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();
    step1.replace("..", "_")
}

pub(crate) fn collect_rows2(db: &Connection, sql: &str) -> Result<Vec<(String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn collect_rows3(db: &Connection, sql: &str) -> Result<Vec<(String, String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((
        r.get::<_, String>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
    )))
    .map_err(|e| e.to_string())?
    .collect::<SqlResult<Vec<_>>>()
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn collect_rows4(db: &Connection, sql: &str) -> Result<Vec<(String, String, String, String)>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((
        r.get::<_, String>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, String>(3)?,
    )))
    .map_err(|e| e.to_string())?
    .collect::<SqlResult<Vec<_>>>()
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn encrypt_all_data(db: &Connection, notes_dir: &PathBuf, key: &[u8; 32]) -> Result<(), String> {
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

pub(crate) fn decrypt_all_data(db: &Connection, notes_dir: &PathBuf, key: &[u8; 32]) -> Result<(), String> {
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
