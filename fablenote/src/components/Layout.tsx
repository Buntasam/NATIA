import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { lockOrSetup, lockSafely } from "../lib/lockSafely";
import { indexAttachments } from "../lib/attachments";
import { useT } from "../i18n";
import AiPanel from "./AiPanel";
import { ConvHistory, ConvPanel } from "./ConversationPanel";
import D20Roller from "./D20Roller";
import Editor from "./Editor";
import ReminderDaemon from "./ReminderDaemon";
import BackupReminder from "./BackupReminder";
import AutoBackupDaemon from "./AutoBackupDaemon";
import SyncDaemon from "./SyncDaemon";
import ResizeHandle from "./ResizeHandle";
import Sidebar from "./Sidebar";
import SplitPane from "./SplitPane";
import NoteTabs from "./NoteTabs";
import CommandPalette from "./CommandPalette";
import { setFocusFullscreen } from "../lib/focus";
// Chargés à l'ouverture : ces panneaux (et d3 / diff) ne pèsent plus sur le démarrage.
const Settings = lazy(() => import("./Settings"));
const ShortcutsOverlay = lazy(() => import("./ShortcutsOverlay"));
const TrashPanel = lazy(() => import("./TrashPanel"));
const AttachmentsPanel = lazy(() => import("./AttachmentsPanel"));
const VersionTree = lazy(() => import("./VersionTree"));

export default function Layout() {
  const {
    showAiPanel, showVersionPanel, showSettings, showTrash, showAttachments,
    createNote, toggleSettings, toggleAiPanel, toggleVersionPanel,
    focusMode, toggleFocusMode, toggleGraph, notes, selectNote, recentNoteIds,
    settings, isLocked, showTabs,
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

  // Texte des fichiers joints pas encore lus (PDF importés, synchronisés…), pour la recherche.
  useEffect(() => { indexAttachments(); }, []);

  // Un fichier lâché hors de la note ne doit pas remplacer la fenêtre par son contenu.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files") && !(e.target as HTMLElement)?.closest?.(".ProseMirror")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => { window.removeEventListener("dragover", block); window.removeEventListener("drop", block); };
  }, []);

  const [convOpen, setConvOpen] = useState(false);
  /** Palette ouverte (avec son texte de départ), ou null. */
  const [quickOpen, setQuickOpen] = useState<string | null>(null);

  // Plein écran qui suit le mode focus.
  useEffect(() => { setFocusFullscreen(focusMode); }, [focusMode]);
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

      // Ctrl+L : verrouiller (ou créer un mot de passe s'il n'y en a pas)
      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") { e.preventDefault(); lockOrSetup(); return; }

      // F11 : mode focus en plein écran
      if (e.key === "F11") { e.preventDefault(); toggleFocusMode(); return; }

      // Onglets : Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+W, Ctrl+1…9
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const st = useStore.getState();
        const tabs = st.openTabs.filter((id) => st.notes.some((n) => n.id === id));
        if (tabs.length < 2) return;
        const cur = tabs.indexOf(st.activeNote?.id ?? "");
        const next = tabs[(cur + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length];
        st.selectNote(next);
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const st = useStore.getState();
        if (st.activeNote) st.closeTab(st.activeNote.id);
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const st = useStore.getState();
        const tabs = st.openTabs.filter((id) => st.notes.some((n) => n.id === id));
        // Ctrl+9 : dernier onglet, comme dans les navigateurs.
        const target = e.key === "9" ? tabs[tabs.length - 1] : tabs[Number(e.key) - 1];
        if (target) { e.preventDefault(); st.selectNote(target); }
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
      // Ctrl+P : palette (notes et commandes) ; Ctrl+Shift+P : directement les commandes
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setQuickOpen((s) => (s ? null : e.shiftKey ? ">" : ""));
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
          {showTabs && !focusMode && <NoteTabs />}
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
        {showAttachments && <AttachmentsPanel />}
        {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      </Suspense>
      <D20Roller />
      <ReminderDaemon />
      <BackupReminder />
      <AutoBackupDaemon />
      <SyncDaemon />


      {/* Quick open modal */}
      {quickOpen !== null && (
        <CommandPalette
          initialQuery={quickOpen}
          notes={notes}
          recentIds={recentNoteIds}
          onSelect={(id) => { selectNote(id); setQuickOpen(null); }}
          onClose={() => setQuickOpen(null)}
          onShowShortcuts={() => { setQuickOpen(null); setShortcutsOpen(true); }}
        />
      )}
    </div>
  );
}
