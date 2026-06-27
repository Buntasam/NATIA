import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Download,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  Moon,
  MoreHorizontal,
  Network,
  NotebookPen,
  Pin,
  PinOff,
  Search,
  Settings,
  Sun,
  Trash2,
  MoveRight,
  Pencil,
  Undo2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import TreeMapPanel from "./TreeMapPanel";
import CalendarPanel from "./CalendarPanel";
import GraphPanel from "./GraphPanel";
import { useStore } from "../store";
import { NoteMetadata } from "../types";

// ─── Module-level drag state (dataTransfer is unreliable in WebView2) ────────

let _drag: { type: "note"; id: string } | { type: "folder"; path: string } | null = null;

// ─── Tree types ───────────────────────────────────────────────────────────────

interface TreeFolder {
  name: string;
  path: string;
  children: TreeFolder[];
  notes: NoteMetadata[];
}

function ensurePath(root: TreeFolder, path: string): TreeFolder {
  const parts = path.split("/").filter(Boolean);
  let cur = root;
  let curPath = "";
  for (const part of parts) {
    curPath = curPath ? `${curPath}/${part}` : part;
    let child = cur.children.find((c) => c.name === part);
    if (!child) {
      child = { name: part, path: curPath, children: [], notes: [] };
      cur.children.push(child);
    }
    cur = child;
  }
  return cur;
}

function buildTree(
  notes: NoteMetadata[],
  folders: string[],
  query: string
): { root: TreeFolder; rootNotes: NoteMetadata[] } {
  const root: TreeFolder = { name: "", path: "", children: [], notes: [] };

  for (const f of folders) ensurePath(root, f);

  const filtered = query
    ? notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    : notes;

  const rootNotes: NoteMetadata[] = [];
  for (const note of filtered) {
    if (!note.folder) rootNotes.push(note);
    else ensurePath(root, note.folder).notes.push(note);
  }

  root.children.sort((a, b) => a.name.localeCompare(b.name));
  return { root, rootNotes };
}

