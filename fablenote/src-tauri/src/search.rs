// Recherche dans les notes : barre de recherche et palette (`search_notes`), notes utiles
// à une question de la conversation IA (`relevant_notes`), notes liées (`related_notes`).
//
// Le texte déchiffré des notes est gardé en cache tant que leur fichier ne change pas,
// et effacé au verrouillage.

use rusqlite::Result as SqlResult;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::crypto::{maybe_dec, maybe_dec_opt};
use crate::AppState;

type Key = Option<[u8; 32]>;

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

/// Lettre sans accent (« é » → « e »). Une lettre en donne toujours une seule.
fn strip_accent(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        _ => c,
    }
}

/// Minuscules sans accents, caractère par caractère : même nombre de caractères
/// que l'original, ce qui permet de reporter une position trouvée dans le texte d'origine.
fn fold(s: &str) -> String {
    s.chars().map(|c| strip_accent(c.to_lowercase().next().unwrap_or(c))).collect()
}

fn char_slice(s: &str, start: usize, end: usize) -> &str {
    let mut idx = s.char_indices().map(|(i, _)| i).chain(std::iter::once(s.len()));
    let from = idx.nth(start).unwrap_or(s.len());
    let to = if end > start { idx.nth(end - start - 1).unwrap_or(s.len()) } else { from };
    &s[from..to]
}

pub(crate) fn make_snippet(text: &str, query: &str, window: usize) -> String {
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

/// Met à jour le texte en cache d'une note si son fichier a changé.
fn refresh_cached(cache: &mut SearchCache, id: &str, notes_dir: &std::path::Path, key: &Key) {
    let fp = notes_dir.join(format!("{}.html", id));
    let stamp = file_stamp(&fp);
    let fresh = cache.get(id).is_some_and(|c| c.stamp == stamp && c.with_key == key.is_some());
    if !fresh {
        let raw = std::fs::read_to_string(&fp).unwrap_or_default();
        let plain = strip_html(&maybe_dec(key, &raw));
        let folded = fold(&plain);
        cache.insert(id.to_string(), CachedText { stamp, with_key: key.is_some(), plain, folded });
    }
}

pub(crate) fn search_rows(
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
        refresh_cached(cache, &id, notes_dir, key);
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
    let meta: std::collections::HashMap<String, (String, Option<String>, String)> = rows.iter()
        .map(|(id, t, f, u)| (id.clone(), (t.clone(), f.clone(), u.clone())))
        .collect();
    let mut results = {
        let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
        search_rows(rows, &state.notes_dir, &key, &mut cache, &query)
    };
    // Texte des fichiers joints (PDF…) : la note qui les contient est trouvée aussi.
    let files = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::attachments::searchable_texts(&db, &key)?
    };
    results.extend(search_attachment_texts(files, &meta, &results, &key, &query));
    Ok(results)
}

/// Notes dont un fichier joint contient `query`, absentes de `already`.
/// L'extrait commence par « 📎 nom du fichier : ».
fn search_attachment_texts(
    files: Vec<(String, String, String)>,
    meta: &std::collections::HashMap<String, (String, Option<String>, String)>,
    already: &[SearchResult],
    key: &Key,
    query: &str,
) -> Vec<SearchResult> {
    let q = fold(query);
    let mut out: Vec<SearchResult> = Vec::new();
    for (note_id, name, text) in files {
        if already.iter().chain(out.iter()).any(|r| r.id == note_id) { continue; }
        let Some((title, folder, updated_at)) = meta.get(&note_id) else { continue };
        if !fold(&text).contains(&q) { continue; }
        out.push(SearchResult {
            id: note_id,
            title: maybe_dec(key, title),
            folder: maybe_dec_opt(key, folder),
            updated_at: updated_at.clone(),
            snippet: format!("📎 {name} : {}", make_snippet(&text, query, 70)),
        });
    }
    out
}

// ─── Notes utiles à une question (« Mes notes » dans la conversation IA) ─────

/// Mots trop courants pour départager les notes.
const STOP_WORDS: &[&str] = &[
    "les", "des", "une", "est", "que", "qui", "quoi", "pour", "dans", "par", "sur", "avec", "pas", "plus",
    "mes", "mon", "tes", "ton", "ses", "son", "nos", "vos", "leur", "leurs", "cette", "ces", "aux", "elle",
    "ils", "elles", "nous", "vous", "moi", "toi", "suis", "sont", "etait", "ete", "avoir", "etre",
    "fait", "faire", "comment", "pourquoi", "quand", "quel", "quelle", "quels", "quelles", "dit",
    "ecrit", "note", "notes", "sujet", "propos", "tout", "tous", "toutes", "bien", "aussi", "alors",
    "the", "and", "for", "what", "when", "where", "which", "who", "why", "how", "did", "does", "about",
    "with", "from", "that", "this", "have", "has", "was", "were", "are", "you", "your", "our", "wrote",
];

