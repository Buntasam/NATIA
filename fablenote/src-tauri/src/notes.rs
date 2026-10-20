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

/// Nom de l'unique fichier visible dans un export protégé.
pub(crate) const PROTECTED_INNER_NAME: &str = "NATIA-notes.zip";

fn build_notes_zip(db: &rusqlite::Connection, notes_dir: &std::path::Path, key: &Key) -> Result<Vec<u8>, String> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    let rows = collect_notes_export(db)?;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut metadata_entries: Vec<serde_json::Value> = Vec::new();
    for (id, title, tags, folder, created_at, updated_at) in &rows {
        let title_dec = maybe_dec(key, title);
        let tags_dec = maybe_dec(key, tags);
        let folder = maybe_dec_opt(key, folder);
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(key, &raw)
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
    Ok(zip.finish().map_err(|e| e.to_string())?.into_inner())
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Protection {
    /// AES-256 : solide, mais l'Explorateur Windows ne sait pas l'ouvrir (7-Zip requis).
    Aes,
    /// ZipCrypto : seul chiffrement que l'Explorateur Windows sait ouvrir, mais cassable
    /// en quelques minutes sans le mot de passe. Arrête un curieux, pas un attaquant.
    WindowsCompatible,
}

/// Le format ZIP laisse les noms de fichiers en clair : l'export complet est donc
/// rangé dans une seule entrée chiffrée, pour ne révéler ni titres ni dossiers.
fn protect_zip(inner: &[u8], password: &str, mode: Protection) -> Result<Vec<u8>, String> {
    use std::io::Write;
    use zip::unstable::write::FileOptionsExt;
    use zip::write::SimpleFileOptions;

    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    match mode {
        Protection::Aes => {
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored)
                .with_aes_encryption(zip::AesMode::Aes256, password);
            zip.start_file(PROTECTED_INNER_NAME, options).map_err(|e| e.to_string())?;
        }
        Protection::WindowsCompatible => {
            // Deflate plutôt que Stored : le début chiffré ne recopie pas l'en-tête ZIP
            // connu du fichier interne, ce qui complique un peu l'attaque à clair connu.
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .with_deprecated_encryption(password.as_bytes());
            zip.start_file(PROTECTED_INNER_NAME, options).map_err(|e| e.to_string())?;
        }
    }
    zip.write_all(inner).map_err(|e| e.to_string())?;
    Ok(zip.finish().map_err(|e| e.to_string())?.into_inner())
}

#[tauri::command]
pub fn save_zip_to_path(path: String, password: Option<String>, mode: Option<String>, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    let protection = match mode.as_deref() {
        None | Some("aes") => Protection::Aes,
        Some("windows") => Protection::WindowsCompatible,
        Some(_) => return Err("Mode d'export inconnu".to_string()),
    };
    if let Some(pw) = password.as_deref() {
        if pw.chars().count() < 8 {
            return Err("Mot de passe d'export : 8 caractères minimum".to_string());
        }
        // L'Explorateur Windows encode les mots de passe selon la page de code locale :
        // un caractère accentué rendrait l'archive impossible à ouvrir.
        if protection == Protection::WindowsCompatible && !pw.chars().all(|c| c.is_ascii_graphic() || c == ' ') {
            return Err("Mode compatible Windows : lettres sans accent, chiffres et symboles uniquement".to_string());
        }
    }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let zip = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        build_notes_zip(&db, &state.notes_dir, &key)?
    };
    let bytes = match password.as_deref() {
        Some(pw) => protect_zip(&zip, pw, protection)?,
        None => zip,
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Import ───────────────────────────────────────────────────────────────────
// Relit les trois formats d'export : classique, protégé AES-256, compatible Windows.

const IMPORT_MAX_BYTES: u64 = 1 << 30;

#[derive(Serialize)]
pub struct ImportInfo { pub protected: bool }

#[derive(Serialize, Debug, PartialEq)]
pub struct ImportReport { pub imported: u32, pub skipped: u32 }

#[derive(Deserialize)]
struct ImportMeta {
    id: Option<String>,
    title: Option<String>,
    tags: Option<String>,
    folder: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

fn open_zip(bytes: Vec<u8>) -> Result<zip::ZipArchive<std::io::Cursor<Vec<u8>>>, String> {
    zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|_| "Ce fichier n'est pas une archive ZIP valide".to_string())
}

fn read_limited(r: impl std::io::Read) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut out = Vec::new();
    r.take(IMPORT_MAX_BYTES + 1).read_to_end(&mut out).map_err(|e| e.to_string())?;
    if out.len() as u64 > IMPORT_MAX_BYTES { return Err("Archive trop volumineuse (1 Go maximum)".to_string()); }
    Ok(out)
}

