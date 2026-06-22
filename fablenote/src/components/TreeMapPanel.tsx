import { X, Folder, FileText, Network } from "lucide-react";
import { useStore } from "../store";
import { NoteMetadata } from "../types";

const INDENT = 20;

interface TreeFolder {
  name: string;
  path: string;
  children: TreeFolder[];
  notes: NoteMetadata[];
}

function buildTree(notes: NoteMetadata[], folders: string[]) {
  const root: TreeFolder = { name: "", path: "", children: [], notes: [] };

  const ensure = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    let cur = root;
    let curPath = "";
    for (const p of parts) {
      curPath = curPath ? `${curPath}/${p}` : p;
      let ch = cur.children.find((c) => c.name === p);
      if (!ch) {
        ch = { name: p, path: curPath, children: [], notes: [] };
        cur.children.push(ch);
      }
      cur = ch;
    }
    return cur;
  };

  for (const f of folders) ensure(f);

  const rootNotes: NoteMetadata[] = [];
  for (const n of notes) {
    if (!n.folder) rootNotes.push(n);
    else ensure(n.folder).notes.push(n);
  }

  root.children.sort((a, b) => a.name.localeCompare(b.name));
  return { root, rootNotes };
}

function countNotes(f: TreeFolder): number {
  return f.notes.length + f.children.reduce((s, c) => s + countNotes(c), 0);
}

// ─── Single tree row with connecting lines ────────────────────────────────────

function Row({
  label,
  icon,
  onClick,
  isLast,
  depth,
  parentLines,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  isLast: boolean;
  depth: number;
  parentLines: boolean[]; // parentLines[i]=true → ancestor at level i+1 has more siblings
}) {
  return (
    <div
      className={`flex items-center min-h-[26px] px-1 rounded transition-colors ${
        onClick ? "cursor-pointer hover:bg-hover/60" : ""
      }`}
      onClick={onClick}
    >
      {/* Vertical continuation lines for each ancestor level */}
      {parentLines.map((show, i) => (
        <div
          key={i}
          className="relative shrink-0"
          style={{ width: INDENT, alignSelf: "stretch" }}
        >
          {show && (
            <div
              className="absolute bg-border/50"
              style={{ left: 9, width: 1, top: 0, bottom: 0 }}
            />
          )}
        </div>
      ))}

      {/* Branch connector (├── or └──) */}
      {depth > 0 && (
        <div
          className="relative shrink-0"
          style={{ width: INDENT, alignSelf: "stretch" }}
        >
          {/* Vertical part: full if not last, top-half only if last */}
          <div
            className="absolute bg-border/50"
            style={{ left: 9, width: 1, top: 0, bottom: isLast ? "50%" : 0 }}
          />
          {/* Horizontal arm */}
          <div
            className="absolute bg-border/50"
            style={{ left: 9, right: 0, top: "50%", height: 1 }}
          />
        </div>
      )}

      <div className="shrink-0 mr-1.5">{icon}</div>
      <span className="text-sm text-secondary truncate">{label}</span>
    </div>
  );
}

// ─── Folder subtree (recursive) ───────────────────────────────────────────────

function FolderRows({
  folder,
  depth,
  parentLines,
  isLast,
  itemColors,
  onNote,
}: {
  folder: TreeFolder;
  depth: number;
  parentLines: boolean[];
  isLast: boolean;
  itemColors: Record<string, string>;
  onNote: (id: string) => void;
}) {
  const total = countNotes(folder);
  const folderColor = itemColors[`folder:${folder.path}`] ?? "var(--color-muted)";

  // Children inherit one extra line entry — but depth-0 folders have no connector
  // so their children shouldn't show a line at their level.
  const childLines = depth === 0 ? [] : [...parentLines, !isLast];

  return (
    <>
      <Row
        label={folder.name}
        icon={
          <span className="flex items-center gap-1.5">
            <Folder size={14} style={{ color: folderColor }} />
            {total > 0 && (
              <span className="text-[10px] text-muted bg-hover px-1 rounded">
                {total}
              </span>
            )}
          </span>
        }
        isLast={isLast}
        depth={depth}
        parentLines={parentLines}
      />

      {folder.children.map((child, i) => {
        const last =
          i === folder.children.length - 1 && folder.notes.length === 0;
        return (
          <FolderRows
            key={child.path}
            folder={child}
            depth={depth + 1}
            parentLines={childLines}
            isLast={last}
            itemColors={itemColors}
            onNote={onNote}
          />
        );
      })}

      {folder.notes.map((note, i) => (
        <Row
          key={note.id}
          label={note.title}
          icon={
            <FileText
              size={13}
              style={{
                color: itemColors[`note:${note.id}`] ?? "var(--color-muted)",
              }}
            />
          }
          isLast={i === folder.notes.length - 1}
          depth={depth + 1}
          parentLines={childLines}
          onClick={() => onNote(note.id)}
        />
      ))}
    </>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function TreeMapPanel({ onClose }: { onClose: () => void }) {
  const { notes, folders, itemColors, selectNote } = useStore();
  const { root, rootNotes } = buildTree(notes, folders);

  const handleNote = async (id: string) => {
    await selectNote(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-xl w-[560px] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 shrink-0">
          <Network size={15} className="text-accent" />
          <span className="text-sm font-semibold text-primary">Arborescence</span>
          <span className="text-xs text-muted">
            {notes.length} note{notes.length !== 1 ? "s" : ""} ·{" "}
            {folders.length} dossier{folders.length !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-4">
          {notes.length === 0 && folders.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">Aucune note</p>
          ) : (
            <>
              {root.children.map((folder, i) => (
                <FolderRows
                  key={folder.path}
                  folder={folder}
                  depth={0}
                  parentLines={[]}
                  isLast={
                    i === root.children.length - 1 && rootNotes.length === 0
                  }
                  itemColors={itemColors}
                  onNote={handleNote}
                />
              ))}

              {rootNotes.map((note, i) => (
                <Row
                  key={note.id}
                  label={note.title}
                  icon={
                    <FileText
                      size={13}
                      style={{
                        color:
                          itemColors[`note:${note.id}`] ??
                          "var(--color-muted)",
                      }}
                    />
                  }
                  isLast={i === rootNotes.length - 1}
                  depth={0}
                  parentLines={[]}
                  onClick={() => handleNote(note.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