/// Mots de la question qui servent à chercher : 3 lettres ou plus, hors mots courants.
fn question_terms(question: &str) -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();
    for w in fold(question).split(|c: char| !c.is_alphanumeric()) {
        if w.chars().count() < 3 || STOP_WORDS.contains(&w) { continue; }
        // Pluriel retiré : « reunions » trouve aussi « reunion » (la recherche se fait par inclusion).
        let w = if w.chars().count() > 4 && (w.ends_with('s') || w.ends_with('x')) { &w[..w.len() - 1] } else { w };
        if !terms.iter().any(|t| t == w) { terms.push(w.to_string()); }
    }
    terms
}

#[derive(Serialize, Debug)]
pub struct RelevantNote {
    pub id: String,
    pub title: String,
    /// Passage de la note autour du premier mot trouvé, au plus `EXCERPT_CHARS` caractères.
    pub excerpt: String,
}

const EXCERPT_CHARS: usize = 1800;

/// Classe les notes par pertinence : chaque mot de la question pèse d'autant plus
/// qu'il est rare dans l'ensemble des notes, et compte davantage dans le titre.
fn rank_notes(notes: &[(String, String)], cache: &SearchCache, terms: &[String], limit: usize) -> Vec<RelevantNote> {
    if terms.is_empty() { return vec![]; }
    let n = notes.len() as f64;
    let titles: Vec<String> = notes.iter().map(|(_, t)| fold(t)).collect();
    let text = |id: &str| cache.get(id).map(|c| c.folded.as_str()).unwrap_or("");
    let weights: Vec<f64> = terms.iter().map(|t| {
        let df = notes.iter().zip(&titles)
            .filter(|((id, _), title)| title.contains(t.as_str()) || text(id).contains(t.as_str()))
            .count() as f64;
        ((n + 1.0) / (df + 1.0)).ln() + 1.0
    }).collect();

    let mut scored: Vec<(f64, usize)> = notes.iter().enumerate().filter_map(|(i, (id, _))| {
        let score: f64 = terms.iter().zip(&weights).map(|(t, w)| {
            let in_title = if titles[i].contains(t.as_str()) { 3.0 } else { 0.0 };
            let hits = text(id).matches(t.as_str()).take(20).count() as f64;
            w * (in_title + if hits > 0.0 { 1.0 + hits.ln() } else { 0.0 })
        }).sum();
        (score > 0.0).then_some((score, i))
    }).collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    scored.into_iter().take(limit).map(|(_, i)| {
        let (id, title) = &notes[i];
        let excerpt = cache.get(id).map(|c| {
            let first = terms.iter().filter_map(|t| c.folded.find(t.as_str())).min();
            excerpt_at(&c.plain, first.map(|b| c.folded[..b].chars().count()).unwrap_or(0))
        }).unwrap_or_default();
        RelevantNote { id: id.clone(), title: title.clone(), excerpt }
    }).collect()
}

/// Passage de `plain` d'au plus `EXCERPT_CHARS` caractères autour de la position `at`.
fn excerpt_at(plain: &str, at: usize) -> String {
    let total = plain.chars().count();
    let start = at.saturating_sub(EXCERPT_CHARS / 3).min(total.saturating_sub(EXCERPT_CHARS));
    let end = (start + EXCERPT_CHARS).min(total);
    format!("{}{}{}", if start > 0 { "…" } else { "" }, char_slice(plain, start, end), if end < total { "…" } else { "" })
}

