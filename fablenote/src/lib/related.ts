import { invoke } from "@tauri-apps/api/core";
import type { NoteMetadata } from "../types";

// Notes liées et suggestions de tags (voir related_notes dans src-tauri/src/notes.rs).

export interface RelatedNote { id: string; title: string; score: number }

/**
 * Notes proches de `id`. `semantic: false` se contente des mots en commun, sans démarrer
 * le modèle d'embeddings : assez bon et instantané pour suggérer des tags.
 */
export const relatedNotes = (id: string, limit = 8, semantic = true) =>
  invoke<RelatedNote[]>("related_notes", { id, limit, semantic });

/** Minuscules sans accents. */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Le mot (ou groupe de mots) `word` apparaît tel quel dans `text` (déjà replié). */
export function containsWord(foldedText: string, word: string): boolean {
  const w = fold(word).trim();
  if (w.length < 3) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, "u").test(foldedText);
}

/**
 * Tags à proposer pour une note : ceux des notes proches (pondérés par leur proximité)
 * et ceux déjà utilisés ailleurs dont le nom apparaît dans la note. Jamais un tag déjà mis.
 */
export function suggestTags(
  noteText: string,
  currentTags: string[],
  related: Pick<RelatedNote, "id" | "score">[],
  allNotes: Pick<NoteMetadata, "id" | "tags">[],
  max = 3,
): string[] {
  const have = new Set(currentTags.map(fold));
  const byId = new Map(allNotes.map((n) => [n.id, n.tags]));
  const scores = new Map<string, { tag: string; score: number }>();
  const add = (tag: string, score: number) => {
    const k = fold(tag);
    if (!k || have.has(k)) return;
    const cur = scores.get(k);
    scores.set(k, { tag: cur?.tag ?? tag, score: (cur?.score ?? 0) + score });
  };

  for (const r of related) for (const tag of byId.get(r.id) ?? []) add(tag, r.score);

  const text = fold(noteText);
  const known = new Set<string>();
  for (const n of allNotes) for (const tag of n.tags) known.add(tag);
  for (const tag of known) if (containsWord(text, tag)) add(tag, 0.6);

  return [...scores.values()]
    .filter((s) => s.score >= 0.25)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, max)
    .map((s) => s.tag);
}
