import React, { useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  Bell,
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  StickyNote,
  Strikethrough,
  Table,
  Underline,
} from "lucide-react";

const HIGHLIGHT_COLORS = [
  { hex: "#fef08a", label: "Jaune" },
  { hex: "#86efac", label: "Vert" },
  { hex: "#93c5fd", label: "Bleu" },
  { hex: "#f9a8d4", label: "Rose" },
  { hex: "#fdba74", label: "Orange" },
  { hex: "#d8b4fe", label: "Violet" },
  { hex: "#fca5a5", label: "Rouge" },
  { hex: "#d1fae5", label: "Menthe" },
];

const GRID_MAX_COLS = 8;
const GRID_MAX_ROWS = 8;

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function Btn({ onClick, active, title, children, disabled }: ToolbarButtonProps) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-accent text-white"
          : "text-secondary hover:text-primary hover:bg-hover"
      } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

// ─── Table picker (grid) ──────────────────────────────────────────────────────

interface TablePickerProps {
  pos: { top: number; left: number };
  inTable: boolean;
  onInsert: (rows: number, cols: number) => void;
  onAddColBefore: () => void;
  onAddColAfter: () => void;
  onAddRowBefore: () => void;
  onAddRowAfter: () => void;
  onDelCol: () => void;
  onDelRow: () => void;
  onDelTable: () => void;
  onClose: () => void;
}

