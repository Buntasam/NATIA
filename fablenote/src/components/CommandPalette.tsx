import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Search, Terminal, X } from "lucide-react";
import { useStore } from "../store";
import { lockSafely } from "../lib/lockSafely";
import { syncNow, useSyncState } from "../lib/sync";
import { useT } from "../i18n";
import { openDailyNote } from "../lib/dailyNote";
import { findConflicts } from "../lib/conflicts";
import { WHATS_NEW_EVENT } from "./WhatsNew";
import { NoteMetadata } from "../types";

// Palette (Ctrl+P) : ouvrir une note par son titre ou son contenu, ou lancer une commande.
// Les commandes apparaissent aussi sous les notes quand elles correspondent au texte tapé ;
// « > » (ou Ctrl+Shift+P) n'affiche que les commandes.

type PaletteEntry =
  | { kind: "note"; id: string; title: string; folder: string | null; snippet?: string }
  | { kind: "command"; id: string; label: string; shortcut?: string; run: () => void };

type Command = Extract<PaletteEntry, { kind: "command" }>;

/** Événement écouté par l'éditeur pour ouvrir la fenêtre de partage. */
export const SHARE_EVENT = "natia:share-note";

export default function CommandPalette({
  initialQuery = "",
  notes,
  recentIds,
  onSelect,
  onClose,
  onShowShortcuts,
}: {
  initialQuery?: string;
  notes: NoteMetadata[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onShowShortcuts: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [idx, setIdx] = useState(0);
  const t = useT();
  const [ftResults, setFtResults] = useState<{ id: string; title: string; folder: string | null; snippet: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commandMode = query.startsWith(">");

  const commands: Command[] = (() => {
    const st = useStore.getState();
    const cmds: Omit<Command, "kind">[] = [
      { id: "new", label: t("Nouvelle note"), shortcut: "Ctrl+N", run: () => st.createNote() },
      { id: "daily", label: t("Note du jour"), shortcut: "Ctrl+D", run: () => { openDailyNote().catch(() => {}); } },
      { id: "tasks", label: t("Tâches"), shortcut: "Ctrl+Shift+T", run: () => st.toggleTasks() },
      { id: "focus", label: st.focusMode ? t("Quitter le mode focus") : t("Mode focus (plein écran)"), shortcut: "F11", run: () => st.toggleFocusMode() },
      { id: "ai", label: st.showAiPanel ? t("Fermer le panneau IA") : t("Ouvrir le panneau IA"), shortcut: "Ctrl+Shift+A", run: () => st.toggleAiPanel() },
      { id: "versions", label: t("Historique des versions"), shortcut: "Ctrl+Shift+H", run: () => st.toggleVersionPanel() },
      { id: "settings", label: t("Paramètres"), shortcut: "Ctrl+,", run: () => st.toggleSettings() },
      { id: "trash", label: t("Corbeille"), run: () => st.toggleTrash() },
      { id: "attachments", label: t("Fichiers liés"), run: () => st.toggleAttachments() },
      { id: "theme", label: t("Basculer le thème clair/sombre"), run: () => st.toggleTheme() },
      { id: "tabs", label: st.showTabs ? t("Masquer les onglets") : t("Afficher les onglets"), run: () => st.setShowTabs(!st.showTabs) },
      { id: "shortcuts", label: t("Raccourcis clavier"), shortcut: "Ctrl+/", run: onShowShortcuts },
      { id: "whats-new", label: t("Nouveautés de NATIA"), run: () => window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT)) },
    ];
    if (st.activeNote) {
      const id = st.activeNote.id;
      cmds.push({ id: "share", label: t("Partager la note (protégée par mot de passe)"), run: () => window.dispatchEvent(new CustomEvent(SHARE_EVENT)) });
      cmds.push({ id: "close-tab", label: t("Fermer l'onglet"), shortcut: "Ctrl+W", run: () => st.closeTab(id) });
      if (st.openTabs.length > 1) {
        cmds.push({
          id: "close-others", label: t("Fermer les autres onglets"),
          run: () => { st.openTabs.filter((x) => x !== id).forEach((x) => st.closeTab(x)); },
        });
      }
    }
    const conflicts = findConflicts(st.notes).length;
    if (conflicts > 0) cmds.push({ id: "conflicts", label: t("Conflits de synchronisation ({n})", { n: conflicts }), run: () => st.toggleConflicts() });
    if (useSyncState.getState().enabled) cmds.push({ id: "sync", label: t("Synchroniser maintenant"), run: () => { syncNow().catch(() => {}); } });
    if (st.memoryEnabled) cmds.push({ id: "memory", label: t("Mémoire IA (graphe)"), shortcut: "Ctrl+G", run: () => st.toggleGraph() });
    if (st.hasPassword) cmds.push({ id: "lock", label: t("Verrouiller l'application"), shortcut: "Ctrl+L", run: () => { lockSafely(); } });
    if (st.splitNoteId) cmds.push({ id: "unsplit", label: t("Fermer la vue scindée"), run: () => st.setSplitNote(null) });
    return cmds.map((c) => ({ kind: "command" as const, ...c }));
  })();

  const matchCommands = (q: string) => commands.filter((c) => !q || c.label.toLowerCase().includes(q));

  // Recherche plein texte (complète la recherche par titre)
  useEffect(() => {
    if (commandMode || query.trim().length < 2) { setFtResults([]); return; }
    const timer = setTimeout(() => {
      invoke<{ id: string; title: string; folder: string | null; snippet: string }[]>("search_notes", { query })
        .then((r) => setFtResults(r))
        .catch(() => setFtResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, commandMode]);

  const entries: PaletteEntry[] = (() => {
    if (commandMode) return matchCommands(query.slice(1).trim().toLowerCase());
    if (!query.trim()) {
      // Notes récentes d'abord quand pas de requête
      const recentNotes = recentIds
        .map((id) => notes.find((n) => n.id === id))
        .filter(Boolean) as NoteMetadata[];
      const recentSet = new Set(recentIds);
      const others = notes.filter((n) => !recentSet.has(n.id));
      return [...recentNotes, ...others].slice(0, 8)
        .map((n) => ({ kind: "note" as const, id: n.id, title: n.title, folder: n.folder }));
    }
    const q = query.toLowerCase();
    const titleMatches = notes.filter((n) =>
      n.title.toLowerCase().includes(q) || (n.folder ?? "").toLowerCase().includes(q)
    ).slice(0, 8);
    const titleIds = new Set(titleMatches.map((n) => n.id));
    const contentMatches = ftResults.filter((r) => !titleIds.has(r.id)).slice(0, 6);
    return [
      ...titleMatches.map((n) => ({ kind: "note" as const, id: n.id, title: n.title, folder: n.folder })),
      ...contentMatches.map((r) => ({ kind: "note" as const, id: r.id, title: r.title, folder: r.folder, snippet: r.snippet })),
      ...matchCommands(q.trim()).slice(0, 4),
    ];
  })();

  useEffect(() => { setIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelectorAll("[data-entry]")[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const activate = (entry: PaletteEntry) => {
    if (entry.kind === "note") onSelect(entry.id);
    else { entry.run(); onClose(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, entries.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && entries[idx]) { activate(entries[idx]); }
  };

  const firstCommand = commandMode ? -1 : entries.findIndex((e) => e.kind === "command");

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[520px] max-w-[92vw] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {commandMode
            ? <Terminal size={15} className="text-accent shrink-0" />
            : <Search size={15} className="text-muted shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("Ouvrir une note ou lancer une commande…")}
            aria-label={t("Recherche de note ou commande")}
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("Effacer")} className="text-muted hover:text-primary transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {!commandMode && !query.trim() && recentIds.length > 0 && (
            <div className="flex items-center gap-2 px-4 pt-2 pb-1">
              <span className="text-[11px] text-muted uppercase tracking-wider">{t("Récentes")}</span>
            </div>
          )}
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">
              {commandMode ? t("Aucune commande") : t("Aucune note trouvée")}
            </p>
          ) : (
            entries.map((entry, i) => (
              <div key={entry.kind === "command" ? `cmd:${entry.id}` : entry.id}>
                {i === firstCommand && (
                  <div className="px-4 pt-2 pb-1 border-t border-border">
                    <span className="text-[11px] text-muted uppercase tracking-wider">{t("Commandes")}</span>
                  </div>
                )}
                <button
                  data-entry
                  onClick={() => activate(entry)}
                  onMouseMove={() => { if (idx !== i) setIdx(i); }}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                    i === idx ? "bg-accent/10 text-accent" : "text-secondary hover:text-primary"
                  }`}
                >
                  {entry.kind === "command"
                    ? <Terminal size={13} className={i === idx ? "text-accent shrink-0" : "text-muted shrink-0"} />
                    : <FileText size={13} className={i === idx ? "text-accent shrink-0" : "text-muted shrink-0"} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.kind === "command" ? entry.label : (entry.title || t("Sans titre"))}
                    </p>
                    {entry.kind === "note" && entry.snippet && (
                      <p className="text-[11px] text-muted truncate">{entry.snippet}</p>
                    )}
                    {entry.kind === "note" && !entry.snippet && entry.folder && (
                      <p className="text-[11px] text-muted truncate">{entry.folder}</p>
                    )}
                  </div>
                  {entry.kind === "command" && entry.shortcut && (
                    <kbd className="shrink-0 text-[10px] font-mono text-muted bg-hover border border-border rounded px-1.5 py-0.5">{entry.shortcut}</kbd>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-hover/30">
          <span className="text-[11px] text-muted">{t("↑↓ naviguer · Entrée ouvrir · › commandes · Échap fermer")}</span>
          <span className="ml-auto text-[11px] text-muted">Ctrl+P</span>
        </div>
      </div>
    </div>
  );
}
