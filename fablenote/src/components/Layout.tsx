import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Search, Terminal, X } from "lucide-react";
import { useStore } from "../store";
import { lockSafely } from "../lib/lockSafely";
import { useT } from "../i18n";
import AiPanel from "./AiPanel";
import { ConvHistory, ConvPanel } from "./ConversationPanel";
import D20Roller from "./D20Roller";
import Editor from "./Editor";
import ReminderDaemon from "./ReminderDaemon";
import BackupReminder from "./BackupReminder";
import AutoBackupDaemon from "./AutoBackupDaemon";
import ResizeHandle from "./ResizeHandle";
import Sidebar from "./Sidebar";
import SplitPane from "./SplitPane";
// Chargés à l'ouverture : ces panneaux (et d3 / diff) ne pèsent plus sur le démarrage.
const Settings = lazy(() => import("./Settings"));
const ShortcutsOverlay = lazy(() => import("./ShortcutsOverlay"));
const TrashPanel = lazy(() => import("./TrashPanel"));
const VersionTree = lazy(() => import("./VersionTree"));

export default function Layout() {
  const {
    showAiPanel, showVersionPanel, showSettings, showTrash,
    createNote, toggleSettings, toggleAiPanel, toggleVersionPanel,
    focusMode, toggleFocusMode, toggleGraph, notes, selectNote, recentNoteIds,
    settings, isLocked,
    aiPanelWidth, setAiPanelWidth, splitNoteId, goBack, goForward,
  } = useStore();

  // Auto-lock on inactivity
  useEffect(() => {
    const minutes = settings.auto_lock_minutes ?? 0;
    if (!minutes || isLocked) return;
    const ms = minutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { lockSafely(); }, ms); };
    window.addEventListener("mousemove", reset, { passive: true });
    window.addEventListener("keydown", reset, { passive: true });
    window.addEventListener("pointerdown", reset, { passive: true });
    reset();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointerdown", reset);
    };
  }, [settings.auto_lock_minutes, isLocked]);

  const [convOpen, setConvOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsOpenRef = useRef(false);
  useEffect(() => { shortcutsOpenRef.current = shortcutsOpen; }, [shortcutsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Escape: close open panels in priority order
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (shortcutsOpenRef.current) { e.preventDefault(); setShortcutsOpen(false); return; }
        if (st.showSettings) { e.preventDefault(); toggleSettings(); return; }
        if (st.splitNoteId) { e.preventDefault(); st.setSplitNote(null); return; }
        if (st.showAiPanel) { e.preventDefault(); toggleAiPanel(); return; }
        if (st.showVersionPanel) { e.preventDefault(); toggleVersionPanel(); return; }
        if (st.focusMode) { e.preventDefault(); toggleFocusMode(); return; }
        return;
      }

      // Alt+← / Alt+→ : navigation entre notes
      if (e.altKey && !ctrl) {
        if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); goForward(); return; }
      }

      if (!ctrl) return;

      if (e.key === "n") {
        e.preventDefault();
        createNote();
      }
      // Ctrl+Shift+F : recherche globale (Ctrl+F = chercher dans la note, géré par Editor)
      if (e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        if (useStore.getState().focusMode) toggleFocusMode();
        setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-global-search]")?.focus();
        }, 0);
      }
      if (e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
      if (e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((s) => !s);
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setQuickOpen((s) => !s);
      }
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        toggleGraph();
      }
      if (e.shiftKey && e.key === "A") {
        e.preventDefault();
        toggleAiPanel();
      }
      if (e.shiftKey && e.key === "H") {
        e.preventDefault();
        toggleVersionPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNote, toggleSettings, toggleAiPanel, toggleVersionPanel, toggleGraph, toggleFocusMode, goBack, goForward]);

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* Sidebar hidden in focus mode */}
      {!focusMode && <Sidebar />}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-col flex-1 overflow-hidden bg-base">
          <Editor />
        </main>

        {/* Vue scindée : note de référence en lecture seule */}
        {splitNoteId && <SplitPane />}

        {showAiPanel && !convOpen && (
          <aside
            className="relative shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel"
            style={{ width: aiPanelWidth }}
          >
            <ResizeHandle
              edge="left"
              getWidth={() => useStore.getState().aiPanelWidth}
              setWidth={setAiPanelWidth}
              min={280}
              max={560}
            />
            <AiPanel onOpenConv={() => setConvOpen(true)} />
          </aside>
        )}

        {showAiPanel && convOpen && (
          <>
            <ConvPanel onClose={() => setConvOpen(false)} />
            <ConvHistory onExpand={() => setConvOpen(false)} />
          </>
        )}

        {showVersionPanel && (
          <aside className="w-72 shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel">
            <Suspense fallback={null}><VersionTree /></Suspense>
          </aside>
        )}
      </div>

      <Suspense fallback={null}>
        {showSettings && <Settings />}
        {showTrash && <TrashPanel />}
        {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      </Suspense>
      <D20Roller />
      <ReminderDaemon />
      <BackupReminder />
      <AutoBackupDaemon />


      {/* Quick open modal */}
      {quickOpen && (
        <QuickOpen
          notes={notes}
          recentIds={recentNoteIds}
          onSelect={(id) => { selectNote(id); setQuickOpen(false); }}
          onClose={() => setQuickOpen(false)}
          onShowShortcuts={() => { setQuickOpen(false); setShortcutsOpen(true); }}
        />
      )}
    </div>
  );
}

