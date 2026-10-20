use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng},
    Aes256Gcm,
};
use argon2::{Algorithm, Argon2, Params, Version as Argon2Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;

pub(crate) const ENC_PREFIX: &str = "ENC:v1:";
const ARGON2_MEM_KB: u32 = 65536;
const ARGON2_TIME: u32 = 3;
const ARGON2_PARALLEL: u32 = 1;
const DERIVED_LEN: usize = 64;

/// `device_secret` (secret Argon2 / « pepper ») lie la dérivation à la session
/// Windows : sans lui, une base copiée ne permet de tester aucun mot de passe.
pub(crate) fn derive_64(password: &str, salt: &[u8], device_secret: Option<&[u8; 32]>) -> Result<[u8; DERIVED_LEN], String> {
    let params = Params::new(ARGON2_MEM_KB, ARGON2_TIME, ARGON2_PARALLEL, Some(DERIVED_LEN))
        .map_err(|e| e.to_string())?;
    let argon2 = match device_secret {
        Some(s) => Argon2::new_with_secret(s, Algorithm::Argon2id, Argon2Version::V0x13, params)
            .map_err(|e| e.to_string())?,
        None => Argon2::new(Algorithm::Argon2id, Argon2Version::V0x13, params),
    };
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

pub(crate) fn maybe_enc_opt(key: &Option<[u8; 32]>, s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| maybe_enc(key, v))
}

pub(crate) fn maybe_dec_opt(key: &Option<[u8; 32]>, s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| maybe_dec(key, v))
}

/// `path` est `root` lui-même ou l'un de ses sous-dossiers.
pub(crate) fn in_tree(path: &str, root: &str) -> bool {
    path == root || (path.len() > root.len() && path.starts_with(root) && path.as_bytes()[root.len()] == b'/')
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

pub(crate) fn generate_dek() -> [u8; 32] {
    let mut dek = [0u8; 32];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut dek);
    dek
}

pub(crate) fn encrypt_dek(dek: &[u8; 32], kek: &[u8; 32]) -> (String, String) {
    let cipher = Aes256Gcm::new_from_slice(kek).expect("32-byte KEK");
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ct = cipher
        .encrypt(&nonce, dek.as_ref())
        .expect("DEK encryption failure");
    (
        B64.encode(nonce.as_slice()),
        B64.encode(&ct),
    )
}