/// Les notes les plus utiles pour répondre à `question`, avec un passage de chacune.
/// Recherche par mots-clés, complétée par la recherche par le sens quand le modèle
/// d'embeddings de l'IA intégrée est installé (voir semantic.rs).
#[tauri::command]
pub async fn relevant_notes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    llm: State<'_, crate::llm::LlmState>,
    question: String,
    limit: u32,
) -> Result<Vec<RelevantNote>, String> {
    crate::require_unlocked(&state)?;
    let limit = limit.clamp(1, 8) as usize;
    let terms = question_terms(&question);
    let semantic_on = crate::llm::embeddings_available(&app);
    if terms.is_empty() && !semantic_on { return Ok(vec![]); }
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let rows: Vec<(String, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT id, title FROM notes WHERE deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let collected: SqlResult<Vec<_>> = mapped.collect();
        collected.map_err(|e| e.to_string())?
    };
    let notes: Vec<(String, String)> = rows.into_iter().map(|(id, t)| (id, maybe_dec(&key, &t))).collect();
    let (keyword, texts) = {
        let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
        for (id, _) in &notes { refresh_cached(&mut cache, id, &state.notes_dir, &key); }
        let keyword = rank_notes(&notes, &cache, &terms, limit);
        let texts: Vec<crate::semantic::NoteText> = if semantic_on {
            notes.iter().filter_map(|(id, title)| {
                let c = cache.get(id)?;
                let secs = c.stamp.1.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
                Some(crate::semantic::NoteText { id: id.clone(), title: title.clone(), plain: c.plain.clone(), stamp: (c.stamp.0, secs) })
            }).collect()
        } else { vec![] };
        (keyword, texts)
    };
    if !semantic_on { return Ok(keyword); }

    // Recherche par le sens ; en cas d'échec (modèle qui ne démarre pas…), les mots-clés suffisent.
    let hits = match crate::semantic::semantic_rank(&app, &llm, &state, &texts, &question, limit).await {
        Ok(h) => h,
        Err(e) => { eprintln!("recherche intelligente : {e}"); return Ok(keyword); }
    };
    let keyword_ids: Vec<String> = keyword.iter().map(|n| n.id.clone()).collect();
    let semantic_ids: Vec<String> = hits.iter().map(|h| h.id.clone()).collect();
    let mut by_keyword: std::collections::HashMap<String, RelevantNote> = keyword.into_iter().map(|n| (n.id.clone(), n)).collect();
    let titles: std::collections::HashMap<&str, &str> = notes.iter().map(|(id, t)| (id.as_str(), t.as_str())).collect();
    let plain: std::collections::HashMap<&str, &str> = texts.iter().map(|t| (t.id.as_str(), t.plain.as_str())).collect();
    Ok(crate::semantic::fuse(&keyword_ids, &semantic_ids, limit).into_iter().filter_map(|id| {
        if let Some(n) = by_keyword.remove(&id) { return Some(n); }
        let hit = hits.iter().find(|h| h.id == id)?;
        Some(RelevantNote {
            title: titles.get(id.as_str())?.to_string(),
            excerpt: excerpt_at(plain.get(id.as_str())?, hit.chunk_start),
            id,
        })
    }).collect())
}

// ─── Notes liées (panneau « Liens ») ──────────────────────────────────────────

#[derive(Serialize, Debug)]
pub struct RelatedNote {
    pub id: String,
    pub title: String,
    /// Proximité de 0 à 1.
    pub score: f32,
}

/// Mots d'un texte déjà replié (`fold`) qui comptent pour comparer deux notes.
fn content_words(folded: &str) -> impl Iterator<Item = &str> {
    folded.split(|c: char| !c.is_alphanumeric()).filter_map(|w| {
        if w.chars().count() < 4 || STOP_WORDS.contains(&w) || w.chars().all(|c| c.is_ascii_digit()) { return None; }
        Some(if w.chars().count() > 4 && (w.ends_with('s') || w.ends_with('x')) { &w[..w.len() - 1] } else { w })
    })
}

/// Notes proches de `target` par les mots qu'elles partagent (TF-IDF, cosinus) :
/// utilisé quand le modèle d'embeddings n'est pas installé.
fn keyword_similar(texts: &[(String, &str)], target: &str, limit: usize) -> Vec<(String, f32)> {
    use std::collections::HashMap;
    let bags: Vec<HashMap<&str, f32>> = texts.iter().map(|(_, t)| {
        let mut m: HashMap<&str, f32> = HashMap::new();
        for w in content_words(t) { *m.entry(w).or_default() += 1.0; }
        m
    }).collect();
    let mut df: HashMap<&str, f32> = HashMap::new();
    for bag in &bags { for w in bag.keys() { *df.entry(w).or_default() += 1.0; } }
    let n = texts.len() as f32;
    let vectors: Vec<HashMap<&str, f32>> = bags.iter().map(|bag| {
        let mut v: HashMap<&str, f32> = bag.iter()
            // Un mot présent partout ne distingue rien : poids nul.
            .map(|(w, tf)| (*w, (1.0 + tf.ln()) * (n / df[w]).ln()))
            .filter(|(_, x)| *x > 0.0)
            .collect();
        let norm = v.values().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 { for x in v.values_mut() { *x /= norm; } }
        v
    }).collect();
    let Some(ti) = texts.iter().position(|(id, _)| id == target) else { return vec![] };
    let tv = &vectors[ti];
    let mut scored: Vec<(String, f32)> = texts.iter().enumerate()
        .filter(|(i, _)| *i != ti)
        .map(|(i, (id, _))| {
            let (small, big) = if tv.len() < vectors[i].len() { (tv, &vectors[i]) } else { (&vectors[i], tv) };
            (id.clone(), small.iter().filter_map(|(w, x)| big.get(w).map(|y| x * y)).sum::<f32>())
        })
        .filter(|(_, s)| *s >= 0.1)
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));
    scored.truncate(limit);
    scored
}