// ─── Quick open modal ─────────────────────────────────────────────────────────

import { NoteMetadata } from "../types";

type PaletteEntry =
  | { kind: "note"; id: string; title: string; folder: string | null; snippet?: string }
  | { kind: "command"; id: string; label: string; run: () => void };

function QuickOpen({
  notes,
  recentIds,
  onSelect,
  onClose,
  onShowShortcuts,
}: {
  notes: NoteMetadata[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onShowShortcuts: () => void;
}) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const t = useT();
  const [ftResults, setFtResults] = useState<{ id: string; title: string; folder: string | null; snippet: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commandMode = query.startsWith(">");

  // Commandes disponibles via ">"
  const commands: PaletteEntry[] = (() => {
    const st = useStore.getState();
    const cmds: { id: string; label: string; run: () => void }[] = [
      { id: "new", label: t("Nouvelle note"), run: () => st.createNote() },
      { id: "focus", label: st.focusMode ? t("Quitter le mode focus") : t("Mode focus"), run: () => st.toggleFocusMode() },
      { id: "ai", label: st.showAiPanel ? t("Fermer le panneau IA") : t("Ouvrir le panneau IA"), run: () => st.toggleAiPanel() },
      { id: "versions", label: t("Historique des versions"), run: () => st.toggleVersionPanel() },
      { id: "settings", label: t("Paramètres"), run: () => st.toggleSettings() },
      { id: "trash", label: t("Corbeille"), run: () => st.toggleTrash() },
      { id: "theme", label: t("Basculer le thème clair/sombre"), run: () => st.toggleTheme() },
      { id: "shortcuts", label: t("Raccourcis clavier"), run: onShowShortcuts },
    ];
    if (st.memoryEnabled) cmds.push({ id: "memory", label: t("Mémoire IA (graphe)"), run: () => st.toggleGraph() });
    if (st.hasPassword) cmds.push({ id: "lock", label: t("Verrouiller l'application"), run: () => { lockSafely(); } });
    if (st.splitNoteId) cmds.push({ id: "unsplit", label: t("Fermer la vue scindée"), run: () => st.setSplitNote(null) });
    return cmds.map((c) => ({ kind: "command" as const, ...c }));
  })();

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
    if (commandMode) {
      const q = query.slice(1).trim().toLowerCase();
      return commands.filter((c) => c.kind === "command" && (!q || c.label.toLowerCase().includes(q)));
    }
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
    const titleMatches = notes.filter((n) =>
      n.title.toLowerCase().includes(query.toLowerCase()) ||
      (n.folder ?? "").toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);
    const titleIds = new Set(titleMatches.map((n) => n.id));
    const contentMatches = ftResults.filter((r) => !titleIds.has(r.id)).slice(0, 6);
    return [
      ...titleMatches.map((n) => ({ kind: "note" as const, id: n.id, title: n.title, folder: n.folder })),
      ...contentMatches.map((r) => ({ kind: "note" as const, id: r.id, title: r.title, folder: r.folder, snippet: r.snippet })),
    ];
  })();

  useEffect(() => { setIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
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

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[520px] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {commandMode
            ? <Terminal size={15} className="text-accent shrink-0" />
            : <Search size={15} className="text-muted shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("Ouvrir une note… (> pour une commande)")}
            aria-label={t("Recherche de note ou commande")}
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("Effacer")} className="text-muted hover:text-primary transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto">
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
              <button
                key={entry.kind === "command" ? `cmd:${entry.id}` : entry.id}
                onClick={() => activate(entry)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                  i === idx ? "bg-accent/10 text-accent" : "text-secondary hover:bg-hover hover:text-primary"
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
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-hover/30">
          <span className="text-[11px] text-muted">{t("↑↓ naviguer · Entrée ouvrir · › commandes · Échap fermer")}</span>
          <span className="ml-auto text-[11px] text-muted">Ctrl+P</span>
        </div>
      </div>
    </div>
  );
}
