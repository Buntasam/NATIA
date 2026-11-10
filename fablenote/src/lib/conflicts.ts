import type { NoteMetadata } from "../types";

// Copies créées par la synchronisation quand une note a changé sur deux PC
// (src-tauri/src/sync.rs) : « Titre (conflit NOM-DU-PC 10/11 14:32) ».

const CONFLICT_RE = /^(.*) \(conflit (.+) (\d{2}\/\d{2} \d{2}:\d{2})\)$/;

export interface ConflictInfo { base: string; origin: string; when: string }

export function parseConflictTitle(title: string): ConflictInfo | null {
  const m = title.match(CONFLICT_RE);
  return m ? { base: m[1], origin: m[2], when: m[3] } : null;
}

export interface Conflict extends ConflictInfo {
  copy: NoteMetadata;
  /** La note gardée par la synchronisation (même titre, même dossier de préférence). */
  original: NoteMetadata | null;
}

export function findConflicts(notes: NoteMetadata[]): Conflict[] {
  return notes.flatMap((copy) => {
    const info = parseConflictTitle(copy.title);
    if (!info) return [];
    const same = notes.filter((n) => n.id !== copy.id && n.title === info.base);
    const original = same.find((n) => n.folder === copy.folder) ?? same[0] ?? null;
    return [{ ...info, copy, original }];
  });
}
