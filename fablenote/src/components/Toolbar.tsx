import React, { useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { imageToDataUrl } from "../lib/imageToDataUrl";
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
  Paperclip,
  Underline,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { msg, trError, useT } from "../i18n";

const HIGHLIGHT_COLORS = [
  { hex: "#fef08a", label: msg("Jaune") },
  { hex: "#86efac", label: msg("Vert") },
  { hex: "#93c5fd", label: msg("Bleu") },
  { hex: "#f9a8d4", label: msg("Rose") },
  { hex: "#fdba74", label: msg("Orange") },
  { hex: "#d8b4fe", label: msg("Violet") },
  { hex: "#fca5a5", label: msg("Rouge") },
  { hex: "#d1fae5", label: msg("Menthe") },
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
  const t = useT();

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
            : t("Choisir la taille")}
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
            <p className="text-xs text-muted mb-1.5 font-medium uppercase tracking-wider">{t("Éditer")}</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                [t("+ Col avant"), onAddColBefore],
                [t("+ Col après"), onAddColAfter],
                [t("+ Ligne avant"), onAddRowBefore],
                [t("+ Ligne après"), onAddRowAfter],
                [t("Suppr. col"), onDelCol],
                [t("Suppr. ligne"), onDelRow],
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
              {t("Supprimer le tableau")}
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
  const [linkBox, setLinkBox] = useState<{ top: number; left: number; value: string } | null>(null);
  const linkButtonRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const [tablePicker, setTablePicker] = useState<{ top: number; left: number } | null>(null);
  const [attachError, setAttachError] = useState("");
  const tableButtonRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    editor.chain().focus().toggleHighlight({ color }).run();
    setShowColorPicker(false);
  };

  /** Joint des fichiers à la note ouverte et insère une pastille par fichier. */
  const attachFiles = async () => {
    const note = useStore.getState().activeNote;
    if (!note || !editor) return;
    const picked = await openDialog({ multiple: true, title: t("Joindre un fichier") });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (paths.length === 0) return;
    try {
      const added = await invoke<{ id: string; name: string; size: number }[]>("add_attachments", { noteId: note.id, paths });
      const chain = editor.chain().focus();
      added.forEach((a) => chain.insertAttachment({ id: a.id, name: a.name, size: a.size }));
      chain.run();
    } catch (err) {
      // Pas de window.alert dans Tauri : message court à côté du bouton.
      setAttachError(trError(err));
      setTimeout(() => setAttachError(""), 5000);
    }
  };

  const insertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    imageToDataUrl(file)
      .then((src) => editor.chain().focus().setImage({ src }).run())
      .catch((err) => console.error("Image :", err));
  };

  // Petite fenêtre de saisie : window.prompt() ne s'affiche pas dans Tauri.
  const openLinkBox = () => {
    if (!linkButtonRef.current) return;
    const rect = linkButtonRef.current.getBoundingClientRect();
    const prev = editor.getAttributes("link").href as string | undefined;
    setLinkBox({ top: rect.bottom + 6, left: rect.left, value: prev ?? "https://" });
  };

  const applyLink = (raw: string) => {
    const url = raw.trim();
    setLinkBox(null);
    if (!url || url === "https://") { editor.chain().focus().unsetLink().run(); return; }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const openTablePicker = () => {
    if (!tableButtonRef.current) return;
    const rect = tableButtonRef.current.getBoundingClientRect();
    setTablePicker({ top: rect.bottom + 6, left: rect.left });
  };

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-sidebar overflow-x-auto shrink-0">
      <Btn
        title={t("Gras (Ctrl+B)")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <Bold size={15} />
      </Btn>
      <Btn
        title={t("Italique (Ctrl+I)")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <Italic size={15} />
      </Btn>
      <Btn
        title={t("Souligné (Ctrl+U)")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      >
        <Underline size={15} />
      </Btn>
      <Btn
        title={t("Barré")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      >
        <Strikethrough size={15} />
      </Btn>

      {/* Highlight with color picker */}
      <div className="relative flex items-center">
        <Btn
          title={t("Surligner")}
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
          title={t("Choisir la couleur")}
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
                  title={t(label)}
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
        title={t("Titre 1")}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
      >
        <Heading1 size={15} />
      </Btn>
      <Btn
        title={t("Titre 2")}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
      >
        <Heading2 size={15} />
      </Btn>
      <Btn
        title={t("Titre 3")}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
      >
        <Heading3 size={15} />
      </Btn>

      <Divider />

      <Btn
        title={t("Liste à puces")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <List size={15} />
      </Btn>
      <Btn
        title={t("Liste numérotée")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <ListOrdered size={15} />
      </Btn>
      <Btn
        title={t("Liste de tâches")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      >
        <ListChecks size={15} />
      </Btn>

      <Divider />

      <Btn
        title={t("Citation")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
      >
        <Quote size={15} />
      </Btn>
      <Btn
        title={t("Bloc de code")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
      >
        <Code size={15} />
      </Btn>

      <Divider />

      <Btn
        title={t("Insérer un post-it")}
        onClick={() => editor.chain().focus().insertPostIt().run()}
        active={editor.isActive("postit")}
      >
        <StickyNote size={15} />
      </Btn>
      <Btn
        title={t("Insérer un rappel")}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => (editor.chain().focus() as any).insertReminder().run()}
        active={editor.isActive("reminder")}
      >
        <Bell size={15} />
      </Btn>

      <Divider />

      {/* Link */}
      <div ref={linkButtonRef}>
        <Btn title={t("Lien (Ctrl+K)")} onClick={openLinkBox} active={editor.isActive("link")}>
          <Link size={15} />
        </Btn>
      </div>
      {linkBox && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setLinkBox(null)} />
          <form
            onSubmit={(e) => { e.preventDefault(); applyLink(linkBox.value); }}
            className="fixed z-50 bg-panel border border-border rounded-xl shadow-2xl p-2 flex items-center gap-1.5 w-80"
            style={{ top: linkBox.top, left: linkBox.left }}
          >
            <input
              autoFocus
              value={linkBox.value}
              onChange={(e) => setLinkBox({ ...linkBox, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setLinkBox(null); } }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="https://"
              aria-label={t("Adresse du lien")}
              className="flex-1 min-w-0 bg-hover border border-border rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent/50"
            />
            <button type="submit" className="px-2 py-1 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs">OK</button>
            {editor.isActive("link") && (
              <button type="button" onClick={() => applyLink("")} className="px-2 py-1 rounded-lg text-xs text-red-400 hover:bg-hover">
                {t("Retirer")}
              </button>
            )}
          </form>
        </>
      )}

      {/* Image */}
      <Btn title={t("Insérer une image")} onClick={() => imageInputRef.current?.click()}>
        <Image size={15} />
      </Btn>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />

      {/* Fichier joint */}
      <Btn title={t("Joindre un fichier")} onClick={attachFiles}>
        <Paperclip size={15} />
      </Btn>
      {attachError && <span role="alert" className="text-[10px] text-red-400 max-w-[220px] truncate" title={attachError}>{attachError}</span>}

      {/* Table — grid picker */}
      <div ref={tableButtonRef}>
        <Btn
          title={t("Tableau")}
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
          onInsert={(r, c) => {
            editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run();
            if (editor.state.doc.lastChild?.type.name === "table") {
              const cursorPos = editor.state.selection.anchor;
              editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
              editor.commands.setTextSelection(cursorPos);
            }
          }}
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