function TablePicker({
  pos, inTable,
  onInsert, onAddColBefore, onAddColAfter, onAddRowBefore, onAddRowAfter,
  onDelCol, onDelRow, onDelTable, onClose,
}: TablePickerProps) {
  const [hover, setHover] = useState({ r: 0, c: 0 });

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-panel border border-border rounded-xl shadow-2xl p-3 select-none"
        style={{ top: pos.top, left: pos.left }}
      >
        {/* Grid label */}
        <p className="text-xs text-muted text-center mb-2">
          {hover.r > 0 && hover.c > 0
            ? <span className="text-primary font-semibold">{hover.c} × {hover.r}</span>
            : "Choisir la taille"}
        </p>

        {/* Grid */}
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${GRID_MAX_COLS}, 1fr)` }}
          onMouseLeave={() => setHover({ r: 0, c: 0 })}
        >
          {Array.from({ length: GRID_MAX_ROWS }).map((_, ri) =>
            Array.from({ length: GRID_MAX_COLS }).map((_, ci) => {
              const active = ri < hover.r && ci < hover.c;
              return (
                <div
                  key={`${ri}-${ci}`}
                  onMouseEnter={() => setHover({ r: ri + 1, c: ci + 1 })}
                  onClick={() => { onInsert(ri + 1, ci + 1); onClose(); }}
                  className={`w-5 h-5 rounded-sm border cursor-pointer transition-colors ${
                    active
                      ? "bg-accent border-accent"
                      : "bg-hover border-border hover:border-accent/50"
                  }`}
                />
              );
            })
          )}
        </div>

        {/* Edit actions — only when inside a table */}
        {inTable && (
          <div className="mt-3 pt-3 border-t border-border space-y-0.5">
            <p className="text-xs text-muted mb-1.5 font-medium uppercase tracking-wider">Éditer</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                ["+ Col avant", onAddColBefore],
                ["+ Col après", onAddColAfter],
                ["+ Ligne avant", onAddRowBefore],
                ["+ Ligne après", onAddRowAfter],
                ["Suppr. col", onDelCol],
                ["Suppr. ligne", onDelRow],
              ].map(([label, action]) => (
                <button
                  key={label as string}
                  onClick={() => { (action as () => void)(); onClose(); }}
                  className="text-xs px-2 py-1.5 rounded text-secondary hover:text-primary hover:bg-hover transition-colors text-left"
                >
                  {label as string}
                </button>
              ))}
            </div>
            <button
              onClick={() => { onDelTable(); onClose(); }}
              className="w-full text-xs px-2 py-1.5 rounded text-red-500 hover:bg-hover transition-colors text-left mt-1"
            >
              Supprimer le tableau
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────

export default function Toolbar({ editor }: { editor: Editor | null }) {
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].hex);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tablePicker, setTablePicker] = useState<{ top: number; left: number } | null>(null);
  const tableButtonRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    editor.chain().focus().toggleHighlight({ color }).run();
    setShowColorPicker(false);
  };

  const insertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien :", prev ?? "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  };

  const openTablePicker = () => {
    if (!tableButtonRef.current) return;
    const rect = tableButtonRef.current.getBoundingClientRect();
    setTablePicker({ top: rect.bottom + 6, left: rect.left });
  };

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-sidebar overflow-x-auto shrink-0">
      <Btn
        title="Gras (Ctrl+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <Bold size={15} />
      </Btn>
      <Btn
        title="Italique (Ctrl+I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <Italic size={15} />
      </Btn>
      <Btn
        title="Souligné (Ctrl+U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      >
        <Underline size={15} />
      </Btn>
      <Btn
        title="Barré"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      >
        <Strikethrough size={15} />
      </Btn>

      {/* Highlight with color picker */}
      <div className="relative flex items-center">
        <Btn
          title="Surligner"
          onClick={() => editor.chain().focus().toggleHighlight({ color: highlightColor }).run()}
          active={editor.isActive("highlight")}
        >
          <div className="relative flex flex-col items-center gap-0.5">
            <Highlighter size={14} />
            <div className="w-3.5 h-1 rounded-full" style={{ backgroundColor: highlightColor }} />
          </div>
        </Btn>
        <button
          onClick={() => setShowColorPicker((s) => !s)}
          className="p-0.5 text-muted hover:text-primary transition-colors"
          title="Choisir la couleur"
        >
          <ChevronDown size={10} />
        </button>
        {showColorPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
            <div className="absolute top-full left-0 mt-1 z-50 bg-panel border border-border rounded-lg shadow-xl p-2 flex flex-wrap gap-1.5 w-36">
              {HIGHLIGHT_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  title={label}
                  onClick={() => applyHighlight(hex)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: hex,
                    outline: hex === highlightColor ? "2px solid #555" : "1px solid rgba(0,0,0,0.18)",
                    outlineOffset: hex === highlightColor ? "1px" : "0",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Divider />

      <Btn
        title="Titre 1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
      >
        <Heading1 size={15} />
      </Btn>
      <Btn
        title="Titre 2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
      >
        <Heading2 size={15} />
      </Btn>
      <Btn
        title="Titre 3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
      >
        <Heading3 size={15} />
      </Btn>

      <Divider />

      <Btn
        title="Liste à puces"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <List size={15} />
      </Btn>
      <Btn
        title="Liste numérotée"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <ListOrdered size={15} />
      </Btn>
      <Btn
        title="Liste de tâches"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      >
        <ListChecks size={15} />
      </Btn>

      <Divider />

      <Btn
        title="Citation"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
      >
        <Quote size={15} />
      </Btn>
      <Btn
        title="Bloc de code"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
      >
        <Code size={15} />
      </Btn>

      <Divider />

      <Btn
        title="Insérer un post-it"
        onClick={() => editor.chain().focus().insertPostIt().run()}
        active={editor.isActive("postit")}
      >
        <StickyNote size={15} />
      </Btn>
      <Btn
        title="Insérer un rappel"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => (editor.chain().focus() as any).insertReminder().run()}
        active={editor.isActive("reminder")}
      >
        <Bell size={15} />
      </Btn>

      <Divider />

      {/* Link */}
      <Btn title="Lien (Ctrl+K)" onClick={setLink} active={editor.isActive("link")}>
        <Link size={15} />
      </Btn>

      {/* Image */}
      <Btn title="Insérer une image" onClick={() => imageInputRef.current?.click()}>
        <Image size={15} />
      </Btn>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />

      {/* Table — grid picker */}
      <div ref={tableButtonRef}>
        <Btn
          title="Tableau"
          onClick={openTablePicker}
          active={editor.isActive("table")}
        >
          <Table size={15} />
        </Btn>
      </div>

      {tablePicker && (
        <TablePicker
          pos={tablePicker}
          inTable={editor.isActive("table")}
          onInsert={(r, c) => editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run()}
          onAddColBefore={() => editor.chain().focus().addColumnBefore().run()}
          onAddColAfter={() => editor.chain().focus().addColumnAfter().run()}
          onAddRowBefore={() => editor.chain().focus().addRowBefore().run()}
          onAddRowAfter={() => editor.chain().focus().addRowAfter().run()}
          onDelCol={() => editor.chain().focus().deleteColumn().run()}
          onDelRow={() => editor.chain().focus().deleteRow().run()}
          onDelTable={() => editor.chain().focus().deleteTable().run()}
          onClose={() => setTablePicker(null)}
        />
      )}
    </div>
  );
}
