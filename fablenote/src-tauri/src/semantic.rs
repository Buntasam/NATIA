// Recherche intelligente dans les notes (mode « Toutes mes notes ») : chaque note est
// découpée en passages, transformés en vecteurs de sens par le modèle d'embeddings de
// l'IA intégrée (llm.rs). Une question trouve alors les passages proches par le sens,
// même sans mot en commun (« budget » → « dépenses prévues »).
//
// Les vecteurs sont rangés dans user_data (clé `emb:<id>`), donc chiffrés avec un mot de
// passe NATIA comme le reste, et recalculés quand le fichier de la note change.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter};

use crate::crypto::{maybe_dec, maybe_enc};
use crate::llm::{embed, normalize, LlmState};
use crate::AppState;

const KEY_PREFIX: &str = "emb:";
pub const INDEX_EVENT: &str = "notes-index";
/// Passages d'environ 900 caractères, qui se chevauchent un peu pour ne pas couper une idée.
const CHUNK_CHARS: usize = 900;
const CHUNK_OVERLAP: usize = 150;
/// Au-delà, la fin d'une très longue note n'est pas indexée.
const MAX_CHUNKS: usize = 12;
const BATCH: usize = 16;

/// Texte d'une note à indexer : identifiant, titre, texte brut, empreinte du fichier.
pub(crate) struct NoteText {
    pub id: String,
    pub title: String,
    pub plain: String,
    pub stamp: (u64, u64),
}

#[derive(Serialize, Deserialize)]
struct IndexEntry {
    /// Modèle qui a produit les vecteurs : un changement de modèle réindexe tout.
    m: String,
    /// Taille et date du fichier de la note au moment de l'indexation.
    s: (u64, u64),
    /// Passages : début et fin (en caractères) et vecteur (f32 little-endian, base64).
    c: Vec<(usize, usize, String)>,
}

#[derive(Clone, Serialize)]
struct IndexProgress { done: usize, total: usize }

pub(crate) struct SemanticHit {
    pub id: String,
    /// Début (en caractères) du passage le plus proche de la question.
    pub chunk_start: usize,
}

/// Découpage en passages : (début, fin) en caractères.
pub(crate) fn chunk_ranges(len: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut start = 0;
    while start < len && out.len() < MAX_CHUNKS {
        let end = (start + CHUNK_CHARS).min(len);
        out.push((start, end));
        if end == len { break; }
        start = end - CHUNK_OVERLAP;
    }
    if out.is_empty() { out.push((0, 0)); }
    out
}

fn chars(s: &str, start: usize, end: usize) -> String {
    s.chars().skip(start).take(end - start).collect()
}

fn encode(v: &[f32]) -> String {
    B64.encode(v.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>())
}

fn decode(s: &str) -> Vec<f32> {
    B64.decode(s).unwrap_or_default().chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect()
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Met l'index à jour (notes nouvelles ou modifiées, notes supprimées) puis renvoie
/// les notes dont un passage est le plus proche de `question`.
pub(crate) async fn semantic_rank(
    app: &AppHandle, llm: &LlmState, state: &AppState,
    notes: &[NoteText], question: &str, limit: usize,
) -> Result<Vec<SemanticHit>, String> {
    let model = crate::llm::EMBED_MODEL.id;
    let key = *state.enc_key.lock().map_err(|e| e.to_string())?;

    // Index existant (verrou de la base relâché avant les calculs).
    let mut index: HashMap<String, IndexEntry> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT key, value FROM user_data WHERE key LIKE 'emb:%'").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok())
            .filter_map(|(k, v)| Some((k.strip_prefix(KEY_PREFIX)?.to_string(), serde_json::from_str(&maybe_dec(&key, &v)).ok()?)))
            .collect()
    };

    // Notes supprimées : leurs vecteurs partent aussi.
    let alive: HashSet<&str> = notes.iter().map(|n| n.id.as_str()).collect();
    let gone: Vec<String> = index.keys().filter(|id| !alive.contains(id.as_str())).cloned().collect();

    // Passages à (re)calculer.
    let stale: Vec<&NoteText> = notes.iter()
        .filter(|n| index.get(&n.id).map_or(true, |e| e.m != model || e.s != n.stamp))
        .collect();
    let mut jobs: Vec<(usize, usize, usize, String)> = Vec::new(); // (note, début, fin, texte)
    for (ni, n) in stale.iter().enumerate() {
        for (i, (start, end)) in chunk_ranges(n.plain.chars().count()).into_iter().enumerate() {
            let body = chars(&n.plain, start, end);
            // Le titre aide beaucoup à retrouver la note : il précède le premier passage.
            let text = if i == 0 { format!("{}\n{}", n.title, body) } else { body };
            jobs.push((ni, start, end, text));
        }
    }

    let mut fresh: HashMap<usize, Vec<(usize, usize, String)>> = HashMap::new();
    let total = jobs.len();
    for (b, batch) in jobs.chunks(BATCH).enumerate() {
        let _ = app.emit(INDEX_EVENT, IndexProgress { done: b * BATCH, total });
        let texts: Vec<String> = batch.iter().map(|j| j.3.clone()).collect();
        let vectors = embed(app, llm, &texts).await?;
        for (job, v) in batch.iter().zip(vectors) {
            fresh.entry(job.0).or_default().push((job.1, job.2, encode(&v)));
        }
    }
    if total > 0 { let _ = app.emit(INDEX_EVENT, IndexProgress { done: total, total }); }

    if !gone.is_empty() || !fresh.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for id in &gone {
            db.execute("DELETE FROM user_data WHERE key=?1", [format!("{KEY_PREFIX}{id}")]).map_err(|e| e.to_string())?;
            index.remove(id);
        }
        for (ni, chunks) in fresh {
            let n = stale[ni];
            let entry = IndexEntry { m: model.to_string(), s: n.stamp, c: chunks };
            let json = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO user_data(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![format!("{KEY_PREFIX}{}", n.id), maybe_enc(&key, &json)],
            ).map_err(|e| e.to_string())?;
            index.insert(n.id.clone(), entry);
        }
    }

    let q = normalize(embed(app, llm, &[question.to_string()]).await?.remove(0));
    Ok(best_notes(&index, &q, limit))
}