pub(crate) fn decrypt_dek(nonce_b64: &str, ct_b64: &str, kek: &[u8; 32]) -> Result<[u8; 32], String> {
    let cipher = Aes256Gcm::new_from_slice(kek).expect("32-byte KEK");
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    let ct = B64.decode(ct_b64).map_err(|e| e.to_string())?;
    let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ct.as_ref()).map_err(|_| "DEK decryption failed")?;
    let mut dek = [0u8; 32];
    if plaintext.len() != 32 {
        return Err("DEK has wrong length".to_string());
    }
    dek.copy_from_slice(&plaintext);
    Ok(dek)
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
    for (id, m) in collect_rows2(db, "SELECT id, message FROM note_versions")? {
        if !m.starts_with(ENC_PREFIX) {
            db.execute("UPDATE note_versions SET message=?1 WHERE id=?2", params![encrypt_value(key, &m), id])
                .map_err(|e| e.to_string())?;
        }
    }
    for (id, f) in collect_rows2(db, "SELECT id, folder FROM notes WHERE folder IS NOT NULL")? {
        if !f.starts_with(ENC_PREFIX) {
            db.execute("UPDATE notes SET folder=?1 WHERE id=?2", params![encrypt_value(key, &f), id])
                .map_err(|e| e.to_string())?;
        }
    }
    for p in collect_rows1(db, "SELECT path FROM folders")? {
        if !p.starts_with(ENC_PREFIX) {
            db.execute("UPDATE folders SET path=?1 WHERE path=?2", params![encrypt_value(key, &p), p])
                .map_err(|e| e.to_string())?;
        }
    }
    for k in collect_rows1(db, "SELECT item_key FROM item_colors")? {
        if !k.starts_with(ENC_PREFIX) {
            db.execute("UPDATE item_colors SET item_key=?1 WHERE item_key=?2", params![encrypt_value(key, &k), k])
                .map_err(|e| e.to_string())?;
        }
    }
    for (k, v) in collect_rows2(db, "SELECT key, value FROM user_data")? {
        if !v.starts_with(ENC_PREFIX) {
            db.execute("UPDATE user_data SET value=?1 WHERE key=?2", params![encrypt_value(key, &v), k])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn collect_rows1(db: &Connection, sql: &str) -> Result<Vec<String>, String> {
    let mut s = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn dec_or_keep(key: &[u8; 32], v: String) -> Result<String, String> {
    if v.starts_with(ENC_PREFIX) { decrypt_value(key, &v) } else { Ok(v) }
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
    for (id, m) in collect_rows2(db, "SELECT id, message FROM note_versions")? {
        db.execute("UPDATE note_versions SET message=?1 WHERE id=?2", params![dec_or_keep(key, m)?, id])
            .map_err(|e| e.to_string())?;
    }
    for (id, f) in collect_rows2(db, "SELECT id, folder FROM notes WHERE folder IS NOT NULL")? {
        db.execute("UPDATE notes SET folder=?1 WHERE id=?2", params![dec_or_keep(key, f)?, id])
            .map_err(|e| e.to_string())?;
    }
    for (k, v) in collect_rows2(db, "SELECT key, value FROM user_data")? {
        db.execute("UPDATE user_data SET value=?1 WHERE key=?2", params![dec_or_keep(key, v)?, k])
            .map_err(|e| e.to_string())?;
    }

    // Une fois déchiffrés, deux chemins/clés peuvent coïncider (clé primaire) :
    // on vide puis on réinsère en dédupliquant, les dossiers actifs passant en premier.
    let mut folders: Vec<(String, Option<String>)> = {
        let mut s = db.prepare("SELECT path, deleted_at FROM folders").map_err(|e| e.to_string())?;
        let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    for f in folders.iter_mut() {
        f.0 = dec_or_keep(key, std::mem::take(&mut f.0))?;
    }
    folders.sort_by_key(|f| f.1.is_some());
    db.execute("DELETE FROM folders", []).map_err(|e| e.to_string())?;
    for (p, d) in folders {
        db.execute("INSERT OR IGNORE INTO folders(path, deleted_at) VALUES(?1,?2)", params![p, d])
            .map_err(|e| e.to_string())?;
    }

    let colors = collect_rows2(db, "SELECT item_key, color FROM item_colors")?;
    db.execute("DELETE FROM item_colors", []).map_err(|e| e.to_string())?;
    for (k, c) in colors {
        db.execute("INSERT OR REPLACE INTO item_colors(item_key, color) VALUES(?1,?2)", params![dec_or_keep(key, k)?, c])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRETS: [&str; 6] = ["Journal intime", "Santé/Psy", "rdv psy mardi", "Mémoire perso", "prompt perso", "Modifier : Journal intime"];

    fn dump(db: &Connection) -> String {
        let mut out = String::new();
        for t in ["notes", "folders", "item_colors", "note_versions", "user_data"] {
            let mut s = db.prepare(&format!("SELECT * FROM {}", t)).unwrap();
            let n = s.column_count();
            let mut rows = s.query([]).unwrap();
            while let Some(r) = rows.next().unwrap() {
                for i in 0..n {
                    if let Ok(Some(v)) = r.get::<_, Option<String>>(i) { out.push_str(&v); out.push('|'); }
                }
            }
        }
        out
    }

    #[test]
    fn encrypt_all_hides_personal_data_and_roundtrips() {
        let dir = std::env::temp_dir().join(format!("natia-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        db.execute("INSERT INTO notes(id,title,tags,folder,created_at,updated_at) VALUES(?1,'Journal intime','[]','Santé/Psy','t','t')", [&id]).unwrap();
        db.execute("INSERT INTO folders(path) VALUES('Santé'),('Santé/Psy')", []).unwrap();
        db.execute("INSERT INTO folders(path, deleted_at) VALUES('Santé/Old', 't')", []).unwrap();
        db.execute("INSERT INTO item_colors(item_key,color) VALUES('folder:Santé/Psy','#f00')", []).unwrap();
        db.execute("INSERT INTO note_versions(id,note_id,content,message,created_at) VALUES('v1',?1,'rdv psy mardi','Modifier : Journal intime','t')", [&id]).unwrap();
        db.execute("INSERT INTO user_data(key,value) VALUES('memory_nodes','Mémoire perso'),('shadow_prompt_library','prompt perso')", []).unwrap();
        std::fs::write(dir.join(format!("{}.html", id)), "rdv psy mardi").unwrap();

        let key = generate_dek();
        encrypt_all_data(&db, &dir, &key).unwrap();
        let enc = dump(&db) + &std::fs::read_to_string(dir.join(format!("{}.html", id))).unwrap();
        for s in SECRETS.iter().chain(["Santé", "Old"].iter()) {
            assert!(!enc.contains(s), "texte en clair trouvé après chiffrement : {}", s);
        }

        decrypt_all_data(&db, &dir, &key).unwrap();
        let dec = dump(&db);
        for s in SECRETS.iter().take(5).chain(["folder:Santé/Psy", "Santé/Old"].iter()) {
            assert!(dec.contains(s), "donnée perdue après déchiffrement : {}", s);
        }
        let deleted: Option<String> = db.query_row("SELECT deleted_at FROM folders WHERE path='Santé/Old'", [], |r| r.get(0)).unwrap();
        assert_eq!(deleted.as_deref(), Some("t"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
