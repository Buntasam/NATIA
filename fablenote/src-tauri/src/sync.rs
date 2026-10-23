// Synchronisation entre plusieurs PC par un dossier partagé (OneDrive, Dropbox, clé USB…).
//
// Tout ce que NATIA écrit dans ce dossier est chiffré (AES-256-GCM) avec une clé tirée du
// mot de passe de synchronisation (Argon2id), le même sur chaque PC : un dossier dans le
// cloud ne contient jamais rien de lisible, même si les notes ne sont pas protégées ici.
//
// Fusion : pour chaque note, on garde l'empreinte de son état à la dernière synchro
// (table sync_notes). Seul ce PC l'a changée → on l'envoie ; seul l'autre → on l'applique ;
// les deux → la version la plus récente reste, l'autre devient une note « (conflit …) ».
// Rien n'est jamais perdu : chaque note modifiée par la synchro garde une version.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

use crate::crypto::{decrypt_bytes, derive_64, encrypt_bytes, is_valid_uuid, maybe_dec, maybe_dec_opt, maybe_enc, maybe_enc_opt};
use crate::db::{keychain_get, keychain_set, save_version_inner};
use crate::AppState;

pub(crate) const SYNC_PASSWORD_NAME: &str = "sync_password";
const KEYCHAIN_MARKER: &str = "__keychain__";
const MANIFEST: &str = "natia-sync.json";
const CHECK_TEXT: &[u8] = b"natia-sync-v1";
const NOTE_EXT: &str = ".natia";

type Key = Option<[u8; 32]>;

// ─── Réglages ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SyncConfig {
    pub enabled: bool,
    pub dir: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct SyncReport {
    pub sent: u32,
    pub received: u32,
    pub conflicts: u32,
    pub deleted: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct SyncStatus {
    pub last: Option<String>,
    pub error: Option<String>,
    pub report: Option<SyncReport>,
}

fn get(db: &Connection, key: &Key, name: &str) -> Option<String> {
    db.query_row("SELECT value FROM settings WHERE key=?1", [name], |r| r.get::<_, String>(0)).ok().map(|v| maybe_dec(key, &v))
}

fn put(db: &Connection, key: &Key, name: &str, value: &str) -> Result<(), String> {
    db.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
        params![name, maybe_enc(key, value)],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Même règle que les clés API : coffre de Windows sans mot de passe NATIA, base chiffrée avec.
fn read_password(db: &Connection, key: &Key) -> String {
    match get(db, key, SYNC_PASSWORD_NAME) {
        Some(v) if v != KEYCHAIN_MARKER => v,
        _ => keychain_get(SYNC_PASSWORD_NAME).unwrap_or_default(),
    }
}

fn write_password(db: &Connection, key: &Key, password: &str) -> Result<(), String> {
    if key.is_none() {
        keychain_set(SYNC_PASSWORD_NAME, password)?;
        put(db, key, SYNC_PASSWORD_NAME, KEYCHAIN_MARKER)
    } else {
        let _ = keychain_set(SYNC_PASSWORD_NAME, "");
        put(db, key, SYNC_PASSWORD_NAME, password)
    }
}

fn read_config(db: &Connection, key: &Key) -> SyncConfig {
    SyncConfig {
        enabled: get(db, key, "sync_enabled").as_deref() == Some("true"),
        dir: get(db, key, "sync_dir").unwrap_or_default(),
        password: read_password(db, key),
    }
}

fn read_status(db: &Connection, key: &Key) -> SyncStatus {
    SyncStatus {
        last: get(db, key, "sync_last").filter(|s| !s.is_empty()),
        error: get(db, key, "sync_error").filter(|s| !s.is_empty()),
        report: get(db, key, "sync_report").and_then(|r| serde_json::from_str(&r).ok()),
    }
}

// ─── Clé du dossier partagé ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct Manifest {
    format: u32,
    salt: String,
    /// `CHECK_TEXT` chiffré : vérifie le mot de passe sans rien déchiffrer d'autre.
    check: String,
}

/// Clé de chiffrement du dossier ; crée le dossier et son en-tête à la première synchro.
fn folder_key(dir: &Path, password: &str) -> Result<[u8; 32], String> {
    if password.chars().count() < 8 { return Err("Mot de passe de synchronisation : 8 caractères minimum".to_string()); }
    let manifest_path = dir.join(MANIFEST);
    let derive = |salt: &[u8]| -> Result<[u8; 32], String> {
        let d = derive_64(password, salt, None)?;
        let mut k = [0u8; 32];
        k.copy_from_slice(&d[32..64]);
        Ok(k)
    };
    if let Ok(raw) = std::fs::read_to_string(&manifest_path) {
        let m: Manifest = serde_json::from_str(&raw).map_err(|_| "Dossier de synchronisation illisible".to_string())?;
        let salt = B64.decode(&m.salt).map_err(|e| e.to_string())?;
        let key = derive(&salt)?;
        let check = B64.decode(&m.check).map_err(|e| e.to_string())?;
        if decrypt_bytes(&key, &check).ok().as_deref() != Some(CHECK_TEXT) {
            return Err("Mot de passe de synchronisation incorrect : il doit être le même sur chaque PC".to_string());
        }
        return Ok(key);
    }
    std::fs::create_dir_all(dir.join("notes")).map_err(|e| e.to_string())?;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = derive(&salt)?;
    let m = Manifest { format: 1, salt: B64.encode(salt), check: B64.encode(encrypt_bytes(&key, CHECK_TEXT)) };
    write_atomic(&manifest_path, serde_json::to_string_pretty(&m).map_err(|e| e.to_string())?.as_bytes())?;
    Ok(key)
}

/// Écrit à côté puis renomme : l'autre PC ne lit jamais un fichier à moitié copié.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

// ─── Notes : état local et état partagé ───────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub(crate) struct NoteState {
    pub id: String,
    pub title: String,
    /// Tags au format JSON, comme dans la base.
    pub tags: String,
    pub folder: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    /// Supprimée définitivement : l'autre PC la supprime aussi.
    #[serde(default)]
    pub purged: bool,
}

