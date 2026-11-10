import { useEffect } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { tr } from "../i18n";
import { addTask, ensureTasksNote } from "./tasks";
import { resolveDueShortcut } from "./taskDates";
import type { Note } from "../types";

// Capture rapide : la petite fenêtre (CaptureWindow.tsx) envoie le texte ici, dans la
// fenêtre principale, qui l'enregistre. Ainsi une seule fenêtre écrit dans les notes.

export const CAPTURE_EVENT = "quick-capture";
export const CAPTURE_DONE_EVENT = "quick-capture-done";

export type CaptureKind = "note" | "task";
export interface CaptureRequest { id: string; kind: CaptureKind; text: string }
export interface CaptureReply { id: string; ok: boolean; error?: string }

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Note capturée : la première ligne devient le titre, le reste des paragraphes. */
export function captureToNote(text: string): { title: string; content: string } {
  const lines = text.trim().split(/\r?\n/);
  const title = lines[0].trim().slice(0, 120) || tr("Note rapide");
  const body = lines.slice(1).join("\n").trim();
  const content = body
    ? body.split(/\n{2,}/).map((p) => `<p>${p.split("\n").map(escapeHtml).join("<br>")}</p>`).join("")
    : "<p></p>";
  return { title, content };
}

async function save(req: CaptureRequest): Promise<void> {
  const st = useStore.getState();
  if (req.kind === "task") {
    const noteId = await ensureTasksNote(tr("Tâches"));
    await addTask(noteId, resolveDueShortcut(req.text.replace(/\s*\n\s*/g, " ")));
    return;
  }
  const { title, content } = captureToNote(req.text);
  await invoke<Note>("create_note", { title, content, tags: [], folder: null });
  await st.loadNotes();
}

/** Dans la fenêtre principale : reçoit les captures et répond à la fenêtre de capture. */
export function useQuickCaptureReceiver() {
  useEffect(() => {
    const un = listen<CaptureRequest>(CAPTURE_EVENT, async ({ payload }) => {
      const reply = (r: Omit<CaptureReply, "id">) => emitTo("capture", CAPTURE_DONE_EVENT, { id: payload.id, ...r });
      const st = useStore.getState();
      if (st.isLocked) { reply({ ok: false, error: "locked" }); return; }
      try { await save(payload); reply({ ok: true }); }
      catch (e) { reply({ ok: false, error: String(e) }); }
    });
    return () => { un.then((f) => f()); };
  }, []);
}
