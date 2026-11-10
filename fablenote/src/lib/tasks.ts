import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { callSaveNow } from "../components/CloseOverlay";
import type { Note } from "../types";

// Vue « Tâches » : les cases à cocher de toutes les notes (get_all_tasks, src-tauri/src/search.rs).

export interface TaskItem {
  note_id: string;
  note_title: string;
  folder: string | null;
  updated_at: string;
  /** Rang de la case dans la note (0 = la première). */
  index: number;
  text: string;
  checked: boolean;
}

export const getAllTasks = () => invoke<TaskItem[]>("get_all_tasks");

/** Coche ou décoche la case n° `index` d'une note TipTap ; null si elle n'existe pas. */
export function setTaskInHtml(html: string, index: number, checked: boolean): string | null {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const item = doc.body.querySelectorAll('li[data-type="taskItem"]')[index];
  if (!item) return null;
  item.setAttribute("data-checked", checked ? "true" : "false");
  // La case elle-même : seulement la sienne, pas celles d'une sous-liste.
  const box = item.querySelector(":scope > label > input[type=checkbox]");
  if (box) { if (checked) box.setAttribute("checked", "checked"); else box.removeAttribute("checked"); }
  return doc.body.innerHTML;
}

/** Attend la fin d'un enregistrement en cours (au plus 3 s). */
async function waitSaved() {
  await new Promise((r) => setTimeout(r, 80));
  const start = Date.now();
  while (useStore.getState().isSaving && Date.now() - start < 3000) await new Promise((r) => setTimeout(r, 50));
}

/**
 * Réécrit le contenu d'une note avec `change` (null = rien à faire), sans perdre ce qui
 * est en train d'être écrit si c'est la note ouverte.
 */
async function rewriteNote(noteId: string, change: (html: string) => string | null): Promise<void> {
  const st = useStore.getState();
  const isActive = st.activeNote?.id === noteId;
  if (isActive) { callSaveNow(); await waitSaved(); }
  const note = await invoke<Note>("get_note", { id: noteId });
  const html = change(note.content);
  if (html === null) throw new Error("Tâche introuvable : la note a changé");
  if (isActive) {
    // Passe par le store : l'éditeur recharge le contenu de la note ouverte.
    await useStore.getState().updateNote(note.id, note.title, html, note.tags, note.folder);
  } else {
    const updated = await invoke<Note>("update_note", {
      id: note.id, title: note.title, content: html, tags: note.tags, folder: note.folder, label: null,
    });
    useStore.setState((s) => ({ notes: s.notes.map((n) => (n.id === note.id ? { ...n, updated_at: updated.updated_at } : n)) }));
  }
}

/** Coche une tâche depuis la vue. */
export const setTaskChecked = (noteId: string, index: number, checked: boolean) =>
  rewriteNote(noteId, (html) => setTaskInHtml(html, index, checked));

/**
 * Ajoute une tâche à la fin d'une note TipTap : dans sa dernière liste de tâches si la
 * note se termine par une, sinon dans une nouvelle liste.
 */
export function appendTaskToHtml(html: string, text: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const li = doc.createElement("li");
  li.setAttribute("data-checked", "false");
  li.setAttribute("data-type", "taskItem");
  const label = doc.createElement("label");
  const box = doc.createElement("input");
  box.setAttribute("type", "checkbox");
  label.append(box, doc.createElement("span"));
  const div = doc.createElement("div");
  const p = doc.createElement("p");
  p.textContent = text;
  div.append(p);
  li.append(label, div);

  // Un paragraphe vide final (curseur de TipTap) ne compte pas.
  let last = doc.body.lastElementChild;
  if (last && last.tagName === "P" && !last.textContent?.trim() && !last.querySelector("img")) {
    const prev = last.previousElementSibling;
    if (prev?.matches('ul[data-type="taskList"]')) { last.remove(); last = prev; }
  }
  if (last?.matches('ul[data-type="taskList"]')) {
    last.append(li);
  } else {
    const ul = doc.createElement("ul");
    ul.setAttribute("data-type", "taskList");
    ul.append(li);
    doc.body.append(ul);
  }
  return doc.body.innerHTML;
}

export const addTask = (noteId: string, text: string) =>
  rewriteNote(noteId, (html) => appendTaskToHtml(html, text.trim()));

/** Note « Tâches » où vont les tâches créées depuis la vue (créée au premier usage). */
const INBOX_KEY = "natia_tasks_inbox";

export async function ensureTasksNote(title: string): Promise<string> {
  const st = useStore.getState();
  let id: string | null = null;
  try { id = localStorage.getItem(INBOX_KEY); } catch { /* stockage indisponible */ }
  if (id && st.notes.some((n) => n.id === id)) return id;
  const note = await invoke<Note>("create_note", { title, content: "", tags: [], folder: null });
  try { localStorage.setItem(INBOX_KEY, note.id); } catch { /* stockage indisponible */ }
  await st.loadNotes();
  return note.id;
}