/// Empreinte d'une note, liée à la clé du dossier (rien n'est devinable depuis la base).
fn fingerprint(key: &[u8; 32], n: &NoteState) -> String {
    let mut h = Sha256::new();
    h.update(key);
    for part in [n.title.as_str(), n.tags.as_str(), n.folder.as_deref().unwrap_or(""), n.content.as_str(), n.deleted_at.as_deref().unwrap_or(""), if n.purged { "purged" } else { "" }] {
        h.update((part.len() as u64).to_le_bytes());
        h.update(part.as_bytes());
    }
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

fn local_notes(db: &Connection, notes_dir: &Path, key: &Key) -> Result<HashMap<String, NoteState>, String> {
    let mut stmt = db.prepare("SELECT id, title, tags, folder, created_at, updated_at, deleted_at FROM notes").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?,
        r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?,
    ))).map_err(|e| e.to_string())?;
    let mut out = HashMap::new();
    for row in rows {
        let (id, title, tags, folder, created_at, updated_at, deleted_at) = row.map_err(|e| e.to_string())?;
        let content = std::fs::read_to_string(notes_dir.join(format!("{id}.html"))).map(|c| maybe_dec(key, &c)).unwrap_or_default();
        out.insert(id.clone(), NoteState {
            id, title: maybe_dec(key, &title), tags: maybe_dec(key, &tags), folder: maybe_dec_opt(key, &folder),
            content, created_at, updated_at, deleted_at, purged: false,
        });
    }
    Ok(out)
}

