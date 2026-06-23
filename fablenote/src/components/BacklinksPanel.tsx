import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link2, X } from "lucide-react";
import { useStore } from "../store";

interface SearchResult {
  id: string;
  title: string;
  folder: string | null;
  updated_at: string;
  snippet: string;
}

interface Props {
  onClose: () => void;
}

export default function BacklinksPanel({ onClose }: Props) {
  const { activeNote, selectNote, notes } = useStore();
  const [backlinks, setBacklinks] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeNote) return;
    setLoading(true);
    // Search for [[NoteTitle]] patterns in other notes
    invoke<SearchResult[]>("search_notes", { query: `[[${activeNote.title}` })
      .then((r) => setBacklinks(r.filter((n) => n.id !== activeNote.id)))
      .catch(() => setBacklinks([]))
      .finally(() => setLoading(false));
  }, [activeNote?.id]);

  // Extract [[...]] links in the current note
  const outLinks = (() => {
    if (!activeNote) return [];
    const regex = /\[\[([^\]]+)\]\]/g;
    const plain = activeNote.content.replace(/<[^>]+>/g, " ");
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(plain)) !== null) {
      if (!found.includes(m[1])) found.push(m[1]);
    }
    return found;
  })();

  const findNoteByTitle = (title: string) =>
    notes.find((n) => n.title.toLowerCase() === title.toLowerCase());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Link2 size={15} className="text-accent" />
          <span className="text-sm font-semibold">Liens</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Outgoing links */}
        {outLinks.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Liens sortants ({outLinks.length})
            </p>
            <div className="space-y-1">
              {outLinks.map((title) => {
                const note = findNoteByTitle(title);
                return (
                  <button
                    key={title}
                    onClick={() => note && selectNote(note.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      note
                        ? "text-accent hover:bg-hover"
                        : "text-muted cursor-default line-through"
                    }`}
                  >
                    [[{title}]]
                    {!note && <span className="ml-2 text-xs text-muted">(introuvable)</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Backlinks */}
        <section>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Backlinks ({loading ? "…" : backlinks.length})
          </p>
          {loading && <p className="text-xs text-muted px-3">Recherche…</p>}
          {!loading && backlinks.length === 0 && (
            <p className="text-xs text-muted px-3">Aucune note ne mentionne cette note</p>
          )}
          <div className="space-y-1">
            {backlinks.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNote(n.id)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-hover transition-colors"
              >
                <p className="text-sm text-primary truncate">{n.title || "Sans titre"}</p>
                {n.snippet && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-snug">{n.snippet}</p>
                )}
              </button>
            ))}
          </div>
        </section>

        {outLinks.length === 0 && !loading && backlinks.length === 0 && (
          <p className="text-xs text-muted text-center py-4">
            Écris [[Titre d'une note]] pour créer un lien
          </p>
        )}
      </div>
    </div>
  );
}
