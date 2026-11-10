import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ListChecks,
  ChevronRight,
  Columns2,
  Download,
  FilePlus,
  Folder,
  FolderPlus,
  Lock,
  Moon,
  Network,
  StickyNote,
  Pin,
  PinOff,
  Search,
  Settings,
  Sun,
  Tag,
  Paperclip,
  Trash2,
  MoveRight,
  Pencil,
  Undo2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ResizeHandle from "./ResizeHandle";
import Tip from "./Tooltip";
import SyncIndicator from "./SyncIndicator";
import { useStore } from "../store";
import { lockOrSetup } from "../lib/lockSafely";
import { openDailyNote } from "../lib/dailyNote";
import { NoteMetadata } from "../types";
import { msg, useT } from "../i18n";
import React from "react";
import { NatiaLockup } from "./Brand";
import { drag } from "./sidebar/dragState";
import { buildTree } from "../lib/noteTree";
import type { MenuAction } from "./sidebar/TreeItems";
import { FolderNode, NoteItem, NewFolderInput } from "./sidebar/TreeItems";
// Chargés à l'ouverture : ces panneaux (et d3 / diff) ne pèsent plus sur le démarrage.
const TreeMapPanel = lazy(() => import("./TreeMapPanel"));
const CalendarPanel = lazy(() => import("./CalendarPanel"));
const PostItsPanel = lazy(() => import("./PostItsPanel"));
const GraphPanel = lazy(() => import("./GraphPanel"));

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = [
  { label: msg("Rouge"),  value: "#ef4444" },
  { label: msg("Orange"), value: "#f97316" },
  { label: msg("Jaune"),  value: "#eab308" },
  { label: msg("Vert"),   value: "#22c55e" },
  { label: msg("Cyan"),   value: "#06b6d4" },
  { label: msg("Bleu"),   value: "#3b82f6" },
  { label: msg("Violet"), value: "#8b5cf6" },
  { label: msg("Rose"),   value: "#ec4899" },
  { label: msg("Gris"),   value: "#6b7280" },
];

const THEME_NAMES: Record<string, string> = {
  light: msg("Clair"), dark: msg("Sombre"), midnight: msg("Minuit"), ink: msg("Encre"), foret: msg("Forêt"),
  brume: msg("Brume"), sakura: "Sakura", crepuscule: msg("Crépuscule"), ocean: msg("Océan"),
};

// ─── Context menu ─────────────────────────────────────────────────────────────