fn remote_notes(dir: &Path, key: &[u8; 32]) -> Result<HashMap<String, NoteState>, String> {
    let mut out = HashMap::new();
    let Ok(entries) = std::fs::read_dir(dir.join("notes")) else { return Ok(out) };
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        // Seuls les fichiers nommés par NATIA : les copies « en conflit » d'OneDrive sont ignorées.
        let Some(id) = name.strip_suffix(NOTE_EXT) else { continue };
        if !is_valid_uuid(id) { continue; }
        let Ok(raw) = std::fs::read(entry.path()) else { continue };
        let Ok(plain) = decrypt_bytes(key, &raw) else { continue };
        if let Ok(n) = serde_json::from_slice::<NoteState>(&plain) {
            if n.id == id { out.insert(n.id.clone(), n); }
        }
    }
    Ok(out)
}

fn write_remote(dir: &Path, key: &[u8; 32], n: &NoteState) -> Result<(), String> {
    let json = serde_json::to_vec(n).map_err(|e| e.to_string())?;
    write_atomic(&dir.join("notes").join(format!("{}{NOTE_EXT}", n.id)), &encrypt_bytes(key, &json))
}

/// Écrit l'état reçu dans la base locale (création, modification, corbeille, suppression).
fn apply_local(db: &Connection, notes_dir: &Path, key: &Key, n: &NoteState, now: &str) -> Result<(), String> {
    if n.purged {
        return crate::notes::purge_note(db, notes_dir, key, &n.id);
    }
    let exists = db.query_row("SELECT 1 FROM notes WHERE id=?1", [&n.id], |_| Ok(())).is_ok();
    if exists {
        db.execute(
            "UPDATE notes SET title=?1, tags=?2, folder=?3, updated_at=?4, deleted_at=?5 WHERE id=?6",
            params![maybe_enc(key, &n.title), maybe_enc(key, &n.tags), maybe_enc_opt(key, &n.folder), n.updated_at, n.deleted_at, n.id],
        ).map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO notes (id, title, tags, folder, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![n.id, maybe_enc(key, &n.title), maybe_enc(key, &n.tags), maybe_enc_opt(key, &n.folder), n.created_at, n.updated_at, n.deleted_at],
        ).map_err(|e| e.to_string())?;
    }
    std::fs::write(notes_dir.join(format!("{}.html", n.id)), maybe_enc(key, &n.content)).map_err(|e| e.to_string())?;
    save_version_inner(db, &n.id, &n.content, "Synchronisé", now, key, false).map_err(|e| e.to_string())?;
    if let Some(f) = &n.folder {
        let mut prefix = String::new();
        for part in f.split('/') {
            if !prefix.is_empty() { prefix.push('/'); }
            prefix.push_str(part);
            crate::notes::create_folder_in(db, key, &prefix)?;
        }
    }
    Ok(())
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME").ok().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| "autre PC".to_string())
}

/// Ce qu'il faut faire d'une note, selon ce qui a changé depuis la dernière synchro.
#[derive(Debug, PartialEq)]
pub(crate) enum Action { Nothing, Send, Receive, Conflict, Adopt }

pub(crate) fn decide(local: Option<&str>, remote: Option<&str>, base: Option<&str>) -> Action {
    match (local, remote) {
        (None, None) => Action::Nothing,
        (Some(l), Some(r)) if l == r => Action::Adopt,
        (Some(l), None) => if base == Some(l) { Action::Nothing } else { Action::Send },
        (None, Some(r)) => if base == Some(r) { Action::Nothing } else { Action::Receive },
        (Some(l), Some(r)) => {
            let local_changed = base != Some(l);
            let remote_changed = base != Some(r);
            match (local_changed, remote_changed) {
                (true, false) => Action::Send,
                (false, true) => Action::Receive,
                _ => Action::Conflict,
            }
        }
    }
}

// ─── Synchronisation ──────────────────────────────────────────────────────────

