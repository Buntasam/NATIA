import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { ArrowLeftRight, ExternalLink, X } from "lucide-react";
import { useStore } from "../store";
import { Note } from "../types";
import Tip from "./Tooltip";

// Vue scindée : affiche une seconde note en lecture seule à côté de l'éditeur.
// Cas d'usage : rédiger en consultant une note de référence.

export default function SplitPane() {
  const { splitNoteId, setSplitNote, selectNote, activeNote, notes } = useStore();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState(false);

  // updated_at de la note affichée (pour recharger si elle est modifiée ailleurs)
  const meta = notes.find((n) => n.id === splitNoteId);

  useEffect(() => {
    if (!splitNoteId) { setNote(null); return; }
    let cancelled = false;
    setError(false);
    invoke<Note>("get_note", { id: splitNoteId })
      .then((n) => { if (!cancelled) setNote(n); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [splitNoteId, meta?.updated_at]);

  if (!splitNoteId) return null;

  const swap = async () => {
    // Échange note active ↔ note en référence
    const currentActiveId = activeNote?.id ?? null;
    if (!note) return;
    await selectNote(note.id);
    setSplitNote(currentActiveId);
  };

  return (
    <div className="w-[42%] min-w-64 shrink-0 border-l border-border flex flex-col overflow-hidden bg-base">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-sidebar">
        <span className="text-[11px] text-muted uppercase tracking-wider shrink-0">Référence</span>
        <span className="text-sm font-medium text-primary truncate flex-1">
          {note?.title || "…"}
        </span>
        <Tip label="Échanger avec la note active">
          <button
            onClick={swap}
            aria-label="Échanger avec la note active"
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <ArrowLeftRight size={13} />
          </button>
        </Tip>
        <Tip label="Ouvrir dans l'éditeur">
          <button
            onClick={() => { if (note) { selectNote(note.id); setSplitNote(null); } }}
            aria-label="Ouvrir dans l'éditeur"
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <ExternalLink size={13} />
          </button>
        </Tip>
        <Tip label="Fermer la vue scindée">
          <button
            onClick={() => setSplitNote(null)}
            aria-label="Fermer la vue scindée"
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </Tip>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <p className="text-sm text-muted text-center py-8">Impossible de charger la note</p>
        )}
        {!error && note && (
          <div
            // .ProseMirror : réutilise les styles de l'éditeur (tableaux, code, post-its…)
            className="ProseMirror split-readonly"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }}
          />
        )}
      </div>
    </div>
  );
}