// ─── Main sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    notes,
    activeNote,
    searchQuery,
    folders,
    isDark,
    toggleTheme,
    theme,
    setSearchQuery,
    createNote,
    selectNote,
    deleteNote,
    moveNote,
    createFolder,
    deleteFolder,
    renameFolder,
    toggleSettings,
    toggleTrash,
    toggleAttachments,
    isLoading,
    itemColors,
    setItemColor,
    deleteItemColor,
    hasPassword,
    pinnedNoteIds,
    togglePinNote,
    memoryEnabled,
    sidebarWidth,
    setSidebarWidth,
    setSplitNote,
  } = useStore();

  const t = useT();
  const [showTreeMap, setShowTreeMap] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPostIts, setShowPostIts] = useState(false);
  const { showGraph, toggleGraph } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Full-text search
  interface SearchResult { id: string; title: string; folder: string | null; updated_at: string; snippet: string; }
  const [ftResults, setFtResults] = useState<SearchResult[]>([]);
  const [ftLoading, setFtLoading] = useState(false);
  useEffect(() => {
    // Les requêtes "#tag" filtrent par tag localement, pas via la recherche plein texte
    if (!searchQuery.trim() || searchQuery.trim().startsWith("#")) { setFtResults([]); setFtLoading(false); return; }
    setFtLoading(true);
    const timer = setTimeout(() => {
      invoke<SearchResult[]>("search_notes", { query: searchQuery })
        .then((r) => setFtResults(r))
        .catch(() => setFtResults([]))
        .finally(() => setFtLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filtrage par tag : requête "#xxx"
  const tagQuery = searchQuery.trim().startsWith("#")
    ? searchQuery.trim().slice(1).toLowerCase()
    : null;
  const tagResults = tagQuery !== null
    ? notes.filter((n) => n.tags.some((t) => t.toLowerCase().includes(tagQuery)))
    : [];

  // Section Tags repliable
  const [tagsOpen, setTagsOpen] = useState(localStorage.getItem("natia_tags_open") === "1");
  const toggleTagsOpen = () => {
    setTagsOpen((v) => {
      localStorage.setItem("natia_tags_open", v ? "0" : "1");
      return !v;
    });
  };
  const tagCounts = (() => {
    const map = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const [menu, setMenu] = useState<MenuAction | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rootDragOver, setRootDragOver] = useState(false);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  type LastMove =
    | { type: "note"; id: string; fromFolder: string | null; toFolder: string | null }
    | { type: "folder"; oldPath: string; newPath: string };
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordMove = (move: LastMove) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setLastMove(move);
    undoTimerRef.current = setTimeout(() => setLastMove(null), 5000);
  };

  const handleUndo = () => {
    if (!lastMove) return;
    if (lastMove.type === "note") moveNote(lastMove.id, lastMove.fromFolder);
    else renameFolder(lastMove.newPath, lastMove.oldPath);
    setLastMove(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  useEffect(() => {
    if (creatingIn !== null) newFolderRef.current?.focus();
  }, [creatingIn]);

  useEffect(() => {
    if (renamingPath !== null) renameRef.current?.select();
  }, [renamingPath]);

  // Breadcrumb de l'éditeur → déplie le dossier dans l'arbre
  useEffect(() => {
    const onReveal = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (!path) return;
      setSearchQuery("");
      setExpanded((s) => {
        const n = new Set(s);
        const parts = path.split("/");
        let cur = "";
        for (const part of parts) {
          cur = cur ? `${cur}/${part}` : part;
          n.add(cur);
        }
        return n;
      });
    };
    window.addEventListener("natia:reveal-folder", onReveal);
    return () => window.removeEventListener("natia:reveal-folder", onReveal);
  }, [setSearchQuery]);

  const toggle = (path: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });

  const openMenu = (e: React.MouseEvent, action: MenuAction) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(action);
  };

  const closeMenu = () => setMenu(null);

  const submitNewFolder = async (parentPath: string) => {
    const name = newFolderName.trim();
    if (name) {
      const full = parentPath ? `${parentPath}/${name}` : name;
      await createFolder(full);
      setExpanded((s) => new Set([...s, full]));
      if (parentPath) setExpanded((s) => new Set([...s, parentPath]));
    }
    setCreatingIn(null);
    setNewFolderName("");
  };

  const submitRename = async () => {
    if (!renamingPath) return;
    const newName = renameValue.trim();
    if (newName && newName !== renamingPath.split("/").pop()) {
      const parts = renamingPath.split("/");
      parts[parts.length - 1] = newName;
      await renameFolder(renamingPath, parts.join("/"));
    }
    setRenamingPath(null);
  };

  const { root, rootNotes } = buildTree(notes, folders, searchQuery);

  const allFolderPaths = [
    ...folders,
    ...notes.filter((n) => n.folder).map((n) => n.folder as string),
  ].filter((v, i, a) => a.indexOf(v) === i).sort();

  const handleNoteDrop = (noteId: string, toFolder: string | null) => {
    const fromFolder = notes.find((n) => n.id === noteId)?.folder ?? null;
    if (fromFolder === toFolder) return;
    moveNote(noteId, toFolder);
    recordMove({ type: "note", id: noteId, fromFolder, toFolder });
  };

  const handleFolderDrop = (draggedPath: string, targetFolderPath: string | null) => {
    const lastName = draggedPath.split("/").pop()!;
    const newPath = targetFolderPath ? `${targetFolderPath}/${lastName}` : lastName;
    if (newPath === draggedPath) return;
    if (newPath.startsWith(draggedPath + "/")) return;
    renameFolder(draggedPath, newPath);
    recordMove({ type: "folder", oldPath: draggedPath, newPath });
    setExpanded((s) => {
      const n = new Set(s);
      n.delete(draggedPath);
      if (targetFolderPath) n.add(targetFolderPath);
      return n;
    });
  };

  return (
    <>
      <div
        className="relative shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden"
        style={{ width: sidebarWidth }}
        onClick={closeMenu}
      >
        <ResizeHandle
          edge="right"
          getWidth={() => useStore.getState().sidebarWidth}
          setWidth={setSidebarWidth}
          min={200}
          max={420}
        />
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
          <NatiaLockup height={22} className="text-primary select-none" />
          <div className="ml-auto flex items-center gap-0.5">
            <SyncIndicator />
            <Tip
              label={hasPassword ? t("Verrouiller l'application") : t("Verrouiller : activez d'abord un mot de passe")}
              shortcut={hasPassword ? "Ctrl+L" : undefined}
            >
              <button
                onClick={lockOrSetup}
                aria-label={t("Verrouiller l'application")}
                className={`p-1 rounded transition-colors hover:bg-hover ${hasPassword ? "text-muted hover:text-primary" : "text-muted/40 hover:text-muted"}`}
              >
                <Lock size={14} />
              </button>
            </Tip>
            <Tip label={t("Arborescence")}>
              <button
                onClick={() => setShowTreeMap(true)}
                aria-label={t("Arborescence")}
                className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <Network size={14} />
              </button>
            </Tip>
            <Tip label={memoryEnabled ? t("Mémoire IA") : t("Mémoire IA (désactivée)")} shortcut={memoryEnabled ? "Ctrl+G" : undefined}>
              <button
                onClick={toggleGraph}
                aria-label={t("Mémoire IA")}
                className={`p-1 rounded transition-colors ${
                  memoryEnabled ? "text-muted hover:text-primary hover:bg-hover" : "text-muted/40 hover:text-muted hover:bg-hover"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
                  <line x1="6" y1="9" x2="12" y2="15"/><line x1="18" y1="9" x2="12" y2="15"/>
                </svg>
              </button>
            </Tip>
            <Tip label={t("Vue calendrier")}>
              <button
                onClick={() => setShowCalendar(true)}
                aria-label={t("Vue calendrier")}
                className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <CalendarDays size={14} />
              </button>
            </Tip>
            <Tip label={t("Tâches")} shortcut="Ctrl+Shift+T">
              <button
                onClick={() => useStore.getState().toggleTasks()}
                aria-label={t("Tâches")}
                className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <ListChecks size={14} />
              </button>
            </Tip>
            <Tip label={t("Post-its")}>
              <button
                onClick={() => setShowPostIts(true)}
                aria-label={t("Post-its")}
                className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <StickyNote size={14} />
              </button>
            </Tip>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-hover rounded-lg px-3 py-1.5">
            <Search size={14} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder={t("Rechercher… (#tag)")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-global-search
              aria-label={t("Recherche globale")}
              className="bg-transparent text-sm text-primary placeholder-muted outline-none w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label={t("Effacer la recherche")}
                className="text-muted hover:text-primary transition-colors shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="px-3 pb-2 flex gap-1">
          <button
            onClick={() => createNote()}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
          >
            <FilePlus size={14} />
            {t("Nouvelle note")}
          </button>
          <Tip label={t("Note du jour")} shortcut="Ctrl+D">
            <button
              onClick={() => { openDailyNote().catch(() => {}); }}
              aria-label={t("Note du jour")}
              className="px-2 py-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors"
            >
              <CalendarPlus size={14} />
            </button>
          </Tip>
          <Tip label={t("Nouveau dossier")}>
            <button
              onClick={() => { setCreatingIn(""); setNewFolderName(""); }}
              aria-label={t("Nouveau dossier")}
              className="px-2 py-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors"
            >
              <FolderPlus size={14} />
            </button>
          </Tip>
        </div>

        {/* Section Tags repliable */}
        {tagCounts.length > 0 && (
          <div className="px-3 pb-1">
            <button
              onClick={toggleTagsOpen}
              className="flex items-center gap-1.5 w-full px-1 py-1 text-muted hover:text-primary transition-colors"
              aria-expanded={tagsOpen}
            >
              <ChevronRight size={11} className={`transition-transform ${tagsOpen ? "rotate-90" : ""}`} />
              <Tag size={11} />
              <span className="text-[11px] uppercase tracking-wider">{t("Tags")}</span>
              <span className="text-[11px] opacity-60">({tagCounts.length})</span>
            </button>
            {tagsOpen && (
              <div className="flex flex-wrap gap-1 px-1 pt-1 pb-1.5">
                {tagCounts.map(([tag, count]) => {
                  const active = tagQuery !== null && tag.toLowerCase().includes(tagQuery);
                  return (
                    <button
                      key={tag}
                      onClick={() => setSearchQuery(active && searchQuery === `#${tag}` ? "" : `#${tag}`)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                        active
                          ? "bg-accent/15 border-accent/40 text-accent"
                          : "bg-hover border-border text-secondary hover:text-primary hover:border-accent/30"
                      }`}
                    >
                      {tag} <span className="opacity-50">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {creatingIn === "" && (
          <div className="px-3 pb-2">
            <NewFolderInput
              ref={newFolderRef}
              value={newFolderName}
              onChange={setNewFolderName}
              onConfirm={() => submitNewFolder("")}
              onCancel={() => { setCreatingIn(null); setNewFolderName(""); }}
            />
          </div>
        )}

        <div
          className={`flex-1 overflow-y-auto px-2 pb-2 transition-colors ${
              rootDragOver ? "bg-accent/5 ring-1 ring-inset ring-accent/20 rounded" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setRootDragOver(true); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setRootDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setRootDragOver(false);
              if (!drag.current) return;
              if (drag.current.type === "note") handleNoteDrop(drag.current.id, null);
              else if (drag.current.type === "folder") handleFolderDrop(drag.current.path, null);
              drag.current = null;
            }}
          >
            {isLoading && (
              <p className="text-muted text-xs text-center py-4">{t("Chargement…")}</p>
            )}
            {/* Résultats par tag (#tag) */}
            {tagQuery !== null && (
              <div className="pb-1">
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <Tag size={10} className="text-accent" />
                  <span className="text-[11px] text-muted uppercase tracking-wider">
                    {t("Tag « {tag} » · {n}", { tag: tagQuery || "…", n: tagResults.length })}
                  </span>
                </div>
                {tagResults.length === 0 && (
                  <p className="text-xs text-muted text-center py-3">{t("Aucune note avec ce tag")}</p>
                )}
                {tagResults.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    active={activeNote?.id === note.id}
                    color={itemColors[`note:${note.id}`]}
                    onSelect={() => selectNote(note.id)}
                    onMenu={(e) => openMenu(e, { kind: "note", note, x: e.clientX, y: e.clientY })}
                  />
                ))}
              </div>
            )}
            {/* Full-text search results */}
            {searchQuery.trim() && tagQuery === null && (
              <div className="pb-1">
                {ftLoading && <p className="text-xs text-muted text-center py-3">{t("Recherche…")}</p>}
                {!ftLoading && ftResults.length === 0 && (
                  <p className="text-xs text-muted text-center py-3">{t("Aucun résultat")}</p>
                )}
                {!ftLoading && ftResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectNote(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-colors ${
                      activeNote?.id === r.id ? "bg-active" : "hover:bg-hover"
                    }`}
                  >
                    <p className="text-sm font-medium text-primary truncate">{r.title || t("Sans titre")}</p>
                    {r.snippet && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-snug">{r.snippet}</p>
                    )}
                    {r.folder && (
                      <p className="text-xs text-muted/70 mt-0.5 truncate">📁 {r.folder}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!searchQuery.trim() && !isLoading && notes.length === 0 && folders.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-muted text-sm">{t("Aucune note")}</p>
                <p className="text-muted text-xs mt-1">{t("Crée ta première note")}</p>
              </div>
            )}

            {/* Pinned notes section */}
            {!searchQuery.trim() && pinnedNoteIds.length > 0 && (() => {
              const pinned = pinnedNoteIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as NoteMetadata[];
              if (pinned.length === 0) return null;
              return (
                <div className="mb-1">
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Pin size={9} className="text-muted" />
                    <span className="text-[11px] text-muted uppercase tracking-wider">{t("Épinglées")}</span>
                  </div>
                  {pinned.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      active={activeNote?.id === note.id}
                      color={itemColors[`note:${note.id}`]}
                      onSelect={() => selectNote(note.id)}
                      onMenu={(e) => openMenu(e, { kind: "note", note, x: e.clientX, y: e.clientY })}
                    />
                  ))}
                  <div className="mx-2 my-1 h-px bg-border" />
                </div>
              );
            })()}

            {!searchQuery.trim() && root.children.map((folder) => (
              <FolderNode
                key={folder.path}
                folder={folder}
                depth={0}
                expanded={expanded}
                activeNote={activeNote}
                renamingPath={renamingPath}
                renameValue={renameValue}
                renameRef={renameRef}
                creatingIn={creatingIn}
                newFolderName={newFolderName}
                newFolderRef={newFolderRef}
                itemColors={itemColors}
                onToggle={toggle}
                onSelectNote={selectNote}
                onNoteMenu={openMenu}
                onFolderMenu={openMenu}
                onRenameChange={setRenameValue}
                onRenameConfirm={submitRename}
                onRenameCancel={() => setRenamingPath(null)}
                onNewFolderChange={setNewFolderName}
                onNewFolderConfirm={submitNewFolder}
                onNewFolderCancel={() => { setCreatingIn(null); setNewFolderName(""); }}
                setCreatingIn={setCreatingIn}
                setExpanded={setExpanded}
                onNoteDrop={handleNoteDrop}
                onFolderDrop={handleFolderDrop}
              />
            ))}
            {!searchQuery.trim() && rootDragOver && (
              <p className="text-xs text-accent text-center py-1 select-none">
                {t("Déposer ici → racine")}
              </p>
            )}
            {!searchQuery.trim() && rootNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                active={activeNote?.id === note.id}
                color={itemColors[`note:${note.id}`]}
                onSelect={() => selectNote(note.id)}
                onMenu={(e) => openMenu(e, { kind: "note", note, x: e.clientX, y: e.clientY })}
              />
            ))}
        </div>

        {lastMove && (
          <div className="mx-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-hover border border-border text-xs text-secondary">
            <span className="flex-1 truncate">
              {lastMove.type === "note" ? t("Note déplacée") : t("Dossier déplacé")}
            </span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors shrink-0 font-medium"
            >
              <Undo2 size={12} />
              {t("Annuler")}
            </button>
          </div>
        )}

        {/* Footer — always visible */}
        <div className="px-3 py-2 border-t border-border flex items-center gap-1 shrink-0">
          <button
            onClick={toggleSettings}
            className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors text-sm"
          >
            <Settings size={15} />
            {t("Paramètres")}
          </button>
          <Tip label={t("Fichiers liés")} side="top">
            <button
              onClick={toggleAttachments}
              aria-label={t("Fichiers liés")}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <Paperclip size={15} />
            </button>
          </Tip>
          <Tip label={t("Corbeille")} side="top">
            <button
              onClick={toggleTrash}
              aria-label={t("Corbeille")}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </Tip>
          <Tip label={t("Thème : {name}", { name: t(THEME_NAMES[theme] ?? theme) })} side="top">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              aria-label={t("Basculer le thème")}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </Tip>
        </div>
      </div>

      {/* Tree map overlay */}
      <Suspense fallback={null}>
        {showTreeMap && <TreeMapPanel onClose={() => setShowTreeMap(false)} />}
        {showCalendar && <CalendarPanel onClose={() => setShowCalendar(false)} />}
        {showPostIts && <PostItsPanel onClose={() => setShowPostIts(false)} />}
        {showGraph && <GraphPanel onClose={toggleGraph} />}
      </Suspense>

      {/* Context menus */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 bg-panel border border-border rounded-lg shadow-xl py-1 min-w-40"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {menu.kind === "note" && (
              <>
                <p className="px-3 py-1 text-xs text-muted truncate max-w-48">{menu.note.title}</p>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  onClick={() => { togglePinNote(menu.note.id); closeMenu(); }}
                >
                  {pinnedNoteIds.includes(menu.note.id)
                    ? <><PinOff size={13} />{t("Désépingler")}</>
                    : <><Pin size={13} />{t("Épingler")}</>}
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  onClick={() => { setSplitNote(menu.note.id); closeMenu(); }}
                >
                  <Columns2 size={13} />
                  {t("Ouvrir côte à côte")}
                </button>
                <div className="border-t border-border my-1" />

                {/* Color picker */}
                <div className="px-3 py-2">
                  <p className="text-xs text-muted mb-2">{t("Couleur")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c) => {
                      const current = itemColors[`note:${menu.note.id}`];
                      return (
                        <button
                          key={c.value}
                          title={t(c.label)}
                          className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c.value,
                            outline: current === c.value ? "2px solid white" : "2px solid transparent",
                            outlineOffset: "1px",
                          }}
                          onClick={() => { setItemColor(`note:${menu.note.id}`, c.value); closeMenu(); }}
                        />
                      );
                    })}
                    {itemColors[`note:${menu.note.id}`] && (
                      <button
                        title={t("Sans couleur")}
                        className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted hover:text-primary text-xs transition-colors"
                        onClick={() => { deleteItemColor(`note:${menu.note.id}`); closeMenu(); }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="border-t border-border my-1" />

                <div className="relative group">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                    <MoveRight size={13} />
                    {t("Déplacer vers…")}
                    <ChevronRight size={11} className="ml-auto" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 bg-panel border border-border rounded-lg shadow-xl py-1 min-w-40 hidden group-hover:block z-50">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                      onClick={() => { moveNote(menu.note.id, null); closeMenu(); }}
                    >
                      — {t("Racine")}
                    </button>
                    {allFolderPaths.map((fp) => (
                      <button
                        key={fp}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                        onClick={() => { moveNote(menu.note.id, fp); closeMenu(); }}
                      >
                        <Folder size={11} className="text-muted shrink-0" />
                        <span className="truncate">{fp}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  onClick={async () => {
                    const filePath = await save({
                      defaultPath: `${menu.note.title}.html`,
                      filters: [{ name: t("Page HTML"), extensions: ["html"] }],
                    });
                    closeMenu();
                    if (!filePath) return;
                    try {
                      await invoke("export_note_to_path", { noteId: menu.note.id, path: filePath });
                    } catch (e) {
                      console.error("export_note_to_path:", e);
                    }
                  }}
                >
                  <Download size={13} />
                  {t("Exporter (.html)")}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-hover transition-colors"
                  onClick={() => { deleteNote(menu.note.id); closeMenu(); }}
                >
                  <Trash2 size={13} />
                  {t("Supprimer")}
                </button>
              </>
            )}

            {menu.kind === "folder" && (
              <>
                <p className="px-3 py-1 text-xs text-muted truncate max-w-48">/{menu.path}</p>
                <div className="border-t border-border my-1" />

                {/* Color picker */}
                <div className="px-3 py-2">
                  <p className="text-xs text-muted mb-2">{t("Couleur")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c) => {
                      const current = itemColors[`folder:${menu.path}`];
                      return (
                        <button
                          key={c.value}
                          title={t(c.label)}
                          className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c.value,
                            outline: current === c.value ? "2px solid white" : "2px solid transparent",
                            outlineOffset: "1px",
                          }}
                          onClick={() => { setItemColor(`folder:${menu.path}`, c.value); closeMenu(); }}
                        />
                      );
                    })}
                    {itemColors[`folder:${menu.path}`] && (
                      <button
                        title={t("Sans couleur")}
                        className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted hover:text-primary text-xs transition-colors"
                        onClick={() => { deleteItemColor(`folder:${menu.path}`); closeMenu(); }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="border-t border-border my-1" />

                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  onClick={() => {
                    setCreatingIn(menu.path);
                    setNewFolderName("");
                    setExpanded((s) => new Set([...s, menu.path]));
                    closeMenu();
                  }}
                >
                  <FolderPlus size={13} />
                  {t("Nouveau sous-dossier")}
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  onClick={() => {
                    setRenamingPath(menu.path);
                    setRenameValue(menu.path.split("/").pop() ?? "");
                    closeMenu();
                  }}
                >
                  <Pencil size={13} />
                  {t("Renommer")}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-hover transition-colors"
                  onClick={() => { deleteFolder(menu.path); closeMenu(); }}
                >
                  <Trash2 size={13} />
                  {t("Supprimer le dossier")}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
