import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { useStore } from "../../store";
import { NoteMetadata } from "../../types";
import { locale, useT } from "../../i18n";
import React from "react";
import { drag } from "./dragState";
import { TreeFolder } from "../../lib/noteTree";

// Éléments de l'arbre de la barre latérale.

export type MenuAction =
  | { kind: "note"; note: NoteMetadata; x: number; y: number }
  | { kind: "folder"; path: string; x: number; y: number };

type Note = NoteMetadata & { content: string };

// ─── Date helper ─────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000) return d.toLocaleDateString(locale(), { weekday: "short" });
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short" });
}

// ─── Folder node ─────────────────────────────────────────────────────────────

export function FolderNode({
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
  activeNote: { id: string } | null;
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
    if (!drag.current) return;
    if (drag.current.type === "note") {
      onNoteDrop(drag.current.id, folder.path);
    } else if (drag.current.type === "folder" && drag.current.path !== folder.path) {
      onFolderDrop(drag.current.path, folder.path);
    }
    drag.current = null;
  };

  return (
    <div>
      {/* Folder row */}
      <div
        draggable
        onDragStart={(e) => {
          drag.current = { type: "folder", path: folder.path };
          e.dataTransfer.setData("text/plain", `folder:${folder.path}`);
          e.dataTransfer.effectAllowed = "move";
          setIsDragging(true);
        }}
        onDragEnd={() => { drag.current = null; setIsDragging(false); }}
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

export function NoteItem({
  note, active, indent = 0, color, onSelect, onMenu,
}: {
  note: NoteMetadata;
  active: boolean;
  indent?: number;
  color?: string;
  onSelect: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  return (
    <div
      draggable
      onDragStart={(e) => {
        drag.current = { type: "note", id: note.id };
        e.dataTransfer.setData("text/plain", `note:${note.id}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => { drag.current = null; }}
      onClick={onSelect}
      onContextMenu={onMenu}
      className={`group px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing mb-0.5 transition-colors select-none ${
        active ? "bg-active text-primary" : "text-secondary hover:bg-hover hover:text-primary"
      }`}
      // Hors de l'écran, le navigateur ne calcule pas son rendu : la liste reste fluide avec
      // des milliers de notes.
      style={{ paddingLeft: `${12 + indent}px`, contentVisibility: "auto", containIntrinsicSize: "auto 40px" }}
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
            aria-label={t("Plus d'actions")}
          >
            <MoreHorizontal size={11} />
          </button>
        </div>
      </div>
      {note.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {note.tags.slice(0, 2).map((tag) => (
            <button
              key={tag}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().setSearchQuery(`#${tag}`);
              }}
              className="text-xs px-1.5 py-0.5 bg-hover rounded text-muted hover:text-accent transition-colors"
              aria-label={t("Filtrer par le tag {tag}", { tag })}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New folder input ─────────────────────────────────────────────────────────


export const NewFolderInput = React.forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void }
>(({ value, onChange, onConfirm, onCancel }, ref) => {
  const t = useT();
  return (
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
      placeholder={t("Nom du dossier")}
      className="flex-1 bg-hover rounded px-2 py-0.5 text-sm text-primary outline-none border border-accent/50"
    />
  </div>
  );
});