/// Notes qui parlent de la même chose que `id` : par le sens quand le modèle
/// d'embeddings de l'IA intégrée est installé, sinon par les mots en commun.
#[tauri::command]
pub async fn related_notes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    llm: State<'_, crate::llm::LlmState>,
    id: String,
    limit: u32,
    // false : mots en commun seulement, sans démarrer le modèle d'embeddings (suggestions de tags).
    semantic: Option<bool>,
) -> Result<Vec<RelatedNote>, String> {
    crate::require_unlocked(&state)?;
    let limit = limit.clamp(1, 20) as usize;
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let rows: Vec<(String, String)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT id, title FROM notes WHERE deleted_at IS NULL").map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let collected: SqlResult<Vec<_>> = mapped.collect();
        collected.map_err(|e| e.to_string())?
    };
    let titles: std::collections::HashMap<String, String> = rows.into_iter().map(|(i, t)| (i, maybe_dec(&key, &t))).collect();
    if !titles.contains_key(&id) { return Ok(vec![]); }

    let semantic_on = semantic.unwrap_or(true) && crate::llm::embeddings_available(&app);
    let (keyword, texts) = {
        let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
        for nid in titles.keys() { refresh_cached(&mut cache, nid, &state.notes_dir, &key); }
        // Le titre compte comme du texte : deux notes « Budget 2025 » et « Budget 2026 » se rapprochent.
        let folded: Vec<(String, String)> = titles.iter()
            .map(|(nid, t)| (nid.clone(), format!("{} {}", fold(t), cache.get(nid).map(|c| c.folded.as_str()).unwrap_or(""))))
            .collect();
        let refs: Vec<(String, &str)> = folded.iter().map(|(i, t)| (i.clone(), t.as_str())).collect();
        let keyword = keyword_similar(&refs, &id, limit);
        let texts: Vec<crate::semantic::NoteText> = if semantic_on {
            titles.iter().filter_map(|(nid, title)| {
                let c = cache.get(nid)?;
                let secs = c.stamp.1.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
                Some(crate::semantic::NoteText { id: nid.clone(), title: title.clone(), plain: c.plain.clone(), stamp: (c.stamp.0, secs) })
            }).collect()
        } else { vec![] };
        (keyword, texts)
    };

    let scored = if semantic_on {
        match crate::semantic::similar_notes(&app, &llm, &state, &texts, &id, limit).await {
            Ok(s) => s,
            Err(e) => { eprintln!("notes liées : {e}"); keyword }
        }
    } else { keyword };
    Ok(scored.into_iter().filter_map(|(nid, score)| Some(RelatedNote {
        title: titles.get(&nid)?.clone(), id: nid, score: score.min(1.0),
    })).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyword_similarity_finds_notes_on_the_same_topic() {
        let texts = vec![
            ("a".to_string(), "budget vacances bretagne hotel train reservation"),
            ("b".to_string(), "reservation hotel bretagne pour les vacances"),
            ("c".to_string(), "recette gateau chocolat beurre farine"),
            ("d".to_string(), "reunion equipe projet planning"),
        ];
        let near = keyword_similar(&texts, "a", 5);
        assert_eq!(near.first().map(|x| x.0.as_str()), Some("b"));
        assert!(near.iter().all(|(id, _)| id != "c" && id != "a"));
        assert!(keyword_similar(&texts, "inconnue", 5).is_empty());
    }

    #[test]
    fn question_terms_skip_common_words() {
        assert_eq!(question_terms("Qu'ai-je écrit sur le projet Orion et les réunions ?"), vec!["projet", "orion", "reunion"]);
        assert!(question_terms("et le la ?").is_empty());
    }

    #[test]
    fn rank_prefers_rare_words_and_titles() {
        let mut cache = SearchCache::new();
        for (id, text) in [
            ("a", "Réunion du lundi. Projet Orion : budget validé, lancement en mars."),
            ("b", "Liste de courses : tomates, pâtes. Réunion parents d'élèves."),
            ("c", "Idées de vacances au soleil."),
        ] {
            cache.insert(id.to_string(), CachedText { stamp: (0, None), with_key: false, plain: text.to_string(), folded: fold(text) });
        }
        let notes = vec![
            ("a".to_string(), "Compte rendu".to_string()),
            ("b".to_string(), "Divers".to_string()),
            ("c".to_string(), "Orion".to_string()),
        ];
        let ranked = rank_notes(&notes, &cache, &question_terms("Où en est le budget du projet Orion ?"), 5);
        let ids: Vec<&str> = ranked.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "c"]);
        assert!(ranked[0].excerpt.contains("budget"));
        assert!(rank_notes(&notes, &cache, &question_terms("chocolat"), 5).is_empty());
    }
}
