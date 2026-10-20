use chrono::Utc;
use rusqlite::{Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;
use uuid::Uuid;

use crate::{AppState, Note, NoteMetadata, ReminderItem, TrashItem, Version};
use crate::crypto::{in_tree, is_valid_uuid, maybe_dec, maybe_dec_opt, maybe_enc, maybe_enc_opt, sanitize_name};
use crate::db::{delete_color_where, load_color_rows, save_version_inner, upsert_color};

// ─── Folder helpers ───────────────────────────────────────────────────────────
// Les chemins de dossiers sont chiffrés avec un nonce aléatoire quand un mot de
// passe est actif : aucune comparaison/LIKE possible en SQL, tout le filtrage
// se fait ici après déchiffrement, et les écritures ciblent la valeur brute.

struct FolderRow { raw: String, path: String, deleted: bool }
struct NoteFolderRow { id: String, folder: Option<String>, deleted: bool }

fn load_folder_rows(db: &rusqlite::Connection, key: &Option<[u8; 32]>) -> Result<Vec<FolderRow>, String> {
    let mut s = db.prepare("SELECT path, deleted_at FROM folders").map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(raw, d)| FolderRow { path: maybe_dec(key, &raw), raw, deleted: d.is_some() }).collect())
}

fn load_note_folder_rows(db: &rusqlite::Connection, key: &Option<[u8; 32]>) -> Result<Vec<NoteFolderRow>, String> {
    let mut s = db.prepare("SELECT id, folder, deleted_at FROM notes").map_err(|e| e.to_string())?;
    let rows = s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, f, d)| NoteFolderRow { id, folder: maybe_dec_opt(key, &f), deleted: d.is_some() }).collect())
}

fn folder_color_in_tree(color_key: &str, root: &str) -> bool {
    color_key.strip_prefix("folder:").map(|p| in_tree(p, root)).unwrap_or(false)
}

// ─── Reminder helpers ─────────────────────────────────────────────────────────

fn attr_value(html: &str, attr: &str) -> String {
    let search = format!("{}=\"", attr);
    if let Some(pos) = html.find(&search) {
        let start = pos + search.len();
        if let Some(end) = html[start..].find('"') {
            return html[start..start + end].to_string();
        }
    }
    String::new()
}

fn strip_html_tags(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.trim().to_string()
}

fn parse_reminders(note_id: &str, note_title: &str, html: &str) -> Vec<ReminderItem> {
    let mut items = Vec::new();
    let marker = "data-type=\"reminder\"";
    let mut rest = html;
    while let Some(marker_pos) = rest.find(marker) {
        let before = &rest[..marker_pos];
        let tag_start = before.rfind('<').unwrap_or(0);
        let tag_end = rest[tag_start..].find('>').map(|p| tag_start + p + 1).unwrap_or(tag_start + 1);
        let tag_attrs = &rest[tag_start..tag_end];
        let due_date = attr_value(tag_attrs, "data-due");
        let done_str = attr_value(tag_attrs, "data-done");
        let done = done_str == "true";
        let content_start = tag_end;
        let content_end = rest[content_start..].find("</div>").map(|p| content_start + p).unwrap_or(content_start);
        let raw_text = &rest[content_start..content_end];
        let text = strip_html_tags(raw_text);
        if !due_date.is_empty() {
            items.push(ReminderItem {
                note_id: note_id.to_string(),
                note_title: note_title.to_string(),
                due_date,
                done,
                text: if text.is_empty() { "Rappel".to_string() } else { text },
            });
        }
        rest = &rest[marker_pos + marker.len()..];
    }
    items
}

#[tauri::command]
pub fn get_all_reminders(state: State<AppState>) -> Result<Vec<ReminderItem>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let note_pairs: Vec<(String, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT id, title FROM notes WHERE deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let x = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        x
    };
    let mut all_reminders = Vec::new();
    for (id, raw_title) in &note_pairs {
        let title = maybe_dec(&key, raw_title);
        let file_path = state.notes_dir.join(format!("{}.html", id));
        if !file_path.exists() { continue; }
        let raw_html = match std::fs::read_to_string(&file_path) {
            Ok(h) => h,
            Err(_) => continue,
        };
        let html = maybe_dec(&key, &raw_html);
        let reminders = parse_reminders(id, &title, &html);
        all_reminders.extend(reminders);
    }
    Ok(all_reminders)
}