// ─── Date helper ─────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return d.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000) return d.toLocaleDateString("fr", { weekday: "short" });
  return d.toLocaleDateString("fr", { day: "2-digit", month: "short" });
}

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = [
  { label: "Rouge",  value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Jaune",  value: "#eab308" },
  { label: "Vert",   value: "#22c55e" },
  { label: "Cyan",   value: "#06b6d4" },
  { label: "Bleu",   value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Rose",   value: "#ec4899" },
  { label: "Gris",   value: "#6b7280" },
];

// ─── Context menu ─────────────────────────────────────────────────────────────

type MenuAction =
  | { kind: "note"; note: NoteMetadata; x: number; y: number }
  | { kind: "folder"; path: string; x: number; y: number };

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
    isLoading,
    itemColors,
    setItemColor,
    deleteItemColor,
    hasPassword,
    lock,
    settings,
    pinnedNoteIds,
    togglePinNote,
    memoryGraphEnabled,
    memoryEnabled,
  } = useStore();

  const [showTreeMap, setShowTreeMap] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const { showGraph, toggleGraph } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Full-text search
  interface SearchResult { id: string; title: string; folder: string | null; updated_at: string; snippet: string; }
  const [ftResults, setFtResults] = useState<SearchResult[]>([]);
  const [ftLoading, setFtLoading] = useState(false);
  useEffect(() => {
    if (!searchQuery.trim()) { setFtResults([]); return; }
    setFtLoading(true);
    const timer = setTimeout(() => {
      invoke<SearchResult[]>("search_notes", { query: searchQuery })
        .then((r) => setFtResults(r))
        .catch(() => setFtResults([]))
        .finally(() => setFtLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
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
        className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden"
        onClick={closeMenu}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
          <span className="text-accent font-bold text-lg tracking-tight select-none">NATIA</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={() => setShowTreeMap(true)}
              title="Arborescence"
              className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <Network size={14} />
            </button>
            {memoryEnabled && (
              <button
                onClick={toggleGraph}
                title="Mémoire IA"
                className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
                  <line x1="6" y1="9" x2="12" y2="15"/><line x1="18" y1="9" x2="12" y2="15"/>
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowCalendar(true)}
              title="Vue calendrier"
              className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <CalendarDays size={14} />
            </button>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-hover rounded-lg px-3 py-1.5">
            <Search size={14} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Rechercher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-primary placeholder-muted outline-none w-full"
            />
          </div>
        </div>

        <div className="px-3 pb-2 flex gap-1">
          <button
            onClick={() => createNote()}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
          >
            <FilePlus size={14} />
            Nouvelle note
          </button>
          <button
            onClick={() => { setCreatingIn(""); setNewFolderName(""); }}
            title="Nouveau dossier"
            className="px-2 py-1.5 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors"
          >
            <FolderPlus size={14} />
          </button>
        </div>

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
              if (!_drag) return;
              if (_drag.type === "note") handleNoteDrop(_drag.id, null);
              else if (_drag.type === "folder") handleFolderDrop(_drag.path, null);
              _drag = null;
            }}
          >
            {isLoading && (
              <p className="text-muted text-xs text-center py-4">Chargement…</p>
            )}
            {/* Full-text search results */}
            {searchQuery.trim() && (
              <div className="pb-1">
                {ftLoading && <p className="text-xs text-muted text-center py-3">Recherche…</p>}
                {!ftLoading && ftResults.length === 0 && (
                  <p className="text-xs text-muted text-center py-3">Aucun résultat</p>
                )}
                {!ftLoading && ftResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectNote(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-colors ${
                      activeNote?.id === r.id ? "bg-active" : "hover:bg-hover"
                    }`}
                  >
                    <p className="text-sm font-medium text-primary truncate">{r.title || "Sans titre"}</p>
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
                <p className="text-muted text-sm">Aucune note</p>
                <p className="text-muted text-xs mt-1">Crée ta première note</p>
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
                    <span className="text-[10px] text-muted uppercase tracking-wider">Épinglées</span>
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
                Déposer ici → racine
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
              {lastMove.type === "note" ? "Note déplacée" : "Dossier déplacé"}
            </span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors shrink-0 font-medium"
            >
              <Undo2 size={12} />
              Annuler
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
            Paramètres
          </button>
          <button
            onClick={toggleTrash}
            title="Corbeille"
            className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <Trash2 size={15} />
          </button>
          {hasPassword && (
            <button
              onClick={() => lock()}
              title="Verrouiller l'application"
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <Lock size={15} />
            </button>
          )}
          <button
            onClick={toggleTheme}
            title={`Thème : ${theme} — cliquer pour basculer`}
            className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            aria-label="Basculer le thème"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Tree map overlay */}
      {showTreeMap && <TreeMapPanel onClose={() => setShowTreeMap(false)} />}
      {showCalendar && <CalendarPanel onClose={() => setShowCalendar(false)} />}
      {showGraph && <GraphPanel onClose={toggleGraph} />}

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
                    ? <><PinOff size={13} />Désépingler</>
                    : <><Pin size={13} />Épingler</>}
                </button>
                <div className="border-t border-border my-1" />

                {/* Color picker */}
                <div className="px-3 py-2">
                  <p className="text-xs text-muted mb-2">Couleur</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c) => {
                      const current = itemColors[`note:${menu.note.id}`];
                      return (
                        <button
                          key={c.value}
                          title={c.label}
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
                        title="Sans couleur"
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
                    Déplacer vers…
                    <ChevronRight size={11} className="ml-auto" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 bg-panel border border-border rounded-lg shadow-xl py-1 min-w-40 hidden group-hover:block z-50">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                      onClick={() => { moveNote(menu.note.id, null); closeMenu(); }}
                    >
                      — Racine
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
                      filters: [{ name: "Page HTML", extensions: ["html"] }],
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
                  Exporter (.html)
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-hover transition-colors"
                  onClick={() => { deleteNote(menu.note.id); closeMenu(); }}
                >
                  <Trash2 size={13} />
                  Supprimer
                </button>
              </>
            )}

            {menu.kind === "folder" && (
              <>
                <p className="px-3 py-1 text-xs text-muted truncate max-w-48">/{menu.path}</p>
                <div className="border-t border-border my-1" />

                {/* Color picker */}
                <div className="px-3 py-2">
                  <p className="text-xs text-muted mb-2">Couleur</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c) => {
                      const current = itemColors[`folder:${menu.path}`];
                      return (
                        <button
                          key={c.value}
                          title={c.label}
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
                        title="Sans couleur"
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
                  Nouveau sous-dossier
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
                  Renommer
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-hover transition-colors"
                  onClick={() => { deleteFolder(menu.path); closeMenu(); }}
                >
                  <Trash2 size={13} />
                  Supprimer le dossier
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ─── Folder node ─────────────────────────────────────────────────────────────

function FolderNode({
  folder, depth, expanded, activeNote, renamingPath, renameValue, renameRef,
  creatingIn, newFolderName, newFolderRef, itemColors,
  onToggle, onSelectNote, onNoteMenu, onFolderMenu,
  onRenameChange, onRenameConfirm, onRenameCancel,
  onNewFolderChange, onNewFolderConfirm, onNewFolderCancel,
  setCreatingIn, setExpanded, onNoteDrop, onFolderDrop,
}: {
  folder: TreeFolder;
  depth: number;
  expanded: Set<string>;
  activeNote: NoteMetadata | Note | null;
  renamingPath: string | null;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement>;
  creatingIn: string | null;
  newFolderName: string;
  newFolderRef: React.RefObject<HTMLInputElement>;
  itemColors: Record<string, string>;
  onToggle: (path: string) => void;
  onSelectNote: (id: string) => void;
  onNoteMenu: (e: React.MouseEvent, action: MenuAction) => void;
  onFolderMenu: (e: React.MouseEvent, action: MenuAction) => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onNewFolderChange: (v: string) => void;
  onNewFolderConfirm: (parent: string) => void;
  onNewFolderCancel: () => void;
  setCreatingIn: (p: string | null) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  onNoteDrop: (noteId: string, folder: string | null) => void;
  onFolderDrop: (draggedPath: string, targetFolderPath: string | null) => void;
}) {
  const isOpen = expanded.has(folder.path);
  const pl = depth * 12;
  const folderColor = itemColors[`folder:${folder.path}`] ?? null;
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!_drag) return;
    if (_drag.type === "note") {
      onNoteDrop(_drag.id, folder.path);
    } else if (_drag.type === "folder" && _drag.path !== folder.path) {
      onFolderDrop(_drag.path, folder.path);
    }
    _drag = null;
  };

  return (
    <div>
      {/* Folder row */}
      <div
        draggable
        onDragStart={(e) => {
          _drag = { type: "folder", path: folder.path };
          e.dataTransfer.setData("text/plain", `folder:${folder.path}`);
          e.dataTransfer.effectAllowed = "move";
          setIsDragging(true);
        }}
        onDragEnd={() => { _drag = null; setIsDragging(false); }}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-grab active:cursor-grabbing transition-colors select-none ${
          isDragOver
            ? "bg-accent/15 ring-1 ring-accent/40"
            : isDragging
            ? "opacity-50"
            : "hover:bg-hover"
        }`}
        style={{ paddingLeft: `${8 + pl}px` }}
        onClick={() => onToggle(folder.path)}
        onContextMenu={(e) => onFolderMenu(e, { kind: "folder", path: folder.path, x: e.clientX, y: e.clientY })}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ChevronRight
          size={12}
          className={`text-muted shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        {isOpen
          ? <FolderOpen size={14} className="shrink-0" style={{ color: folderColor ?? "#d97757" }} />
          : <Folder size={14} className="shrink-0" style={{ color: isDragOver ? "#d97757" : (folderColor ?? "var(--color-muted)") }} />}

        {renamingPath === folder.path ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onRenameConfirm();
              if (e.key === "Escape") onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-sm text-primary outline-none border-b border-accent"
          />
        ) : (
          <span className="flex-1 text-sm text-secondary truncate">{folder.name}</span>
        )}

        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-primary transition-all"
          onClick={(e) => onFolderMenu(e, { kind: "folder", path: folder.path, x: e.clientX, y: e.clientY })}
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      {/* Children */}
      {isOpen && (
        <div>
          {folder.children.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              activeNote={activeNote}
              renamingPath={renamingPath}
              renameValue={renameValue}
              renameRef={renameRef}
              creatingIn={creatingIn}
              newFolderName={newFolderName}
              newFolderRef={newFolderRef}
              itemColors={itemColors}
              onToggle={onToggle}
              onSelectNote={onSelectNote}
              onNoteMenu={onNoteMenu}
              onFolderMenu={onFolderMenu}
              onRenameChange={onRenameChange}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              onNewFolderChange={onNewFolderChange}
              onNewFolderConfirm={onNewFolderConfirm}
              onNewFolderCancel={onNewFolderCancel}
              setCreatingIn={setCreatingIn}
              setExpanded={setExpanded}
              onNoteDrop={onNoteDrop}
              onFolderDrop={onFolderDrop}
            />
          ))}

          {/* New subfolder input */}
          {creatingIn === folder.path && (
            <div style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }} className="pr-2 py-0.5">
              <NewFolderInput
                ref={newFolderRef}
                value={newFolderName}
                onChange={onNewFolderChange}
                onConfirm={() => onNewFolderConfirm(folder.path)}
                onCancel={onNewFolderCancel}
              />
            </div>
          )}

          {folder.notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              active={activeNote?.id === note.id}
              indent={pl + 16}
              color={itemColors[`note:${note.id}`]}
              onSelect={() => onSelectNote(note.id)}
              onMenu={(e) => onNoteMenu(e, { kind: "note", note, x: e.clientX, y: e.clientY })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Note item ────────────────────────────────────────────────────────────────

function NoteItem({
  note, active, indent = 0, color, onSelect, onMenu,
}: {
  note: NoteMetadata;
  active: boolean;
  indent?: number;
  color?: string;
  onSelect: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        _drag = { type: "note", id: note.id };
        e.dataTransfer.setData("text/plain", `note:${note.id}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => { _drag = null; }}
      onClick={onSelect}
      onContextMenu={onMenu}
      className={`group px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing mb-0.5 transition-colors select-none ${
        active ? "bg-active text-primary" : "text-secondary hover:bg-hover hover:text-primary"
      }`}
      style={{ paddingLeft: `${12 + indent}px` }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {color && (
            <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
          )}
          <span className="text-sm font-medium truncate leading-snug">{note.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted">{formatDate(note.updated_at)}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-primary transition-all"
            onClick={(e) => { e.stopPropagation(); onMenu(e); }}
          >
            <MoreHorizontal size={11} />
          </button>
        </div>
      </div>
      {note.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {note.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-hover rounded text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New folder input ─────────────────────────────────────────────────────────

import React from "react";

const NewFolderInput = React.forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void }
>(({ value, onChange, onConfirm, onCancel }, ref) => (
  <div className="flex items-center gap-1">
    <Folder size={13} className="text-accent shrink-0" />
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onConfirm();
        if (e.key === "Escape") onCancel();
      }}
      placeholder="Nom du dossier"
      className="flex-1 bg-hover rounded px-2 py-0.5 text-sm text-primary outline-none border border-accent/50"
    />
  </div>
));

type Note = NoteMetadata & { content: string };