/// Archive protégée = une seule entrée chiffrée nommée PROTECTED_INNER_NAME.
fn is_protected(archive: &mut zip::ZipArchive<std::io::Cursor<Vec<u8>>>) -> bool {
    archive.len() == 1
        && archive.by_index_raw(0).map(|f| f.encrypted() && f.name() == PROTECTED_INNER_NAME).unwrap_or(false)
}

/// Renvoie l'archive des notes (avec metadata.json), en déchiffrant l'enveloppe si besoin.
fn unwrap_export(bytes: Vec<u8>, password: Option<&str>) -> Result<zip::ZipArchive<std::io::Cursor<Vec<u8>>>, String> {
    let mut outer = open_zip(bytes)?;
    if !is_protected(&mut outer) { return Ok(outer); }
    let pw = password.filter(|p| !p.is_empty()).ok_or("Cette sauvegarde est protégée : mot de passe requis")?;
    let wrong = || "Mot de passe incorrect".to_string();
    // ZipCrypto ne vérifie le mot de passe que sur un octet : un mauvais mot de passe peut
    // passer ce contrôle et produire des données illisibles, d'où la vérification du ZIP interne.
    let inner = outer.by_index_decrypt(0, pw.as_bytes()).map_err(|_| wrong())
        .and_then(|f| read_limited(f).map_err(|_| wrong()))?;
    open_zip(inner).map_err(|_| wrong())
}

/// Nettoie le HTML importé tout en gardant ce que l'éditeur produit
/// (tâches, rappels, post-its, liens entre notes, images, surlignage, tableaux).
fn sanitize_note_html(html: &str) -> String {
    ammonia::Builder::default()
        .add_tags(["input", "label"])
        .add_generic_attributes(["class", "style", "colspan", "rowspan"])
        .generic_attribute_prefixes(["data-"].into_iter().collect())
        .add_tag_attributes("input", ["type", "checked", "disabled"])
        .add_tag_attributes("img", ["src", "alt", "title", "width", "height"])
        .add_tag_attributes("a", ["target"])
        .add_url_schemes(["data"])
        .link_rel(None)
        .clean(html)
        .to_string()
}

fn import_notes_in(
    db: &rusqlite::Connection,
    notes_dir: &std::path::Path,
    key: &Key,
    mut archive: zip::ZipArchive<std::io::Cursor<Vec<u8>>>,
) -> Result<ImportReport, String> {
    let meta: Vec<ImportMeta> = {
        let f = archive.by_name("metadata.json").map_err(|_| "Archive NATIA invalide : metadata.json absent".to_string())?;
        serde_json::from_slice(&read_limited(f)?).map_err(|_| "Archive NATIA invalide : metadata.json illisible".to_string())?
    };
    // L'export écrit les notes dans l'ordre de metadata.json, puis metadata.json en dernier.
    let mut contents: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() || f.name() == "metadata.json" { continue; }
        contents.push(String::from_utf8_lossy(&read_limited(f)?).into_owned());
    }
    if contents.len() != meta.len() {
        return Err("Archive NATIA invalide : notes et index ne correspondent pas".to_string());
    }

    let now = Utc::now().to_rfc3339();
    let mut report = ImportReport { imported: 0, skipped: 0 };
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    for (m, raw_content) in meta.into_iter().zip(contents) {
        let id = m.id.filter(|i| is_valid_uuid(i)).unwrap_or_else(|| Uuid::new_v4().to_string());
        if tx.query_row("SELECT 1 FROM notes WHERE id=?1", [&id], |_| Ok(())).is_ok() {
            report.skipped += 1;
            continue;
        }
        let title = m.title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| "Note importée".to_string());
        let tags = m.tags
            .filter(|t| serde_json::from_str::<Vec<String>>(t).is_ok())
            .unwrap_or_else(|| "[]".to_string());
        let folder = m.folder.map(|f| f.trim_matches('/').to_string()).filter(|f| !f.is_empty());
        let content = sanitize_note_html(&raw_content);

        tx.execute(
            "INSERT INTO notes (id, title, tags, folder, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                id, maybe_enc(key, &title), maybe_enc(key, &tags), maybe_enc_opt(key, &folder),
                m.created_at.unwrap_or_else(|| now.clone()), m.updated_at.unwrap_or_else(|| now.clone()),
            ],
        ).map_err(|e| e.to_string())?;
        std::fs::write(notes_dir.join(format!("{}.html", id)), maybe_enc(key, &content)).map_err(|e| e.to_string())?;
        save_version_inner(&tx, &id, &content, "Importé", &now, key).map_err(|e| e.to_string())?;

        if let Some(f) = &folder {
            let mut prefix = String::new();
            for part in f.split('/') {
                if !prefix.is_empty() { prefix.push('/'); }
                prefix.push_str(part);
                create_folder_in(&tx, key, &prefix)?;
            }
        }
        report.imported += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(report)
}