// ─── Note commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_notes(state: State<AppState>) -> Result<Vec<NoteMetadata>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, title, tags, folder, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
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
            NoteMetadata { id, title, tags, folder: maybe_dec_opt(&key, &folder), created_at, updated_at }
        })
        .collect();
    Ok(notes)
}

#[tauri::command]
pub fn get_note(id: String, state: State<AppState>) -> Result<Note, String> {
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
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
    Ok(Note { id, title, content, tags, folder: maybe_dec_opt(&key, &folder), created_at, updated_at })
}

#[tauri::command]
pub fn create_note(
    title: String,
    content: String,
    tags: Vec<String>,
    folder: Option<String>,
    state: State<AppState>,
) -> Result<Note, String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO notes (id, title, tags, folder, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![id, maybe_enc(&key, &title), maybe_enc(&key, &tags_json), maybe_enc_opt(&key, &folder), now, now],
        ).map_err(|e| e.to_string())?;
    }
    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
    Ok(Note { id, title, content, tags, folder, created_at: now.clone(), updated_at: now })
}

#[tauri::command]
pub fn update_note(
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    folder: Option<String>,
    label: Option<String>,
    state: State<AppState>,
) -> Result<Note, String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE notes SET title=?1, tags=?2, folder=?3, updated_at=?4 WHERE id=?5",
            params![maybe_enc(&key, &title), maybe_enc(&key, &tags_json), maybe_enc_opt(&key, &folder), now, id],
        ).map_err(|e| e.to_string())?;
    }
    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
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
pub fn rename_note(id: String, title: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE notes SET title=?1, updated_at=?2 WHERE id=?3",
        params![maybe_enc(&key, &title), now, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE notes SET deleted_at=?1 WHERE id=?2", params![now, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Version commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn trim_note_versions(note_id: String, keep: i64, state: State<AppState>) -> Result<(), String> {
    if keep <= 0 { return Ok(()); }
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
pub fn get_versions(note_id: String, state: State<AppState>) -> Result<Vec<Version>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, message, created_at FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let versions = stmt
        .query_map([&note_id], |row| {
            let id: String = row.get(0)?;
            let short = id[..8.min(id.len())].to_string();
            let message: String = row.get(1)?;
            Ok(Version { hash: id, short_hash: short, message: maybe_dec(&key, &message), date: row.get(2)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(versions)
}

#[tauri::command]
pub fn get_version_content(note_id: String, hash: String, state: State<AppState>) -> Result<String, String> {
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
pub fn restore_version(note_id: String, hash: String, state: State<AppState>) -> Result<Note, String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&note_id) || !is_valid_uuid(&hash) { return Err("ID invalide".to_string()); }
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

// ─── Folder commands ──────────────────────────────────────────────────────────
// Chaque commande délègue à une fonction `*_in` sur une connexion brute, testable
// sans Tauri (voir les tests en bas du fichier).

type Key = Option<[u8; 32]>;

fn get_folders_in(db: &rusqlite::Connection, key: &Key) -> Result<Vec<String>, String> {
    let mut folders: Vec<String> = load_folder_rows(db, key)?
        .into_iter()
        .filter(|f| !f.deleted)
        .map(|f| f.path)
        .collect();
    folders.sort();
    folders.dedup();
    Ok(folders)
}

fn create_folder_in(db: &rusqlite::Connection, key: &Key, path: &str) -> Result<(), String> {
    if load_folder_rows(db, key)?.iter().any(|f| f.path == path) { return Ok(()); }
    db.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [maybe_enc(key, path)]).map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_folder_in(db: &rusqlite::Connection, key: &Key, path: &str, now: &str) -> Result<(), String> {
    for f in load_folder_rows(db, key)?.iter().filter(|f| !f.deleted && in_tree(&f.path, path)) {
        db.execute("UPDATE folders SET deleted_at=?1 WHERE path=?2", params![now, f.raw])
            .map_err(|e| e.to_string())?;
    }
    for n in load_note_folder_rows(db, key)? {
        if !n.deleted && n.folder.as_deref().map(|f| in_tree(f, path)).unwrap_or(false) {
            db.execute("UPDATE notes SET deleted_at=?1 WHERE id=?2", params![now, n.id])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn rename_folder_in(db: &rusqlite::Connection, key: &Key, old_path: &str, new_path: &str) -> Result<(), String> {
    let renamed = |p: &str| format!("{}{}", new_path, &p[old_path.len()..]);

    let rows = load_folder_rows(db, key)?;
    let mut existing: std::collections::HashSet<String> = rows.iter()
        .filter(|f| !in_tree(&f.path, old_path))
        .map(|f| f.path.clone())
        .collect();
    for f in rows.iter().filter(|f| in_tree(&f.path, old_path)) {
        let np = renamed(&f.path);
        if existing.contains(&np) {
            db.execute("DELETE FROM folders WHERE path=?1", [&f.raw]).map_err(|e| e.to_string())?;
        } else {
            db.execute("UPDATE folders SET path=?1 WHERE path=?2", params![maybe_enc(key, &np), f.raw])
                .map_err(|e| e.to_string())?;
            existing.insert(np);
        }
    }
    if !existing.contains(new_path) {
        db.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [maybe_enc(key, new_path)])
            .map_err(|e| e.to_string())?;
    }

    for n in load_note_folder_rows(db, key)? {
        if let Some(f) = n.folder.as_deref().filter(|f| in_tree(f, old_path)) {
            db.execute("UPDATE notes SET folder=?1 WHERE id=?2", params![maybe_enc(key, &renamed(f)), n.id])
                .map_err(|e| e.to_string())?;
        }
    }

    for (raw, plain, color) in load_color_rows(db, key)? {
        if folder_color_in_tree(&plain, old_path) {
            db.execute("DELETE FROM item_colors WHERE item_key=?1", [&raw]).map_err(|e| e.to_string())?;
            upsert_color(db, key, &format!("folder:{}", renamed(&plain["folder:".len()..])), &color)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_folders(state: State<AppState>) -> Result<Vec<String>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    get_folders_in(&db, &key)
}

#[tauri::command]
pub fn create_folder(path: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    create_folder_in(&db, &key, &path)
}

#[tauri::command]
pub fn delete_folder(path: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    delete_folder_in(&db, &key, &path, &Utc::now().to_rfc3339())
}

#[tauri::command]
pub fn rename_folder(old_path: String, new_path: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    rename_folder_in(&db, &key, &old_path, &new_path)
}

#[tauri::command]
pub fn move_note(id: String, folder: Option<String>, state: State<AppState>) -> Result<NoteMetadata, String> {
    crate::require_unlocked(&state)?;
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE notes SET folder=?1, updated_at=?2 WHERE id=?3", params![maybe_enc_opt(&key, &folder), now, id])
        .map_err(|e| e.to_string())?;
    let (raw_title, raw_tags, created_at, updated_at) = db.query_row(
        "SELECT title, tags, created_at, updated_at FROM notes WHERE id=?1",
        [&id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)),
    ).map_err(|e| e.to_string())?;
    let title = maybe_dec(&key, &raw_title);
    let tags_str = maybe_dec(&key, &raw_tags);
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    Ok(NoteMetadata { id, title, tags, folder, created_at, updated_at })
}

// ─── Trash commands ───────────────────────────────────────────────────────────

fn get_trash_in(db: &rusqlite::Connection, key: &Key) -> Result<Vec<TrashItem>, String> {
    let mut items: Vec<TrashItem> = Vec::new();

    let folder_rows: Vec<(String, String)> = {
        let mut stmt = db.prepare("SELECT path, deleted_at FROM folders WHERE deleted_at IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        rows.into_iter().map(|(p, d)| (maybe_dec(key, &p), d)).collect()
    };
    let note_rows: Vec<(String, String, Option<String>, String)> = {
        let mut stmt = db.prepare("SELECT id, title, folder, deleted_at FROM notes WHERE deleted_at IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?))
        }).map_err(|e| e.to_string())?
          .collect::<SqlResult<Vec<_>>>()
          .map_err(|e| e.to_string())?;
        rows.into_iter().map(|(id, t, f, d)| (id, maybe_dec(key, &t), maybe_dec_opt(key, &f), d)).collect()
    };

    let is_child = |p: &str| folder_rows.iter().any(|(df, _)| df != p && in_tree(p, df));
    let top_folders: Vec<&(String, String)> = folder_rows.iter().filter(|(p, _)| !is_child(p)).collect();

    for (path, deleted_at) in &top_folders {
        let note_count = note_rows.iter()
            .filter(|(_, _, f, _)| f.as_deref().map(|f| in_tree(f, path)).unwrap_or(false))
            .count();
        items.push(TrashItem {
            id: path.clone(),
            title: path.split('/').last().unwrap_or(path).to_string(),
            item_type: "folder".to_string(),
            folder: None,
            deleted_at: deleted_at.clone(),
            note_count: Some(note_count as u32),
        });
    }

    for (id, title, folder, deleted_at) in note_rows.iter().cloned() {
        let in_deleted_folder = folder.as_deref()
            .map(|f| top_folders.iter().any(|(df, _)| in_tree(f, df)))
            .unwrap_or(false);
        if in_deleted_folder { continue; }
        items.push(TrashItem { id, title, item_type: "note".to_string(), folder, deleted_at, note_count: None });
    }

    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(items)
}

fn restore_from_trash_in(db: &rusqlite::Connection, key: &Key, id: &str, item_type: &str) -> Result<(), String> {
    if item_type == "note" {
        db.execute("UPDATE notes SET deleted_at=NULL WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
    } else {
        for f in load_folder_rows(db, key)?.iter().filter(|f| in_tree(&f.path, id)) {
            db.execute("UPDATE folders SET deleted_at=NULL WHERE path=?1", [&f.raw])
                .map_err(|e| e.to_string())?;
        }
        for n in load_note_folder_rows(db, key)? {
            if n.folder.as_deref().map(|f| in_tree(f, id)).unwrap_or(false) {
                db.execute("UPDATE notes SET deleted_at=NULL WHERE id=?1", [&n.id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn purge_note(db: &rusqlite::Connection, notes_dir: &std::path::Path, key: &Key, id: &str) -> Result<(), String> {
    db.execute("DELETE FROM notes WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM note_versions WHERE note_id=?1", [id]).map_err(|e| e.to_string())?;
    let color_key = format!("note:{}", id);
    delete_color_where(db, key, |k| k == color_key)?;
    let fp = notes_dir.join(format!("{}.html", id));
    if fp.exists() { let _ = std::fs::remove_file(&fp); }
    Ok(())
}

fn permanent_delete_in(db: &rusqlite::Connection, notes_dir: &std::path::Path, key: &Key, id: &str, item_type: &str) -> Result<(), String> {
    if item_type == "note" {
        return purge_note(db, notes_dir, key, id);
    }
    for n in load_note_folder_rows(db, key)? {
        if n.deleted && n.folder.as_deref().map(|f| in_tree(f, id)).unwrap_or(false) {
            purge_note(db, notes_dir, key, &n.id)?;
        }
    }
    for f in load_folder_rows(db, key)?.iter().filter(|f| f.deleted && in_tree(&f.path, id)) {
        db.execute("DELETE FROM folders WHERE path=?1", [&f.raw]).map_err(|e| e.to_string())?;
    }
    delete_color_where(db, key, |k| folder_color_in_tree(k, id))
}

fn empty_trash_in(db: &rusqlite::Connection, notes_dir: &std::path::Path, key: &Key) -> Result<(), String> {
    for n in load_note_folder_rows(db, key)?.into_iter().filter(|n| n.deleted) {
        purge_note(db, notes_dir, key, &n.id)?;
    }
    let deleted: Vec<FolderRow> = load_folder_rows(db, key)?.into_iter().filter(|f| f.deleted).collect();
    for f in &deleted {
        db.execute("DELETE FROM folders WHERE path=?1", [&f.raw]).map_err(|e| e.to_string())?;
    }
    delete_color_where(db, key, |k| deleted.iter().any(|f| k == format!("folder:{}", f.path)))
}

#[tauri::command]
pub fn get_trash(state: State<AppState>) -> Result<Vec<TrashItem>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    get_trash_in(&db, &key)
}

#[tauri::command]
pub fn restore_from_trash(id: String, item_type: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    restore_from_trash_in(&db, &key, &id, &item_type)
}

#[tauri::command]
pub fn permanent_delete_item(id: String, item_type: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    if item_type == "note" && !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    permanent_delete_in(&db, &state.notes_dir, &key, &id, &item_type)
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    empty_trash_in(&db, &state.notes_dir, &key)
}

#[tauri::command]
pub fn reveal_data_dir(state: State<AppState>) -> Result<String, String> {
    let path = state.notes_dir.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| state.notes_dir.to_string_lossy().to_string());
    let _ = Command::new("explorer").arg(&path).spawn();
    Ok(path)
}

// ─── Export commands ──────────────────────────────────────────────────────────

fn collect_notes_export(db: &rusqlite::Connection) -> Result<Vec<(String, String, String, Option<String>, String, String)>, String> {
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

#[tauri::command]
pub fn export_zip(state: State<AppState>) -> Result<String, String> {
    use std::io::Write;
    use zip::write::FileOptions;
    use base64::{engine::general_purpose::STANDARD as B64, Engine};

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
        let folder = maybe_dec_opt(&enc_key, folder);
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else { String::new() };
        let safe_title = sanitize_name(&title_dec);
        let zip_path = match &folder {
            Some(f) => format!("notes/{}/{}.html", sanitize_name(f), safe_title),
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
    Ok(B64.encode(finished.into_inner()))
}

#[tauri::command]
pub fn save_zip_to_path(path: String, state: State<AppState>) -> Result<(), String> {
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
        let folder = maybe_dec_opt(&enc_key, folder);
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else { String::new() };
        let safe_title = sanitize_name(&title_dec);
        let zip_path = match &folder {
            Some(f) => format!("notes/{}/{}.html", sanitize_name(f), safe_title),
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

#[tauri::command]
pub fn export_note_to_path(note_id: String, path: String, state: State<AppState>) -> Result<(), String> {
    if !is_valid_uuid(&note_id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let raw_title = db
        .query_row("SELECT title FROM notes WHERE id=?1", [&note_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let title = maybe_dec(&key, &raw_title);
    drop(db);
    let file_path = state.notes_dir.join(format!("{}.html", note_id));
    let raw_content = if file_path.exists() {
        std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?
    } else { String::new() };
    let raw_content_dec = maybe_dec(&key, &raw_content);
    let content = ammonia::clean(&raw_content_dec);
    let title_esc = title.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let html = format!(
        "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>{t}</title>\n  <style>body{{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}}</style>\n</head>\n<body>\n<h1>{t}</h1>\n{c}\n</body>\n</html>",
        t = title_esc, c = content,
    );
    std::fs::write(&path, html.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Search ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub folder: Option<String>,
    pub updated_at: String,
    pub snippet: String,
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn make_snippet(text: &str, query: &str, window: usize) -> String {
    let lower = text.to_lowercase();
    let lower_q = query.to_lowercase();
    if let Some(pos) = lower.find(&lower_q) {
        let start = pos.saturating_sub(window);
        let end = (pos + query.len() + window).min(text.len());
        let prefix = if start > 0 { "…" } else { "" };
        let suffix = if end < text.len() { "…" } else { "" };
        format!("{}{}{}", prefix, &text[start..end], suffix)
    } else {
        text.chars().take(120).collect::<String>() + if text.len() > 120 { "…" } else { "" }
    }
}

#[tauri::command]
pub fn search_notes(state: State<AppState>, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() { return Ok(vec![]); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let notes_dir = state.notes_dir.clone();
    let rows: Vec<(String, String, Option<String>, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT id, title, folder, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        }).map_err(|e| e.to_string())?;
        let collected: SqlResult<Vec<_>> = mapped.collect();
        collected.map_err(|e| e.to_string())?
    };
    let lower_q = query.to_lowercase();
    let mut results = Vec::new();
    for (id, enc_title, folder, updated_at) in rows {
        let title = maybe_dec(&key, &enc_title);
        let fp = notes_dir.join(format!("{}.html", id));
        let content_raw = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).unwrap_or_default();
            maybe_dec(&key, &raw)
        } else { String::new() };
        let plain = strip_html(&content_raw);
        if title.to_lowercase().contains(&lower_q) || plain.to_lowercase().contains(&lower_q) {
            let snippet = make_snippet(&plain, &query, 80);
            results.push(SearchResult { id, title, folder: maybe_dec_opt(&key, &folder), updated_at, snippet });
        }
    }
    Ok(results)
}

// ─── Global stats ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct GlobalStats {
    pub trash_count: i64,
    pub version_count: i64,
}

#[tauri::command]
pub fn get_global_stats(state: State<AppState>) -> Result<GlobalStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let trash_count: i64 = db.query_row(
        "SELECT (SELECT COUNT(*) FROM notes WHERE deleted_at IS NOT NULL) + (SELECT COUNT(*) FROM folders WHERE deleted_at IS NOT NULL)",
        [], |r| r.get(0),
    ).unwrap_or(0);
    let version_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM note_versions", [], |r| r.get(0),
    ).unwrap_or(0);
    Ok(GlobalStats { trash_count, version_count })
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::{generate_dek, ENC_PREFIX};

    struct Env { db: rusqlite::Connection, dir: std::path::PathBuf, key: Key }

    impl Drop for Env {
        fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.dir); }
    }

    fn env(encrypted: bool) -> Env {
        let dir = std::env::temp_dir().join(format!("natia-notes-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_db(&db).unwrap();
        Env { db, dir, key: if encrypted { Some(generate_dek()) } else { None } }
    }

    fn add_note(e: &Env, title: &str, folder: Option<&str>) -> String {
        let id = Uuid::new_v4().to_string();
        let folder = folder.map(|f| f.to_string());
        e.db.execute(
            "INSERT INTO notes(id,title,tags,folder,created_at,updated_at) VALUES(?1,?2,?3,?4,'t','t')",
            params![id, maybe_enc(&e.key, title), maybe_enc(&e.key, "[]"), maybe_enc_opt(&e.key, &folder)],
        ).unwrap();
        std::fs::write(e.dir.join(format!("{}.html", id)), maybe_enc(&e.key, "contenu")).unwrap();
        id
    }

    fn note_folder(e: &Env, id: &str) -> Option<String> {
        load_note_folder_rows(&e.db, &e.key).unwrap().into_iter().find(|n| n.id == id).unwrap().folder
    }

    fn note_deleted(e: &Env, id: &str) -> bool {
        load_note_folder_rows(&e.db, &e.key).unwrap().into_iter().find(|n| n.id == id).unwrap().deleted
    }

    fn note_exists(e: &Env, id: &str) -> bool {
        e.db.query_row("SELECT 1 FROM notes WHERE id=?1", [id], |_| Ok(())).is_ok()
    }

    fn colors(e: &Env) -> Vec<String> {
        let mut c: Vec<String> = load_color_rows(&e.db, &e.key).unwrap().into_iter().map(|(_, k, _)| k).collect();
        c.sort();
        c
    }

    fn both(f: impl Fn(Env)) { f(env(false)); f(env(true)); }

    #[test]
    fn create_lists_sorted_without_duplicates() {
        both(|e| {
            for p in ["Travail", "Perso", "Perso/Santé", "Perso"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["Perso", "Perso/Santé", "Travail"]);
        });
    }

    #[test]
    fn rename_moves_subfolders_notes_and_colors_but_not_lookalikes() {
        both(|e| {
            for p in ["Perso", "Perso/Santé", "Perso2"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
            let inside = add_note(&e, "rdv", Some("Perso/Santé"));
            let lookalike = add_note(&e, "autre", Some("Perso2"));
            upsert_color(&e.db, &e.key, "folder:Perso/Santé", "#f00").unwrap();
            upsert_color(&e.db, &e.key, "folder:Perso2", "#0f0").unwrap();

            rename_folder_in(&e.db, &e.key, "Perso", "Privé").unwrap();

            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["Perso2", "Privé", "Privé/Santé"]);
            assert_eq!(note_folder(&e, &inside).as_deref(), Some("Privé/Santé"));
            assert_eq!(note_folder(&e, &lookalike).as_deref(), Some("Perso2"));
            assert_eq!(colors(&e), ["folder:Perso2", "folder:Privé/Santé"]);
        });
    }

    #[test]
    fn rename_onto_existing_folder_merges() {
        both(|e| {
            for p in ["A", "A/x", "B"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
            rename_folder_in(&e.db, &e.key, "A", "B").unwrap();
            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["B", "B/x"]);
            let rows: i64 = e.db.query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0)).unwrap();
            assert_eq!(rows, 2);
        });
    }

    #[test]
    fn delete_trash_restore_roundtrip() {
        both(|e| {
            for p in ["Perso", "Perso/Santé", "Perso2"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
            let inside = add_note(&e, "rdv", Some("Perso/Santé"));
            let lookalike = add_note(&e, "autre", Some("Perso2"));

            delete_folder_in(&e.db, &e.key, "Perso", "2026-01-01").unwrap();
            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["Perso2"]);
            assert!(note_deleted(&e, &inside));
            assert!(!note_deleted(&e, &lookalike));

            let trash = get_trash_in(&e.db, &e.key).unwrap();
            assert_eq!(trash.len(), 1, "seul le dossier parent apparaît, pas ses enfants ni la note");
            assert_eq!((trash[0].id.as_str(), trash[0].item_type.as_str(), trash[0].note_count), ("Perso", "folder", Some(1)));

            restore_from_trash_in(&e.db, &e.key, "Perso", "folder").unwrap();
            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["Perso", "Perso/Santé", "Perso2"]);
            assert!(!note_deleted(&e, &inside));
            assert!(get_trash_in(&e.db, &e.key).unwrap().is_empty());
        });
    }

    #[test]
    fn permanent_delete_purges_folder_tree_only() {
        both(|e| {
            for p in ["Perso", "Perso/Santé", "Perso2"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
            let inside = add_note(&e, "rdv", Some("Perso/Santé"));
            let lookalike = add_note(&e, "autre", Some("Perso2"));
            upsert_color(&e.db, &e.key, "folder:Perso", "#f00").unwrap();
            upsert_color(&e.db, &e.key, &format!("note:{}", inside), "#00f").unwrap();

            delete_folder_in(&e.db, &e.key, "Perso", "2026-01-01").unwrap();
            permanent_delete_in(&e.db, &e.dir, &e.key, "Perso", "folder").unwrap();

            assert!(!note_exists(&e, &inside));
            assert!(!e.dir.join(format!("{}.html", inside)).exists());
            assert!(note_exists(&e, &lookalike));
            assert!(e.dir.join(format!("{}.html", lookalike)).exists());
            assert_eq!(get_folders_in(&e.db, &e.key).unwrap(), ["Perso2"]);
            assert!(colors(&e).is_empty());
            assert!(get_trash_in(&e.db, &e.key).unwrap().is_empty());
        });
    }

    #[test]
    fn empty_trash_keeps_live_notes() {
        both(|e| {
            create_folder_in(&e.db, &e.key, "Vieux").unwrap();
            let in_old = add_note(&e, "a", Some("Vieux"));
            let loose = add_note(&e, "b", None);
            let live = add_note(&e, "c", None);
            delete_folder_in(&e.db, &e.key, "Vieux", "t").unwrap();
            e.db.execute("UPDATE notes SET deleted_at='t' WHERE id=?1", [&loose]).unwrap();

            empty_trash_in(&e.db, &e.dir, &e.key).unwrap();

            assert!(!note_exists(&e, &in_old) && !note_exists(&e, &loose));
            assert!(note_exists(&e, &live));
            assert!(get_folders_in(&e.db, &e.key).unwrap().is_empty());
            assert!(get_trash_in(&e.db, &e.key).unwrap().is_empty());
        });
    }

    #[test]
    fn encrypted_db_never_stores_folder_names_in_clear() {
        let e = env(true);
        for p in ["Perso", "Perso/Santé"] { create_folder_in(&e.db, &e.key, p).unwrap(); }
        add_note(&e, "rdv", Some("Perso/Santé"));
        upsert_color(&e.db, &e.key, "folder:Perso", "#f00").unwrap();
        rename_folder_in(&e.db, &e.key, "Perso", "Privé").unwrap();

        let raw: Vec<String> = ["SELECT path FROM folders", "SELECT folder FROM notes", "SELECT item_key FROM item_colors"]
            .iter()
            .flat_map(|q| {
                let mut s = e.db.prepare(q).unwrap();
                let v: Vec<String> = s.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
                v
            })
            .collect();
        assert!(!raw.is_empty());
        for v in raw {
            assert!(v.starts_with(ENC_PREFIX), "valeur en clair en base : {}", v);
        }
    }
}
