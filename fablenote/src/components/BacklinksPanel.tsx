import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link2, X } from "lucide-react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { RelatedNote, relatedNotes } from "../lib/related";

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
  const t = useT();

  // Notes qui parlent de la même chose, même sans lien [[…]] entre elles.
  const [related, setRelated] = useState<RelatedNote[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  useEffect(() => {
    if (!activeNote) return;
    let cancelled = false;
    setRelatedLoading(true);
    relatedNotes(activeNote.id, 6)
      .then((r) => { if (!cancelled) setRelated(r); })
      .catch(() => { if (!cancelled) setRelated([]); })
      .finally(() => { if (!cancelled) setRelatedLoading(false); });
    return () => { cancelled = true; };
  }, [activeNote?.id]);

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
          <span className="text-sm font-semibold">{t("Liens")}</span>
        </div>
        <button
          onClick={onClose}
          aria-label={t("Fermer")}
          className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <section>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            {t("Notes liées")}
          </p>
          {relatedLoading && <p className="text-xs text-muted px-3">{t("Recherche…")}</p>}
          {!relatedLoading && related.length === 0 && (
            <p className="text-xs text-muted px-3">{t("Aucune note proche pour l'instant")}</p>
          )}
          <div className="space-y-1">
            {!relatedLoading && related.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNote(n.id)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-hover transition-colors"
              >
                <span className="flex-1 min-w-0 text-sm text-primary truncate">{n.title || t("Sans titre")}</span>
                <span
                  className="shrink-0 h-1.5 w-10 rounded-full bg-hover overflow-hidden"
                  title={t("Proximité : {n} %", { n: Math.round(n.score * 100) })}
                >
                  <span className="block h-full bg-accent/70" style={{ width: `${Math.round(n.score * 100)}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Outgoing links */}
        {outLinks.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              {t("Liens sortants ({n})", { n: outLinks.length })}
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
                    {!note && <span className="ml-2 text-xs text-muted">{t("(introuvable)")}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Backlinks */}
        <section>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            {t("Backlinks ({n})", { n: loading ? "…" : backlinks.length })}
          </p>
          {loading && <p className="text-xs text-muted px-3">{t("Recherche…")}</p>}
          {!loading && backlinks.length === 0 && (
            <p className="text-xs text-muted px-3">{t("Aucune note ne mentionne cette note")}</p>
          )}
          <div className="space-y-1">
            {backlinks.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNote(n.id)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-hover transition-colors"
              >
                <p className="text-sm text-primary truncate">{n.title || t("Sans titre")}</p>
                {n.snippet && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-snug">{n.snippet}</p>
                )}
              </button>
            ))}
          </div>
        </section>

        {outLinks.length === 0 && !loading && backlinks.length === 0 && (
          <p className="text-xs text-muted text-center py-4">
            {t("Écris [[Titre d'une note]] pour créer un lien")}
          </p>
        )}
      </div>
    </div>
  );
}