#[tauri::command]
pub fn inspect_import(path: String) -> Result<ImportInfo, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mut archive = open_zip(bytes)?;
    Ok(ImportInfo { protected: is_protected(&mut archive) })
}

#[tauri::command]
pub fn import_zip(path: String, password: Option<String>, state: State<AppState>) -> Result<ImportReport, String> {
    crate::require_unlocked(&state)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let archive = unwrap_export(bytes, password.as_deref())?;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    import_notes_in(&db, &state.notes_dir, &key, archive)
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

/// Texte déchiffré d'une note, réutilisé tant que son fichier n'a pas changé.
/// Vidé au verrouillage (voir `clear_search_cache`) : aucun texte clair ne reste en mémoire.
pub struct CachedText {
    stamp: (u64, Option<std::time::SystemTime>),
    with_key: bool,
    plain: String,
    folded: String,
}

impl Drop for CachedText {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.plain.zeroize();
        self.folded.zeroize();
    }
}

pub type SearchCache = std::collections::HashMap<String, CachedText>;

pub fn clear_search_cache(state: &AppState) {
    if let Ok(mut c) = state.search_cache.lock() { c.clear(); }
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

/// Minuscules caractère par caractère : même nombre de caractères que l'original,
/// ce qui permet de reporter une position trouvée dans le texte d'origine.
fn fold(s: &str) -> String {
    s.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect()
}

fn char_slice(s: &str, start: usize, end: usize) -> &str {
    let mut idx = s.char_indices().map(|(i, _)| i).chain(std::iter::once(s.len()));
    let from = idx.nth(start).unwrap_or(s.len());
    let to = if end > start { idx.nth(end - start - 1).unwrap_or(s.len()) } else { from };
    &s[from..to]
}

fn make_snippet(text: &str, query: &str, window: usize) -> String {
    let total = text.chars().count();
    let folded = fold(text);
    let q = fold(query);
    match folded.find(&q) {
        Some(byte_pos) => {
            let at = folded[..byte_pos].chars().count();
            let start = at.saturating_sub(window);
            let end = (at + q.chars().count() + window).min(total);
            let prefix = if start > 0 { "…" } else { "" };
            let suffix = if end < total { "…" } else { "" };
            format!("{}{}{}", prefix, char_slice(text, start, end), suffix)
        }
        None => {
            let head = char_slice(text, 0, 120.min(total)).to_string();
            if total > 120 { head + "…" } else { head }
        }
    }
}

fn file_stamp(fp: &std::path::Path) -> (u64, Option<std::time::SystemTime>) {
    std::fs::metadata(fp).map(|m| (m.len(), m.modified().ok())).unwrap_or((0, None))
}

fn search_rows(
    rows: Vec<(String, String, Option<String>, String)>,
    notes_dir: &std::path::Path,
    key: &Key,
    cache: &mut SearchCache,
    query: &str,
) -> Vec<SearchResult> {
    let q = fold(query);
    cache.retain(|id, _| rows.iter().any(|r| &r.0 == id));
    let mut results = Vec::new();
    for (id, enc_title, folder, updated_at) in rows {
        let fp = notes_dir.join(format!("{}.html", id));
        let stamp = file_stamp(&fp);
        let fresh = cache.get(&id).is_some_and(|c| c.stamp == stamp && c.with_key == key.is_some());
        if !fresh {
            let raw = std::fs::read_to_string(&fp).unwrap_or_default();
            let plain = strip_html(&maybe_dec(key, &raw));
            let folded = fold(&plain);
            cache.insert(id.clone(), CachedText { stamp, with_key: key.is_some(), plain, folded });
        }
        let entry = &cache[&id];
        let title = maybe_dec(key, &enc_title);
        if fold(&title).contains(&q) || entry.folded.contains(&q) {
            let snippet = make_snippet(&entry.plain, query, 80);
            results.push(SearchResult { id, title, folder: maybe_dec_opt(key, &folder), updated_at, snippet });
        }
    }
    results
}

/// Asynchrone : Tauri l'exécute hors du fil principal, la fenêtre ne se fige pas.
#[tauri::command]
pub async fn search_notes(state: State<'_, AppState>, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() { return Ok(vec![]); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
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
    let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
    Ok(search_rows(rows, &state.notes_dir, &key, &mut cache, &query))
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
    fn protected_export_hides_titles_and_requires_password() {
        use std::io::Read;
        both(|e| {
            create_folder_in(&e.db, &e.key, "Santé").unwrap();
            add_note(&e, "Journal intime", Some("Santé"));
            let inner = build_notes_zip(&e.db, &e.dir, &e.key).unwrap();
            for mode in [Protection::Aes, Protection::WindowsCompatible] {
                let protected = protect_zip(&inner, "motdepasse-export", mode).unwrap();

                let raw = String::from_utf8_lossy(&protected);
                assert!(!raw.contains("Journal intime") && !raw.contains("Santé"), "{:?} : titre ou dossier visible", mode);

                let mut outer = zip::ZipArchive::new(std::io::Cursor::new(protected.clone())).unwrap();
                assert_eq!(outer.len(), 1);
                assert_eq!(outer.name_for_index(0), Some(PROTECTED_INNER_NAME));
                // ZipCrypto ne vérifie le mot de passe que sur 1 octet : un mauvais mot de passe
                // peut passer ce contrôle, mais la lecture échoue alors (CRC / données invalides).
                let wrong_ok = outer.by_index_decrypt(0, b"mauvais")
                    .map(|mut f| { let mut v = Vec::new(); f.read_to_end(&mut v).is_ok() && zip::ZipArchive::new(std::io::Cursor::new(v)).is_ok() })
                    .unwrap_or(false);
                assert!(!wrong_ok, "{:?} : mauvais mot de passe accepté", mode);

                let mut extracted = Vec::new();
                outer.by_index_decrypt(0, b"motdepasse-export").unwrap().read_to_end(&mut extracted).unwrap();
                let mut notes = zip::ZipArchive::new(std::io::Cursor::new(extracted)).unwrap();
                let mut content = String::new();
                notes.by_name("notes/Santé/Journal intime.html").unwrap().read_to_string(&mut content).unwrap();
                assert_eq!(content, "contenu", "{:?}", mode);
            }
        });
    }

    const RICH_HTML: &str = concat!(
        r##"<p>Texte <mark data-color="#fef08a" style="background-color: #fef08a">surligné</mark> "##,
        r#"<a href="https://exemple.fr" target="_blank">lien</a> <span data-type="wikilink" data-note-id="abc" data-note-title="Autre">[[Autre]]</span></p>"#,
        r#"<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"></label><div><p>tâche</p></div></li></ul>"#,
        r#"<div data-type="reminder" data-due="2026-11-01" data-done="false"><p>rappel</p></div>"#,
        r#"<pre><code class="language-rust">fn main() {}</code></pre>"#,
        r#"<img src="data:image/png;base64,iVBORw0KGgo=" alt="img">"#,
    );

    fn export_bytes(e: &Env, protection: Option<(Protection, &str)>) -> Vec<u8> {
        let inner = build_notes_zip(&e.db, &e.dir, &e.key).unwrap();
        match protection { Some((m, pw)) => protect_zip(&inner, pw, m).unwrap(), None => inner }
    }

    fn note_title_and_content(e: &Env, id: &str) -> (String, String) {
        let raw: String = e.db.query_row("SELECT title FROM notes WHERE id=?1", [id], |r| r.get(0)).unwrap();
        let file = std::fs::read_to_string(e.dir.join(format!("{}.html", id))).unwrap();
        (maybe_dec(&e.key, &raw), maybe_dec(&e.key, &file))
    }

    #[test]
    fn import_roundtrips_every_export_format() {
        for (src_enc, dst_enc) in [(false, false), (true, true), (false, true), (true, false)] {
            for protection in [None, Some((Protection::Aes, "motdepasse-aes")), Some((Protection::WindowsCompatible, "motdepasse-win"))] {
                let src = env(src_enc);
                create_folder_in(&src.db, &src.key, "Perso").unwrap();
                create_folder_in(&src.db, &src.key, "Perso/Santé").unwrap();
                let id = add_note(&src, "Journal intime", Some("Perso/Santé"));
                std::fs::write(src.dir.join(format!("{}.html", id)), maybe_enc(&src.key, RICH_HTML)).unwrap();
                src.db.execute("UPDATE notes SET tags=?1 WHERE id=?2", params![maybe_enc(&src.key, r#"["perso","santé"]"#), id]).unwrap();
                let bytes = export_bytes(&src, protection);

                let dst = env(dst_enc);
                let archive = unwrap_export(bytes.clone(), protection.map(|p| p.1)).unwrap();
                let report = import_notes_in(&dst.db, &dst.dir, &dst.key, archive).unwrap();
                assert_eq!(report, ImportReport { imported: 1, skipped: 0 });

                let (title, content) = note_title_and_content(&dst, &id);
                assert_eq!(title, "Journal intime");
                assert_eq!(note_folder(&dst, &id).as_deref(), Some("Perso/Santé"));
                assert_eq!(get_folders_in(&dst.db, &dst.key).unwrap(), ["Perso", "Perso/Santé"], "dossiers parents créés");
                let tags: String = dst.db.query_row("SELECT tags FROM notes WHERE id=?1", [&id], |r| r.get(0)).unwrap();
                assert_eq!(maybe_dec(&dst.key, &tags), r#"["perso","santé"]"#);
                for keep in ["data-note-id=\"abc\"", "data-type=\"taskList\"", "data-checked=\"true\"", "type=\"checkbox\"",
                             "data-due=\"2026-11-01\"", "class=\"language-rust\"", "data:image/png;base64", "background-color", "target=\"_blank\""] {
                    assert!(content.contains(keep), "{:?} : « {} » perdu à l'import :\n{}", protection.map(|p| p.0), keep, content);
                }

                // Réimporter la même sauvegarde ne crée pas de doublon.
                let again = import_notes_in(&dst.db, &dst.dir, &dst.key, unwrap_export(bytes, protection.map(|p| p.1)).unwrap()).unwrap();
                assert_eq!(again, ImportReport { imported: 0, skipped: 1 });
            }
        }
    }

    #[test]
    fn protected_import_requires_the_right_password() {
        let src = env(false);
        add_note(&src, "secret", None);
        for (mode, pw) in [(Protection::Aes, "motdepasse-aes"), (Protection::WindowsCompatible, "motdepasse-win")] {
            let bytes = export_bytes(&src, Some((mode, pw)));
            assert!(is_protected(&mut open_zip(bytes.clone()).unwrap()));
            assert!(unwrap_export(bytes.clone(), None).unwrap_err().contains("mot de passe requis"));
            assert_eq!(unwrap_export(bytes.clone(), Some("mauvais-mdp")).unwrap_err(), "Mot de passe incorrect", "{:?}", mode);
            assert!(unwrap_export(bytes, Some(pw)).is_ok());
        }
        assert!(!is_protected(&mut open_zip(export_bytes(&src, None)).unwrap()));
        assert!(unwrap_export(b"pas un zip".to_vec(), None).is_err());
    }

    #[test]
    fn imported_html_is_stripped_of_scripts() {
        let evil = r#"<p onclick="x()">a</p><img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">b</a><iframe src="https://mal.example"></iframe>"#;
        let clean = sanitize_note_html(evil);
        for bad in ["onclick", "onerror", "<script", "alert(2)", "javascript:", "<iframe"] {
            assert!(!clean.contains(bad), "« {} » restant : {}", bad, clean);
        }
        assert!(clean.contains("<p>a</p>"));
    }

    fn rows(e: &Env) -> Vec<(String, String, Option<String>, String)> {
        let mut s = e.db.prepare("SELECT id, title, folder, updated_at FROM notes WHERE deleted_at IS NULL").unwrap();
        let v = s.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap().map(|r| r.unwrap()).collect();
        v
    }

    fn write_content(e: &Env, id: &str, html: &str) {
        std::fs::write(e.dir.join(format!("{}.html", id)), maybe_enc(&e.key, html)).unwrap();
    }

    #[test]
    fn snippet_handles_accents_without_panicking() {
        let text = "é".repeat(100) + " cible " + &"é".repeat(100);
        let s = make_snippet(&text, "cible", 80);
        assert!(s.starts_with('…') && s.ends_with('…') && s.contains("cible"));
        assert_eq!(s.chars().count(), 80 + "cible".len() + 80 + 2);
        assert_eq!(make_snippet("École", "école", 10), "École");
        assert_eq!(make_snippet(&"à".repeat(200), "absent", 10).chars().count(), 121);
    }

    #[test]
    fn search_matches_accents_case_insensitively_and_tracks_changes() {
        both(|e| {
            let a = add_note(&e, "Réunion d'équipe", Some("Travail"));
            let b = add_note(&e, "Courses", None);
            write_content(&e, &b, "<p>Acheter du <b>Café</b></p>");
            let mut cache = SearchCache::new();

            let ids = |r: Vec<SearchResult>| { let mut v: Vec<String> = r.into_iter().map(|x| x.id).collect(); v.sort(); v };
            assert_eq!(ids(search_rows(rows(&e), &e.dir, &e.key, &mut cache, "RÉUNION")), [a.clone()]);
            let hit = search_rows(rows(&e), &e.dir, &e.key, &mut cache, "café");
            assert_eq!(hit.len(), 1);
            assert_eq!(hit[0].snippet, "Acheter du Café");
            assert_eq!(hit[0].folder, None);
            assert_eq!(search_rows(rows(&e), &e.dir, &e.key, &mut cache, "réunion")[0].folder.as_deref(), Some("Travail"));

            // Contenu modifié : le cache doit être invalidé (taille du fichier différente).
            write_content(&e, &b, "<p>Acheter du thé vert</p>");
            assert!(search_rows(rows(&e), &e.dir, &e.key, &mut cache, "café").is_empty());
            assert_eq!(search_rows(rows(&e), &e.dir, &e.key, &mut cache, "thé").len(), 1);

            // Note supprimée : retirée du cache.
            e.db.execute("UPDATE notes SET deleted_at='t' WHERE id=?1", [&b]).unwrap();
            search_rows(rows(&e), &e.dir, &e.key, &mut cache, "x");
            assert!(!cache.contains_key(&b));
        });
    }

    #[test]
    fn search_cache_never_reuses_text_read_while_locked() {
        let e = env(true);
        let id = add_note(&e, "titre", None);
        write_content(&e, &id, "<p>secret</p>");
        let mut cache = SearchCache::new();
        // Verrouillé : sans clé, on ne lit que du chiffré.
        assert!(search_rows(rows(&e), &e.dir, &None, &mut cache, "secret").is_empty());
        // Déverrouillé : le texte mis en cache sans clé ne doit pas être réutilisé.
        assert_eq!(search_rows(rows(&e), &e.dir, &e.key, &mut cache, "secret").len(), 1);
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