/// Notes classées par leur passage le plus proche de la question (similarité cosinus).
fn best_notes(index: &HashMap<String, IndexEntry>, q: &[f32], limit: usize) -> Vec<SemanticHit> {
    // En dessous, le passage n'a pas vraiment de rapport avec la question.
    const MIN_SIMILARITY: f32 = 0.35;
    let mut scored: Vec<(f32, SemanticHit)> = index.iter().filter_map(|(id, e)| {
        e.c.iter()
            .map(|(start, _, v)| (dot(q, &decode(v)), *start))
            .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
            .filter(|(s, _)| *s >= MIN_SIMILARITY)
            .map(|(s, start)| (s, SemanticHit { id: id.clone(), chunk_start: start }))
    }).collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(limit).map(|(_, h)| h).collect()
}

/// Fusion de deux classements (mots-clés et sens) : chaque note gagne 1/(60 + rang) par
/// classement où elle figure. Une note bien placée dans les deux passe devant.
pub(crate) fn fuse(keyword: &[String], semantic: &[String], limit: usize) -> Vec<String> {
    let mut score: HashMap<&str, f64> = HashMap::new();
    for list in [keyword, semantic] {
        for (rank, id) in list.iter().enumerate() {
            *score.entry(id.as_str()).or_default() += 1.0 / (60.0 + rank as f64);
        }
    }
    let mut ids: Vec<(&str, f64)> = score.into_iter().collect();
    ids.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(b.0)));
    ids.into_iter().take(limit).map(|(id, _)| id.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_cover_the_text_with_overlap() {
        assert_eq!(chunk_ranges(0), vec![(0, 0)]);
        assert_eq!(chunk_ranges(500), vec![(0, 500)]);
        assert_eq!(chunk_ranges(1700), vec![(0, 900), (750, 1650), (1500, 1700)]);
        assert_eq!(chunk_ranges(1_000_000).len(), MAX_CHUNKS);
    }

    #[test]
    fn vectors_round_trip() {
        let v = vec![0.25f32, -1.5, 3.0];
        assert_eq!(decode(&encode(&v)), v);
    }

    #[test]
    fn closest_passage_wins() {
        let entry = |vs: &[[f32; 2]]| IndexEntry {
            m: "bge-m3".into(), s: (0, 0),
            c: vs.iter().enumerate().map(|(i, v)| (i * 100, i * 100 + 90, encode(&normalize(v.to_vec())))).collect(),
        };
        let index = HashMap::from([
            ("loin".to_string(), entry(&[[0.0, 1.0]])),
            ("proche".to_string(), entry(&[[0.0, 1.0], [1.0, 0.1]])),
            ("moyen".to_string(), entry(&[[1.0, 1.0]])),
        ]);
        let hits = best_notes(&index, &normalize(vec![1.0, 0.0]), 5);
        let ids: Vec<&str> = hits.iter().map(|h| h.id.as_str()).collect();
        assert_eq!(ids, vec!["proche", "moyen"]);
        assert_eq!(hits[0].chunk_start, 100);
    }

    #[test]
    fn fusion_rewards_agreement() {
        let k = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let s = vec!["c".to_string(), "d".to_string()];
        assert_eq!(fuse(&k, &s, 4), vec!["c", "a", "b", "d"]);
    }
}
