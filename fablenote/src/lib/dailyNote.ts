import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { locale } from "../i18n";
import type { Note } from "../types";

// Note du jour (Ctrl+D) : une note par jour, titrée « 2026-11-10 », dans le dossier « Journal ».
// Le titre ne dépend pas de la langue : on retrouve la note même après avoir changé de langue.

export const JOURNAL_FOLDER = "Journal";

/** « 2026-11-10 » (date locale, pas UTC : après 23 h on reste sur le bon jour). */
export function dayTitle(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** « Lundi 10 novembre 2026 », en tête de la note. */
export function longDay(d = new Date(), loc = locale()): string {
  const s = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Id de la note du jour, créée si besoin (sans l'ouvrir). */
export async function ensureDailyNote(): Promise<string> {
  const st = useStore.getState();
  const title = dayTitle();
  const existing = st.notes.find((n) => n.title === title && n.folder === JOURNAL_FOLDER);
  if (existing) return existing.id;
  if (!st.folders.includes(JOURNAL_FOLDER)) await st.createFolder(JOURNAL_FOLDER);
  const note = await invoke<Note>("create_note", {
    title,
    content: `<h2>${longDay()}</h2><p></p>`,
    tags: [],
    folder: JOURNAL_FOLDER,
  });
  await st.loadNotes();
  return note.id;
}

/** Ouvre la note du jour, ou la crée. */
export async function openDailyNote(): Promise<void> {
  await useStore.getState().selectNote(await ensureDailyNote());
}
