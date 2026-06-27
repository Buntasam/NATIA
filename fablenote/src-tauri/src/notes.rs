use chrono::Utc;
use rusqlite::{Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;
use uuid::Uuid;

use crate::{AppState, Note, NoteMetadata, ReminderItem, TrashItem, Version};
use crate::crypto::{is_valid_uuid, maybe_dec, maybe_enc, sanitize_name};
use crate::db::{git_commit_note, save_version_inner};

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
            NoteMetadata { id, title, tags, folder, created_at, updated_at }
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
    Ok(Note { id, title, content, tags, folder, created_at, updated_at })
}

#[tauri::command]
pub fn create_note(
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
            params![id, maybe_enc(&key, &title), maybe_enc(&key, &tags_json), folder, now, now],
        ).map_err(|e| e.to_string())?;
    }
    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
    git_commit_note(&state.notes_dir, &id, &format!("Créer : {}", title));
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
    if !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let now = Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE notes SET title=?1, tags=?2, folder=?3, updated_at=?4 WHERE id=?5",
            params![maybe_enc(&key, &title), maybe_enc(&key, &tags_json), folder, now, id],
        ).map_err(|e| e.to_string())?;
    }
    let file_path = state.notes_dir.join(format!("{}.html", id));
    std::fs::write(&file_path, maybe_enc(&key, &content)).map_err(|e| e.to_string())?;
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
pub fn rename_note(id: String, title: String, state: State<AppState>) -> Result<(), String> {
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
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, message, created_at FROM note_versions WHERE note_id=?1 ORDER BY created_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let versions = stmt
        .query_map([&note_id], |row| {
            let id: String = row.get(0)?;
            let short = id[..8.min(id.len())].to_string();
            Ok(Version { hash: id, short_hash: short, message: row.get(1)?, date: row.get(2)? })
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

#[tauri::command]
pub fn get_folders(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT path FROM folders WHERE deleted_at IS NULL ORDER BY path").map_err(|e| e.to_string())?;
    let folders = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
pub fn create_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [&path]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let prefix = format!("{}/%", path);
    db.execute(
        "UPDATE folders SET deleted_at=?1 WHERE (path=?2 OR path LIKE ?3) AND deleted_at IS NULL",
        params![now, path, prefix],
    ).map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE notes SET deleted_at=?1 WHERE (folder=?2 OR folder LIKE ?3) AND deleted_at IS NULL",
        params![now, path, prefix],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_folder(old_path: String, new_path: String, state: State<AppState>) -> Result<(), String> {
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
pub fn move_note(id: String, folder: Option<String>, state: State<AppState>) -> Result<NoteMetadata, String> {
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

// ─── Trash commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_trash(state: State<AppState>) -> Result<Vec<TrashItem>, String> {
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut items: Vec<TrashItem> = Vec::new();

    let mut stmt = db.prepare(
        "SELECT path, deleted_at FROM folders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ).map_err(|e| e.to_string())?;
    let folder_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?
      .collect::<SqlResult<Vec<_>>>()
      .map_err(|e| e.to_string())?;

    let deleted_folder_paths: Vec<String> = folder_rows.iter()
        .filter(|(p, _)| !folder_rows.iter().any(|(df, _)| df != p && p.starts_with(&format!("{}/", df))))
        .map(|(p, _)| p.clone())
        .collect();

    for (path, deleted_at) in &folder_rows {
        let is_child = folder_rows.iter().any(|(df, _)| df != path && path.starts_with(&format!("{}/", df)));
        if is_child { continue; }
        let note_count: i64 = db.query_row(
            "SELECT COUNT(*) FROM notes WHERE (folder=?1 OR folder LIKE ?2) AND deleted_at IS NOT NULL",
            params![path, format!("{}/%", path)],
            |r| r.get(0),
        ).unwrap_or(0);
        items.push(TrashItem {
            id: path.clone(),
            title: path.split('/').last().unwrap_or(path).to_string(),
            item_type: "folder".to_string(),
            folder: None,
            deleted_at: deleted_at.clone(),
            note_count: Some(note_count as u32),
        });
    }

    let mut stmt2 = db.prepare(
        "SELECT id, title, folder, deleted_at FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ).map_err(|e| e.to_string())?;
    let note_rows = stmt2.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?))
    }).map_err(|e| e.to_string())?
      .collect::<SqlResult<Vec<_>>>()
      .map_err(|e| e.to_string())?;

    for (id, raw_title, folder, deleted_at) in note_rows {
        let in_deleted_folder = folder.as_ref().map(|f| {
            deleted_folder_paths.iter().any(|df| f == df || f.starts_with(&format!("{}/", df)))
        }).unwrap_or(false);
        if in_deleted_folder { continue; }
        let title = maybe_dec(&key, &raw_title);
        items.push(TrashItem { id, title, item_type: "note".to_string(), folder, deleted_at, note_count: None });
    }

    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(items)
}

#[tauri::command]
pub fn restore_from_trash(id: String, item_type: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if item_type == "note" {
        db.execute("UPDATE notes SET deleted_at=NULL WHERE id=?1", [&id])
            .map_err(|e| e.to_string())?;
    } else {
        let prefix = format!("{}/%", id);
        db.execute("UPDATE folders SET deleted_at=NULL WHERE path=?1 OR path LIKE ?2", params![id, prefix])
            .map_err(|e| e.to_string())?;
        db.execute("UPDATE notes SET deleted_at=NULL WHERE folder=?1 OR folder LIKE ?2", params![id, prefix])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn permanent_delete_item(id: String, item_type: String, state: State<AppState>) -> Result<(), String> {
    if item_type == "note" && !is_valid_uuid(&id) { return Err("ID invalide".to_string()); }
    if item_type == "note" {
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.execute("DELETE FROM notes WHERE id=?1", [&id]).map_err(|e| e.to_string())?;
            db.execute("DELETE FROM item_colors WHERE item_key=?1", [&format!("note:{}", id)])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM note_versions WHERE note_id=?1", [&id])
                .map_err(|e| e.to_string())?;
        }
        let fp = state.notes_dir.join(format!("{}.html", id));
        if fp.exists() { let _ = std::fs::remove_file(&fp); }
    } else {
        let prefix = format!("{}/%", id);
        let note_ids: Vec<String> = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db.prepare(
                "SELECT id FROM notes WHERE (folder=?1 OR folder LIKE ?2) AND deleted_at IS NOT NULL"
            ).map_err(|e| e.to_string())?;
            let result = stmt.query_map(params![id, prefix], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<SqlResult<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            result
        };
        for note_id in &note_ids {
            let fp = state.notes_dir.join(format!("{}.html", note_id));
            if fp.exists() { let _ = std::fs::remove_file(&fp); }
        }
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM notes WHERE (folder=?1 OR folder LIKE ?2) AND deleted_at IS NOT NULL", params![id, prefix])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM folders WHERE (path=?1 OR path LIKE ?2) AND deleted_at IS NOT NULL", params![id, prefix])
            .map_err(|e| e.to_string())?;
        let ck = format!("folder:{}", id);
        let cp = format!("folder:{}/%", id);
        db.execute("DELETE FROM item_colors WHERE item_key=?1 OR item_key LIKE ?2", params![ck, cp])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> Result<(), String> {
    let note_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT id FROM notes WHERE deleted_at IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        result
    };
    for id in &note_ids {
        let fp = state.notes_dir.join(format!("{}.html", id));
        if fp.exists() { let _ = std::fs::remove_file(&fp); }
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", []).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM folders WHERE deleted_at IS NOT NULL", []).map_err(|e| e.to_string())?;
    Ok(())
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
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else { String::new() };
        let safe_title = sanitize_name(&title_dec);
        let zip_path = match folder {
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
        let fp = notes_dir.join(format!("{}.html", id));
        let content = if fp.exists() {
            let raw = std::fs::read_to_string(&fp).map_err(|e| e.to_string())?;
            maybe_dec(&enc_key, &raw)
        } else { String::new() };
        let safe_title = sanitize_name(&title_dec);
        let zip_path = match folder {
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
            results.push(SearchResult { id, title, folder, updated_at, snippet });
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