pub(crate) fn sync_once(db: &Connection, notes_dir: &Path, key: &Key, config: &SyncConfig) -> Result<SyncReport, String> {
    let dir = PathBuf::from(config.dir.trim());
    if config.dir.trim().is_empty() { return Err("Choisissez le dossier de synchronisation".to_string()); }
    if !dir.is_dir() { return Err("Dossier de synchronisation introuvable (disque ou clé USB débranché ?)".to_string()); }
    let fkey = folder_key(&dir, &config.password)?;
    let now = Utc::now().to_rfc3339();

    let local = local_notes(db, notes_dir, key)?;
    let remote = remote_notes(&dir, &fkey)?;
    let bases: HashMap<String, String> = {
        let mut stmt = db.prepare("SELECT note_id, base_hash FROM sync_notes").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    let ids: HashSet<&String> = local.keys().chain(remote.keys()).chain(bases.keys()).collect();

    let mut report = SyncReport::default();
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let set_base = |tx: &Connection, id: &str, hash: &str| -> Result<(), String> {
        tx.execute("INSERT INTO sync_notes(note_id, base_hash) VALUES(?1,?2) ON CONFLICT(note_id) DO UPDATE SET base_hash=?2", params![id, hash])
            .map_err(|e| e.to_string()).map(|_| ())
    };

    for id in ids {
        let mut l = local.get(id).cloned();
        let r = remote.get(id);
        // Absente ici mais connue à la dernière synchro : supprimée définitivement sur ce PC.
        if l.is_none() && bases.contains_key(id) && r.is_some_and(|r| !r.purged) {
            let mut tomb = r.cloned().unwrap();
            tomb.purged = true;
            tomb.content.clear();
            tomb.updated_at = now.clone();
            l = Some(tomb);
        }
        let lh = l.as_ref().map(|n| fingerprint(&fkey, n));
        let rh = r.map(|n| fingerprint(&fkey, n));
        match decide(lh.as_deref(), rh.as_deref(), bases.get(id).map(String::as_str)) {
            Action::Nothing => {}
            Action::Adopt => set_base(&tx, id, lh.as_deref().unwrap())?,
            Action::Send => {
                let n = l.unwrap();
                write_remote(&dir, &fkey, &n)?;
                set_base(&tx, id, lh.as_deref().unwrap())?;
                if n.purged { report.deleted += 1 } else { report.sent += 1 }
            }
            Action::Receive => {
                let n = r.unwrap();
                apply_local(&tx, notes_dir, key, n, &now)?;
                set_base(&tx, id, rh.as_deref().unwrap())?;
                if n.purged { report.deleted += 1 } else { report.received += 1 }
            }
            Action::Conflict => {
                // Les deux PC l'ont changée : la plus récente reste, l'autre devient une copie.
                let (ln, rn) = (l.unwrap(), r.unwrap().clone());
                // Une modification l'emporte sur une suppression définitive ; sinon, la plus récente.
                let local_wins = if ln.purged != rn.purged { rn.purged } else { ln.updated_at >= rn.updated_at };
                let (winner, loser, loser_here) = if local_wins { (ln, rn, false) } else { (rn, ln, true) };
                if !winner.purged {
                    let when = chrono::DateTime::parse_from_rfc3339(&loser.updated_at)
                        .map(|d| d.with_timezone(&chrono::Local).format("%d/%m %H:%M").to_string())
                        .unwrap_or_default();
                    let origin = if loser_here { device_name() } else { "autre PC".to_string() };
                    if !loser.purged {
                        let copy = NoteState {
                            id: Uuid::new_v4().to_string(),
                            title: format!("{} (conflit {} {})", loser.title, origin, when),
                            created_at: now.clone(), updated_at: now.clone(), deleted_at: None, purged: false,
                            ..loser
                        };
                        apply_local(&tx, notes_dir, key, &copy, &now)?;
                        write_remote(&dir, &fkey, &copy)?;
                        set_base(&tx, &copy.id, &fingerprint(&fkey, &copy))?;
                    }
                }
                apply_local(&tx, notes_dir, key, &winner, &now)?;
                write_remote(&dir, &fkey, &winner)?;
                set_base(&tx, id, &fingerprint(&fkey, &winner))?;
                report.conflicts += 1;
            }
        }
    }
    sync_attachments(&tx, notes_dir, key, &dir, &fkey, &mut report)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(report)
}

/// Fichiers joints : jamais modifiés, seulement ajoutés ou supprimés.
fn sync_attachments(db: &Connection, notes_dir: &Path, key: &Key, dir: &Path, fkey: &[u8; 32], report: &mut SyncReport) -> Result<(), String> {
    let remote_dir = dir.join("attachments");
    let local: HashMap<String, crate::attachments::Attachment> = crate::attachments::load_attachments(db, key, None)?
        .into_iter().map(|a| (a.id.clone(), a)).collect();
    let mut remote: HashMap<String, crate::attachments::Attachment> = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(&remote_dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(id) = name.strip_suffix(".meta") else { continue };
            if !is_valid_uuid(id) { continue; }
            let Ok(raw) = std::fs::read(e.path()) else { continue };
            if let Some(a) = decrypt_bytes(fkey, &raw).ok().and_then(|p| serde_json::from_slice::<crate::attachments::Attachment>(&p).ok()) {
                remote.insert(id.to_string(), a);
            }
        }
    }
    let known: HashSet<String> = {
        let mut stmt = db.prepare("SELECT id FROM sync_attachments").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    let ids: HashSet<&String> = local.keys().chain(remote.keys()).chain(known.iter()).collect();
    for id in ids {
        match (local.get(id), remote.get(id), known.contains(id)) {
            (Some(a), None, false) => {
                let bytes = crate::attachments::read_attachment(notes_dir, key, id)?;
                write_atomic(&remote_dir.join(id), &encrypt_bytes(fkey, &bytes))?;
                write_atomic(&remote_dir.join(format!("{id}.meta")), &encrypt_bytes(fkey, &serde_json::to_vec(a).map_err(|e| e.to_string())?))?;
                db.execute("INSERT OR IGNORE INTO sync_attachments(id) VALUES(?1)", [id]).map_err(|e| e.to_string())?;
            }
            (None, Some(a), false) => {
                let Ok(raw) = std::fs::read(remote_dir.join(id)) else { continue };
                let bytes = decrypt_bytes(fkey, &raw)?;
                // La note a pu ne pas encore arriver : on réessaiera à la prochaine synchro.
                if db.query_row("SELECT 1 FROM notes WHERE id=?1", [&a.note_id], |_| Ok(())).is_err() { continue; }
                crate::attachments::store_attachment(db, notes_dir, key, &a.id, &a.note_id, &a.name, &bytes, &a.created_at)?;
                db.execute("INSERT OR IGNORE INTO sync_attachments(id) VALUES(?1)", [id]).map_err(|e| e.to_string())?;
            }
            (Some(_), Some(_), _) => {
                db.execute("INSERT OR IGNORE INTO sync_attachments(id) VALUES(?1)", [id]).map_err(|e| e.to_string())?;
            }
            // Supprimé sur ce PC depuis la dernière synchro : supprimé du dossier.
            (None, Some(_), true) => {
                let _ = std::fs::remove_file(remote_dir.join(id));
                let _ = std::fs::remove_file(remote_dir.join(format!("{id}.meta")));
                db.execute("DELETE FROM sync_attachments WHERE id=?1", [id]).map_err(|e| e.to_string())?;
            }
            // Supprimé sur l'autre PC : supprimé ici.
            (Some(_), None, true) => {
                db.execute("DELETE FROM attachments WHERE id=?1", [id]).map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(crate::attachments::attachments_dir(notes_dir).join(id));
                db.execute("DELETE FROM sync_attachments WHERE id=?1", [id]).map_err(|e| e.to_string())?;
                report.deleted += 1;
            }
            (None, None, _) => {
                db.execute("DELETE FROM sync_attachments WHERE id=?1", [id]).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

// ─── Dossiers des applications cloud ──────────────────────────────────────────
// OneDrive, Dropbox et Google Drive pour ordinateur créent un dossier local qu'ils
// copient eux-mêmes dans le cloud : NATIA y range simplement son dossier chiffré.

/// Sous-dossier créé dans le dossier cloud.
pub(crate) const CLOUD_SUBFOLDER: &str = "NATIA-sync";

#[derive(Serialize, Debug, PartialEq)]
pub struct CloudFolder {
    /// "onedrive", "dropbox" ou "gdrive".
    pub provider: &'static str,
    /// Dossier racine de l'application cloud.
    pub root: String,
    /// Précision quand il y en a plusieurs (« personnel », « professionnel »…).
    pub label: String,
}

/// Dossiers Dropbox déclarés dans son `info.json` (`{"personal": {"path": …}, "business": {…}}`).
pub(crate) fn dropbox_paths(info_json: &str) -> Vec<(String, String)> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(info_json) else { return vec![] };
    let Some(obj) = v.as_object() else { return vec![] };
    obj.iter()
        .filter_map(|(kind, acc)| Some((kind.clone(), acc.get("path")?.as_str()?.to_string())))
        .collect()
}

fn detect_cloud() -> Vec<CloudFolder> {
    let mut out: Vec<CloudFolder> = Vec::new();
    let mut push = |provider: &'static str, root: PathBuf, label: &str| {
        if root.is_dir() && !out.iter().any(|c| Path::new(&c.root) == root) {
            out.push(CloudFolder { provider, root: root.to_string_lossy().into_owned(), label: label.to_string() });
        }
    };
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());

    // OneDrive : variables posées par l'application (personnel et professionnel).
    if let Some(p) = env("OneDriveConsumer") { push("onedrive", PathBuf::from(p), "personnel"); }
    if let Some(p) = env("OneDriveCommercial") { push("onedrive", PathBuf::from(p), "professionnel"); }
    if let Some(p) = env("OneDrive") { push("onedrive", PathBuf::from(p), ""); }

    // Dropbox : info.json de l'application.
    for base in [env("APPDATA"), env("LOCALAPPDATA")].into_iter().flatten() {
        if let Ok(raw) = std::fs::read_to_string(Path::new(&base).join("Dropbox").join("info.json")) {
            for (kind, path) in dropbox_paths(&raw) {
                push("dropbox", PathBuf::from(path), if kind == "business" { "professionnel" } else { "personnel" });
            }
        }
    }
    if let Some(home) = env("USERPROFILE") { push("dropbox", Path::new(&home).join("Dropbox"), ""); }

    // Google Drive pour ordinateur : un lecteur (souvent G:) contenant « Mon Drive ».
    for letter in b'D'..=b'Z' {
        for name in ["Mon Drive", "My Drive", "Mi unidad", "Meine Ablage", "Il mio Drive", "Meu Drive"] {
            push("gdrive", PathBuf::from(format!("{}:\\{}", letter as char, name)), "");
        }
    }
    if let Some(home) = env("USERPROFILE") { push("gdrive", Path::new(&home).join("Google Drive"), ""); }
    out
}

/// Applications cloud présentes sur ce PC, avec leur dossier.
#[tauri::command]
pub async fn detect_cloud_folders() -> Result<Vec<CloudFolder>, String> {
    Ok(detect_cloud())
}

/// Crée (si besoin) le dossier NATIA dans le dossier cloud et renvoie son chemin.
#[tauri::command]
pub fn prepare_cloud_folder(root: String) -> Result<String, String> {
    let root = PathBuf::from(root.trim());
    // Seul un dossier détecté est accepté : pas de chemin arbitraire depuis l'interface.
    if !detect_cloud().iter().any(|c| Path::new(&c.root) == root) {
        return Err("Dossier cloud introuvable sur ce PC".to_string());
    }
    let dir = root.join(CLOUD_SUBFOLDER);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

// ─── Commandes ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_sync_config(state: State<AppState>) -> Result<(SyncConfig, SyncStatus), String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok((read_config(&db, &key), read_status(&db, &key)))
}

#[tauri::command]
pub fn set_sync_config(config: SyncConfig, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let dir = PathBuf::from(config.dir.trim());
    if config.enabled {
        if config.dir.trim().is_empty() || !dir.is_dir() { return Err("Choisissez le dossier de synchronisation".to_string()); }
        // Vérifie tout de suite le mot de passe (ou prépare le dossier s'il est neuf).
        folder_key(&dir, &config.password)?;
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let previous = read_config(&db, &key);
    // Autre dossier ou autre mot de passe : tout est comparé à nouveau, sans rien perdre.
    if previous.dir.trim() != config.dir.trim() || previous.password != config.password {
        db.execute("DELETE FROM sync_notes", []).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM sync_attachments", []).map_err(|e| e.to_string())?;
    }
    put(&db, &key, "sync_enabled", if config.enabled { "true" } else { "false" })?;
    put(&db, &key, "sync_dir", config.dir.trim())?;
    write_password(&db, &key, &config.password)
}

/// Synchronise maintenant (si activée) et renvoie l'état.
#[tauri::command]
pub async fn run_sync(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    crate::require_unlocked(&state)?;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let config = read_config(&db, &key);
    if !config.enabled { return Ok(read_status(&db, &key)); }
    match sync_once(&db, &state.notes_dir, &key, &config) {
        Ok(report) => {
            put(&db, &key, "sync_last", &Utc::now().to_rfc3339())?;
            put(&db, &key, "sync_error", "")?;
            put(&db, &key, "sync_report", &serde_json::to_string(&report).map_err(|e| e.to_string())?)?;
        }
        Err(e) => put(&db, &key, "sync_error", &e)?,
    }
    Ok(read_status(&db, &key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dropbox_info_lists_accounts() {
        let paths = dropbox_paths(r#"{"personal":{"path":"C:\\Users\\a\\Dropbox","host":1},"business":{"path":"D:\\Dropbox (Pro)"}}"#);
        assert!(paths.contains(&("personal".to_string(), "C:\\Users\\a\\Dropbox".to_string())));
        assert!(paths.contains(&("business".to_string(), "D:\\Dropbox (Pro)".to_string())));
        assert!(dropbox_paths("pas du json").is_empty());
    }

    #[test]
    fn decisions_follow_what_changed() {
        use Action::*;
        assert_eq!(decide(Some("a"), Some("a"), None), Adopt);
        assert_eq!(decide(Some("b"), Some("a"), Some("a")), Send);
        assert_eq!(decide(Some("a"), Some("b"), Some("a")), Receive);
        assert_eq!(decide(Some("b"), Some("c"), Some("a")), Conflict);
        assert_eq!(decide(Some("b"), Some("c"), None), Conflict);
        assert_eq!(decide(Some("a"), None, None), Send);
        assert_eq!(decide(None, Some("a"), None), Receive);
        assert_eq!(decide(Some("a"), None, Some("a")), Nothing);
    }

    struct Pc { db: Connection, notes: PathBuf }

    fn pc(tag: &str) -> Pc {
        let root = std::env::temp_dir().join(format!("natia-sync-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("notes")).unwrap();
        let db = Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        Pc { db, notes: root.join("notes") }
    }

    fn write_note(p: &Pc, id: &str, title: &str, content: &str, updated: &str) {
        p.db.execute(
            "INSERT INTO notes (id, title, tags, created_at, updated_at) VALUES (?1,?2,'[]','t',?3)
             ON CONFLICT(id) DO UPDATE SET title=?2, updated_at=?3",
            params![id, title, updated],
        ).unwrap();
        std::fs::write(p.notes.join(format!("{id}.html")), content).unwrap();
    }

    fn content(p: &Pc, id: &str) -> String { std::fs::read_to_string(p.notes.join(format!("{id}.html"))).unwrap() }

    #[test]
    fn two_pcs_converge_without_losing_anything() {
        let shared = std::env::temp_dir().join(format!("natia-sync-shared-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&shared);
        std::fs::create_dir_all(&shared).unwrap();
        let config = SyncConfig { enabled: true, dir: shared.to_string_lossy().into_owned(), password: "phrase-commune".into() };
        let (a, b) = (pc("a"), pc("b"));
        let id = Uuid::new_v4().to_string();

        // A crée, B reçoit.
        write_note(&a, &id, "Courses", "<p>pain</p>", "2026-10-23T10:00:00Z");
        assert_eq!(sync_once(&a.db, &a.notes, &None, &config).unwrap().sent, 1);
        assert_eq!(sync_once(&b.db, &b.notes, &None, &config).unwrap().received, 1);
        assert_eq!(content(&b, &id), "<p>pain</p>");

        // B modifie, A reçoit.
        write_note(&b, &id, "Courses", "<p>pain, lait</p>", "2026-10-23T11:00:00Z");
        sync_once(&b.db, &b.notes, &None, &config).unwrap();
        assert_eq!(sync_once(&a.db, &a.notes, &None, &config).unwrap().received, 1);
        assert_eq!(content(&a, &id), "<p>pain, lait</p>");

        // Les deux modifient : la plus récente gagne, l'autre devient une copie « conflit ».
        write_note(&a, &id, "Courses", "<p>version A</p>", "2026-10-23T12:00:00Z");
        write_note(&b, &id, "Courses", "<p>version B</p>", "2026-10-23T12:30:00Z");
        sync_once(&a.db, &a.notes, &None, &config).unwrap();
        let r = sync_once(&b.db, &b.notes, &None, &config).unwrap();
        assert_eq!(r.conflicts, 1);
        assert_eq!(content(&b, &id), "<p>version B</p>");
        sync_once(&a.db, &a.notes, &None, &config).unwrap();
        assert_eq!(content(&a, &id), "<p>version B</p>");
        let copies: i64 = a.db.query_row("SELECT COUNT(*) FROM notes WHERE title LIKE 'Courses (conflit%'", [], |r| r.get(0)).unwrap();
        assert_eq!(copies, 1, "la version A est gardée en copie");

        // Rien de lisible dans le dossier partagé.
        for e in std::fs::read_dir(shared.join("notes")).unwrap() {
            let raw = std::fs::read(e.unwrap().path()).unwrap();
            assert!(!raw.windows(7).any(|w| w == b"version"), "contenu chiffré");
        }

        // Mauvais mot de passe : refusé, rien n'est touché.
        let wrong = SyncConfig { password: "autre-phrase".into(), ..config.clone() };
        assert!(sync_once(&a.db, &a.notes, &None, &wrong).is_err());

        // Suppression définitive sur A : supprimée sur B.
        crate::notes::purge_note(&a.db, &a.notes, &None, &id).unwrap();
        assert_eq!(sync_once(&a.db, &a.notes, &None, &config).unwrap().deleted, 1);
        assert_eq!(sync_once(&b.db, &b.notes, &None, &config).unwrap().deleted, 1);
        assert!(b.db.query_row("SELECT 1 FROM notes WHERE id=?1", [&id], |_| Ok(())).is_err());

        // Une synchro de plus ne change plus rien.
        assert_eq!(sync_once(&a.db, &a.notes, &None, &config).unwrap(), SyncReport::default());
        let _ = std::fs::remove_dir_all(&shared);
    }
}
