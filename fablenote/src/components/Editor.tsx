import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { PostIt } from "../extensions/PostIt";
import { Wikilink } from "../extensions/Wikilink";
import { Reminder } from "../extensions/Reminder";
import {
  Bell,
  BrainCircuit,
  Check,
  Clock,
  Clipboard,
  Code,
  Download,
  Heading1,
  Heading2,
  Heading3,
  LayoutTemplate,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Quote,
  Save,
  Search,
  StickyNote,
  Table as TableIcon,
  Upload,
  X,
} from "lucide-react";
import TemplatesPanel from "./TemplatesPanel";
import BacklinksPanel from "./BacklinksPanel";

const lowlight = createLowlight(common);
import { useStore } from "../store";
import Toolbar from "./Toolbar";
import VoiceRecorder from "./VoiceRecorder";

const AUTOSAVE_DELAY = 1500;

// ─── Slash command items ──────────────────────────────────────────────────────

interface SlashItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  keywords: string[];
  apply: (editor: ReturnType<typeof useEditor>) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1", label: "Titre 1", desc: "Grand titre de section", icon: <Heading1 size={14} />,
    keywords: ["titre", "h1", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2", label: "Titre 2", desc: "Titre moyen", icon: <Heading2 size={14} />,
    keywords: ["titre", "h2", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3", label: "Titre 3", desc: "Petit titre", icon: <Heading3 size={14} />,
    keywords: ["titre", "h3", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "ul", label: "Liste à puces", desc: "Liste non ordonnée", icon: <List size={14} />,
    keywords: ["liste", "ul", "bullet"],
    apply: (e) => e?.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ol", label: "Liste numérotée", desc: "Liste ordonnée", icon: <ListOrdered size={14} />,
    keywords: ["liste", "ol", "numbered"],
    apply: (e) => e?.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "todo", label: "Liste de tâches", desc: "Cases à cocher", icon: <ListChecks size={14} />,
    keywords: ["todo", "tache", "checkbox", "task"],
    apply: (e) => e?.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote", label: "Citation", desc: "Bloc de citation", icon: <Quote size={14} />,
    keywords: ["citation", "quote", "blockquote"],
    apply: (e) => e?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code", label: "Bloc de code", desc: "Code avec coloration syntaxique", icon: <Code size={14} />,
    keywords: ["code", "bloc"],
    apply: (e) => e?.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table", label: "Tableau", desc: "Tableau 3×3", icon: <TableIcon size={14} />,
    keywords: ["tableau", "table", "grid"],
    apply: (e) => {
      if (!e) return;
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (e.state.doc.lastChild?.type.name === "table") {
        const cursorPos = e.state.selection.anchor;
        e.commands.insertContentAt(e.state.doc.content.size, { type: "paragraph" });
        e.commands.setTextSelection(cursorPos);
      }
    },
  },
  {
    id: "postit", label: "Post-it", desc: "Note adhésive colorée", icon: <StickyNote size={14} />,
    keywords: ["postit", "post", "note", "adhesive"],
    apply: (e) => e?.chain().focus().insertPostIt().run(),
  },
  {
    id: "reminder", label: "Rappel", desc: "Bloc de rappel avec date", icon: <Bell size={14} />,
    keywords: ["rappel", "reminder", "alarm"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: (e) => (e?.chain().focus() as any)?.insertReminder().run(),
  },
  {
    id: "hr", label: "Séparateur", desc: "Ligne horizontale", icon: <Minus size={14} />,
    keywords: ["separateur", "hr", "ligne", "divider"],
    apply: (e) => e?.chain().focus().setHorizontalRule().run(),
  },
];

function filterSlashItems(query: string): SlashItem[] {
  if (!query) return SLASH_ITEMS;
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q))
  );
}

// ─── Slash menu component ─────────────────────────────────────────────────────

function SlashMenu({
  items, pos, selectedIdx, onSelect,
}: {
  items: SlashItem[];
  pos: { x: number; y: number };
  selectedIdx: number;
  onSelect: (item: SlashItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  return (
    <div
      className="fixed z-[300] bg-panel border border-border rounded-xl shadow-2xl py-1.5 w-64 max-h-72 overflow-y-auto"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted">Aucune commande</p>
      ) : (
        <div ref={listRef}>
          {items.map((item, i) => (
            <button
              key={item.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
                i === selectedIdx
                  ? "bg-accent/15 text-accent"
                  : "text-secondary hover:bg-hover hover:text-primary"
              }`}
            >
              <span className={`shrink-0 ${i === selectedIdx ? "text-accent" : "text-muted"}`}>
                {item.icon}
              </span>
              <div>
                <p className="text-xs font-medium leading-none mb-0.5">{item.label}</p>
                <p className="text-[10px] text-muted">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wikilink autocomplete menu ───────────────────────────────────────────────

import { NoteMetadata } from "../types";

function WikilinkMenu({
  notes, query, pos, selectedIdx, onSelect,
}: {
  notes: NoteMetadata[];
  query: string;
  pos: { x: number; y: number };
  selectedIdx: number;
  onSelect: (note: NoteMetadata) => void;
}) {
  const filtered = query.trim()
    ? notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : notes.slice(0, 8);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="fixed z-[300] bg-panel border border-border rounded-xl shadow-2xl py-1.5 w-64 max-h-64 overflow-y-auto"
      style={{ left: pos.x, top: pos.y }}
    >
      <div ref={listRef}>
        {filtered.map((note, i) => (
          <button
            key={note.id}
            onMouseDown={(e) => { e.preventDefault(); onSelect(note); }}
            className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
              i === selectedIdx
                ? "bg-accent/15 text-accent"
                : "text-secondary hover:bg-hover hover:text-primary"
            }`}
          >
            <Link2 size={12} className={i === selectedIdx ? "text-accent shrink-0" : "text-muted shrink-0"} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{note.title}</p>
              {note.folder && <p className="text-[10px] text-muted truncate">{note.folder}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Find & replace bar ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findInDoc(doc: any, search: string): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  if (!search.trim()) return matches;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(node.text)) !== null) {
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
  });
  return matches;
}

function FindReplaceBar({
  editor,
  onClose,
}: {
  editor: ReturnType<typeof useEditor>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState("");
  const [matches, setMatches] = useState<{ from: number; to: number }[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!editor || !search.trim()) { setMatches([]); setIdx(0); return; }
    const found = findInDoc(editor.state.doc, search);
    setMatches(found);
    setIdx(0);
    if (found[0]) editor.commands.setTextSelection(found[0]);
  }, [search, editor]);

  const goTo = (i: number) => {
    if (!editor || matches.length === 0) return;
    const next = ((i % matches.length) + matches.length) % matches.length;
    setIdx(next);
    editor.commands.setTextSelection(matches[next]);
    editor.commands.scrollIntoView();
  };

  const replaceCurrent = () => {
    if (!editor || !matches[idx]) return;
    editor.chain().setTextSelection(matches[idx]).insertContent(replace).run();
    const fresh = findInDoc(editor.state.doc, search);
    setMatches(fresh);
    if (fresh.length > 0) {
      const ni = Math.min(idx, fresh.length - 1);
      setIdx(ni);
      editor.commands.setTextSelection(fresh[ni]);
      editor.commands.scrollIntoView();
    }
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;
    const chain = editor.chain();
    for (let i = matches.length - 1; i >= 0; i--) {
      chain.setTextSelection(matches[i]).insertContent(replace);
    }
    chain.run();
    setMatches([]);
    setIdx(0);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel shrink-0 flex-wrap">
      <Search size={13} className="text-muted shrink-0" />
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); goTo(idx + (e.shiftKey ? -1 : 1)); }
          if (e.key === "Escape") onClose();
        }}
        placeholder="Rechercher…"
        className="bg-hover border border-border rounded-md px-2 py-1 text-xs text-primary outline-none focus:border-accent/50 w-40"
      />
      <span className="text-[10px] text-muted shrink-0 min-w-10">
        {matches.length > 0 ? `${idx + 1}/${matches.length}` : search ? "0 résultat" : ""}
      </span>
      <button onClick={() => goTo(idx - 1)} disabled={matches.length === 0} className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors text-xs">↑</button>
      <button onClick={() => goTo(idx + 1)} disabled={matches.length === 0} className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors text-xs">↓</button>
      <div className="w-px h-4 bg-border mx-1" />
      <input
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceCurrent(); } if (e.key === "Escape") onClose(); }}
        placeholder="Remplacer…"
        className="bg-hover border border-border rounded-md px-2 py-1 text-xs text-primary outline-none focus:border-accent/50 w-40"
      />
      <button onClick={replaceCurrent} disabled={matches.length === 0} className="px-2 py-1 text-xs bg-hover border border-border rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors">
        Remplacer
      </button>
      <button onClick={replaceAll} disabled={matches.length === 0} className="px-2 py-1 text-xs bg-hover border border-border rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors">
        Tout
      </button>
      <button onClick={onClose} className="ml-auto text-muted hover:text-primary transition-colors p-1">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Conversion utils ─────────────────────────────────────────────────────────

function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const children = Array.from(el.childNodes).map(nodeToMd).join("");
    switch (el.tagName) {
      case "H1": return `# ${children}\n\n`;
      case "H2": return `## ${children}\n\n`;
      case "H3": return `### ${children}\n\n`;
      case "H4": return `#### ${children}\n\n`;
      case "P": return children ? `${children}\n\n` : "";
      case "STRONG": case "B": return `**${children}**`;
      case "EM": case "I": return `*${children}*`;
      case "U": return `__${children}__`;
      case "CODE": return `\`${children}\``;
      case "PRE": return `\`\`\`\n${children.replace(/`/g, "")}\n\`\`\`\n\n`;
      case "BLOCKQUOTE": return `> ${children.trim()}\n\n`;
      case "UL": return `${children}\n`;
      case "OL": return `${children}\n`;
      case "LI": {
        const parent = el.parentElement?.tagName;
        if (parent === "OL") {
          const idx = Array.from(el.parentElement!.children).indexOf(el) + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case "BR": return "\n";
      case "HR": return "---\n\n";
      case "MARK": return `==${children}==`;
      default: return children;
    }
  }

  return nodeToMd(div).trim();
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      result.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      i++;
      continue;
    }

    if (line.startsWith("# ")) { result.push(`<h1>${inlineMd(line.slice(2))}</h1>`); i++; continue; }
    if (line.startsWith("## ")) { result.push(`<h2>${inlineMd(line.slice(3))}</h2>`); i++; continue; }
    if (line.startsWith("### ")) { result.push(`<h3>${inlineMd(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith("#### ")) { result.push(`<h4>${inlineMd(line.slice(5))}</h4>`); i++; continue; }
    if (line.startsWith("---")) { result.push("<hr>"); i++; continue; }

    if (line.startsWith("> ")) {
      result.push(`<blockquote><p>${inlineMd(line.slice(2))}</p></blockquote>`);
      i++;
      continue;
    }

    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(`<li><p>${inlineMd(lines[i].slice(2))}</p></li>`);
        i++;
      }
      result.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(`<li><p>${inlineMd(lines[i].replace(/^\d+\. /, ""))}</p></li>`);
        i++;
      }
      result.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    result.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }

  return result.join("");
}

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/__(.*?)__/g, "<u>$1</u>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(title: string) {
  return title.replace(/[^a-zA-Z0-9\-_àâäéèêëîïôùûüçœ ]/g, "").trim() || "note";
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export default function Editor() {
  const {
    activeNote,
    notes,
    updateNote,
    renameNote,
    createNote,
    selectNote,
    isSaving,
    showAiPanel,
    showVersionPanel,
    toggleAiPanel,
    toggleVersionPanel,
    loadVersions,
    saveMode,
    focusMode,
    toggleFocusMode,
    settings,
  } = useStore();

  const [localTitle, setLocalTitle] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Wikilink hover preview
  const [wikiPreview, setWikiPreview] = useState<{ x: number; y: number; title: string; snippet: string } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  // Slash command state (also backed by refs for stable closures)
  const [slashMenu, _setSlashMenu] = useState<{
    x: number; y: number; query: string; from: number;
  } | null>(null);
  const [slashIdx, _setSlashIdx] = useState(0);
  const slashMenuRef = useRef<typeof slashMenu>(null);
  const slashIdxRef = useRef(0);

  // Wikilink autocomplete state (same dual state+ref pattern)
  const [wikiMenu, _setWikiMenu] = useState<{
    x: number; y: number; query: string; from: number;
  } | null>(null);
  const [wikiIdx, _setWikiIdx] = useState(0);
  const wikiMenuRef = useRef<typeof wikiMenu>(null);
  const wikiIdxRef = useRef(0);

  const setWikiMenu = (v: typeof wikiMenu) => { wikiMenuRef.current = v; _setWikiMenu(v); };
  const setWikiIdx = (v: number | ((p: number) => number)) => {
    const next = typeof v === "function" ? v(wikiIdxRef.current) : v;
    wikiIdxRef.current = next;
    _setWikiIdx(next);
  };

  const setSlashMenu = (v: typeof slashMenu) => {
    slashMenuRef.current = v;
    _setSlashMenu(v);
  };
  const setSlashIdx = (v: number | ((p: number) => number)) => {
    const next = typeof v === "function" ? v(slashIdxRef.current) : v;
    slashIdxRef.current = next;
    _setSlashIdx(next);
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef<string>("");
  const importRef = useRef<HTMLInputElement>(null);
  const saveNowRef = useRef<(() => void) | null>(null);
  const saveModeRef = useRef(saveMode);
  const notesRef = useRef(notes);
  useEffect(() => { saveModeRef.current = saveMode; }, [saveMode]);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const editor = useEditor({
    editorProps: {
      handleDrop: (view, event) => {
        // Detect note drag from sidebar → insert wikilink
        const plain = event.dataTransfer?.getData("text/plain") ?? "";
        if (plain.startsWith("note:")) {
          const noteId = plain.slice(5);
          const note = notesRef.current.find((n) => n.id === noteId);
          if (note) {
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (pos) {
              const tr = view.state.tr.insertText(`[[${note.title}]]`, pos.pos);
              view.dispatch(tr);
            }
          }
          return true;
        }

        // Image file drop
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (!file.type.startsWith("image/")) return false;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src });
          const tr = view.state.tr.replaceSelectionWith(node);
          view.dispatch(tr);
        };
        reader.readAsDataURL(file);
        return true;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              const { schema } = view.state;
              const node = schema.nodes.image.create({ src });
              const tr = view.state.tr.replaceSelectionWith(node);
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Commence à écrire… ou tape / pour insérer un élément",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "note-link" } }),
      CodeBlockLowlight.configure({ lowlight }),
      PostIt,
      Wikilink,
      Reminder,
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (!activeNote) return;
      const html = editor.getHTML();
      if (html === lastSavedContent.current) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);

      const delay = saveModeRef.current === "manual" ? null
        : saveModeRef.current === "auto" ? 1500 : 5000;
      if (delay === null) return;

      saveTimer.current = setTimeout(() => {
        updateNote(
          activeNote.id,
          localTitle || activeNote.title,
          html,
          activeNote.tags,
          activeNote.folder
        );
        lastSavedContent.current = html;
      }, delay);
    },
  });

  // ─── Slash command detection ───────────────────────────────────────────────

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const { state } = editor;
      const { selection } = state;
      const { from, empty } = selection;
      if (!empty) { setSlashMenu(null); setWikiMenu(null); return; }

      const nodeType = selection.$from.parent.type.name;
      if (["codeBlock", "code"].includes(nodeType)) { setSlashMenu(null); setWikiMenu(null); return; }

      try {
        const $from = state.selection.$from;
        const nodeStart = $from.before($from.depth) + 1;
        const textBefore = state.doc.textBetween(nodeStart, from);
        const slashMatch = /\/(\w*)$/.exec(textBefore);
        if (slashMatch) {
          const coords = editor.view.coordsAtPos(from);
          setSlashMenu({
            x: coords.left,
            y: coords.bottom + 6,
            query: slashMatch[1],
            from: from - slashMatch[0].length,
          });
          setSlashIdx(0);
          setWikiMenu(null);
        } else {
          setSlashMenu(null);
          const wikiMatch = /\[\[([^\]]*)$/.exec(textBefore);
          if (wikiMatch) {
            const coords = editor.view.coordsAtPos(from);
            setWikiMenu({
              x: coords.left,
              y: coords.bottom + 6,
              query: wikiMatch[1],
              from: from - wikiMatch[0].length,
            });
            setWikiIdx(0);
          } else {
            setWikiMenu(null);
          }
        }
      } catch {
        setSlashMenu(null);
        setWikiMenu(null);
      }
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  const applySlash = useCallback((item: SlashItem) => {
    if (!editor || !slashMenuRef.current) return;
    const deleteFrom = slashMenuRef.current.from;
    const deleteTo = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from: deleteFrom, to: deleteTo }).run();
    item.apply(editor);
    setSlashMenu(null);
  }, [editor]);

  const applyWikilink = useCallback((note: NoteMetadata) => {
    if (!editor || !wikiMenuRef.current) return;
    const deleteFrom = wikiMenuRef.current.from;
    const deleteTo = editor.state.selection.from;
    editor.chain().focus()
      .deleteRange({ from: deleteFrom, to: deleteTo })
      .insertContent(`[[${note.title}]]`)
      .run();
    setWikiMenu(null);
  }, [editor]);

  // ─── Word count ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText();
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    };
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor]);

  // ─── Load note content ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!editor || !activeNote) return;
    if (activeNote.content !== lastSavedContent.current) {
      editor.commands.setContent(activeNote.content || "");
      lastSavedContent.current = activeNote.content;
    }
    setLocalTitle(activeNote.title);
    // Recalculate word count on note switch
    const text = editor.getText();
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  }, [activeNote?.id, activeNote?.updated_at]);

  // ─── Global keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Slash menu keyboard nav
      if (slashMenuRef.current) {
        const filtered = filterSlashItems(slashMenuRef.current.query);
        if (e.key === "Escape") { setSlashMenu(null); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" && filtered[slashIdxRef.current]) {
          e.preventDefault();
          applySlash(filtered[slashIdxRef.current]);
          return;
        }
      }

      // Wikilink autocomplete keyboard nav
      if (wikiMenuRef.current) {
        if (e.key === "Escape") { setWikiMenu(null); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setWikiIdx((i) => i + 1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setWikiIdx((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter") {
          e.preventDefault();
          const q = wikiMenuRef.current.query;
          const filtered = q.trim()
            ? notes.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
            : notes.slice(0, 8);
          if (filtered[wikiIdxRef.current]) applyWikilink(filtered[wikiIdxRef.current]);
          return;
        }
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S
      if (ctrl && e.key === "s") { e.preventDefault(); saveNow(); }

      // Ctrl+H — find & replace
      if (ctrl && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setShowFindReplace((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [applySlash, applyWikilink, notes]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const title = e.target.value;
      setLocalTitle(title);
      if (!activeNote) return;
      if (titleTimer.current) clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(() => {
        renameNote(activeNote.id, title || "Sans titre");
      }, 600);
    },
    [activeNote, renameNote]
  );

  const saveNow = useCallback(() => {
    if (!editor || !activeNote) return;
    const html = editor.getHTML();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    updateNote(activeNote.id, localTitle || activeNote.title, html, activeNote.tags, activeNote.folder);
    lastSavedContent.current = html;
  }, [editor, activeNote, localTitle, updateNote]);

  useEffect(() => { saveNowRef.current = saveNow; }, [saveNow]);

  // Save on window close
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.onCloseRequested(async (event) => {
        event.preventDefault();
        unlisten?.();
        unlisten = undefined;
        saveNowRef.current?.();
        await new Promise<void>((r) => setTimeout(r, 400));
        win.close();
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, []);

  const handleVersionToggle = () => {
    toggleVersionPanel();
    if (!showVersionPanel && activeNote) {
      loadVersions(activeNote.id);
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportMarkdown = () => {
    if (!editor || !activeNote) return;
    const md = htmlToMarkdown(editor.getHTML());
    downloadFile(md, `${safeFilename(activeNote.title)}.md`, "text/markdown");
    setShowExport(false);
  };

  const exportText = () => {
    if (!editor || !activeNote) return;
    downloadFile(editor.getText(), `${safeFilename(activeNote.title)}.txt`, "text/plain");
    setShowExport(false);
  };

  const exportHtml = () => {
    if (!editor || !activeNote) return;
    downloadFile(editor.getHTML(), `${safeFilename(activeNote.title)}.html`, "text/html");
    setShowExport(false);
  };

  const exportPdf = () => {
    setShowExport(false);
    window.print();
  };

  const copyAsMarkdown = () => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.getHTML());
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = "";

    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase();

    let rawHtml: string;
    if (ext === "md") {
      rawHtml = markdownToHtml(text);
    } else {
      rawHtml = text
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
    }
    const html = DOMPurify.sanitize(rawHtml);

    const titleMatch = text.match(/^#\s+(.+)/m);
    const title = titleMatch
      ? titleMatch[1].trim()
      : file.name.replace(/\.[^.]+$/, "");

    const note = await createNote();
    await updateNote(note.id, title, html, [], note.folder);
    if (editor) editor.commands.setContent(html);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!activeNote) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center h-full text-muted gap-3">
        <div className="text-5xl opacity-20 select-none">✦</div>
        <p className="text-sm">Sélectionne une note ou crée-en une nouvelle</p>
      </div>
    );
  }

  const filteredSlashItems = slashMenu ? filterSlashItems(slashMenu.query) : [];

  // Breadcrumb parts
  const folderParts = activeNote.folder ? activeNote.folder.split("/") : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Note header */}
      <div className="relative flex flex-col px-6 pt-4 pb-2 border-b border-border shrink-0">
        {/* Breadcrumb */}
        {folderParts.length > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            {folderParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted">
                {i > 0 && <span className="opacity-40">/</span>}
                <span>{part}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            placeholder="Sans titre"
            className="flex-1 bg-transparent text-xl font-semibold text-primary placeholder-muted outline-none"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowTemplates(true)}
              title="Templates"
              className="p-1.5 rounded transition-colors text-secondary hover:text-primary hover:bg-hover"
            >
              <LayoutTemplate size={17} />
            </button>
            <button
              onClick={saveNow}
              title="Sauvegarder (Ctrl+S)"
              className={`p-1.5 rounded transition-colors ${
                isSaving ? "text-accent" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              <Save size={17} className={isSaving ? "animate-pulse" : ""} />
            </button>

            {/* Import */}
            <button
              onClick={() => importRef.current?.click()}
              title="Importer un fichier (.md, .txt)"
              className="p-1.5 rounded transition-colors text-secondary hover:text-primary hover:bg-hover"
            >
              <Upload size={17} />
            </button>
            <input ref={importRef} type="file" accept=".md,.txt" className="hidden" onChange={handleImport} />

            {/* Export */}
            <div className="relative">
              <button
                onClick={() => setShowExport((s) => !s)}
                title="Exporter la note"
                className={`p-1.5 rounded transition-colors ${
                  showExport ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                }`}
              >
                <Download size={17} />
              </button>
              {showExport && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-panel border border-border rounded-lg shadow-xl py-1 min-w-44">
                    <button onClick={exportMarkdown} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      Exporter en Markdown
                    </button>
                    <button onClick={exportText} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      Exporter en texte brut
                    </button>
                    <button onClick={exportHtml} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      Exporter en HTML
                    </button>
                    <button onClick={exportPdf} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      Imprimer / PDF
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Copy as Markdown */}
            <button
              onClick={copyAsMarkdown}
              title={copied ? "Copié !" : "Copier en Markdown"}
              className={`p-1.5 rounded transition-colors ${
                copied ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              {copied ? <Check size={17} /> : <Clipboard size={17} />}
            </button>

            <button
              onClick={() => setShowBacklinks((s) => !s)}
              title="Liens & backlinks"
              className={`p-1.5 rounded transition-colors ${
                showBacklinks ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              <Link2 size={17} />
            </button>
            <button
              onClick={handleVersionToggle}
              title="Historique des versions (Ctrl+Shift+H)"
              className={`p-1.5 rounded transition-colors ${
                showVersionPanel ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              <Clock size={17} />
            </button>
            {/* Focus mode toggle */}
            <button
              onClick={toggleFocusMode}
              title={focusMode ? "Quitter le mode focus" : "Mode focus (masque la sidebar)"}
              className={`p-1.5 rounded transition-colors ${
                focusMode ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              {focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <VoiceRecorder
              onInsert={(text) => {
                if (editor) {
                  editor.chain().focus().insertContent(" " + text).run();
                }
              }}
            />
            <button
              onClick={toggleAiPanel}
              title="Panneau IA (Ctrl+Shift+A)"
              className={`p-1.5 rounded transition-colors ${
                showAiPanel ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
              }`}
            >
              <BrainCircuit size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar — hidden in focus mode */}
      {!focusMode && <Toolbar editor={editor} />}

      {/* Find & replace bar */}
      {showFindReplace && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto px-8 py-5"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".ProseMirror") && editor) {
              editor.commands.focus("end");
            }
            // Wikilink click
            const wl = (target as HTMLElement).closest("[data-wikilink]") as HTMLElement | null;
            if (wl) {
              const noteId = wl.getAttribute("data-note-id");
              if (noteId) selectNote(noteId);
            }
          }}
          onMouseOver={(e) => {
            const target = e.target as HTMLElement;
            const el = target.closest("[data-wikilink], .wikilink-candidate") as HTMLElement | null;
            if (!el) { setWikiPreview(null); return; }

            const noteTitle = el.getAttribute("data-note-title") || el.getAttribute("data-title") || el.textContent?.replace(/\[\[|\]\]/g, "").trim() || "";
            if (!noteTitle) return;

            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            previewTimerRef.current = setTimeout(async () => {
              const rect = el.getBoundingClientRect();
              let snippet = previewCacheRef.current.get(noteTitle);
              if (!snippet) {
                const found = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase());
                if (found) {
                  try {
                    const { invoke: inv } = await import("@tauri-apps/api/core");
                    const note = await inv<{ content: string }>("get_note", { id: found.id });
                    const div = document.createElement("div");
                    div.innerHTML = note.content;
                    snippet = (div.textContent ?? "").trim().slice(0, 200) || "(note vide)";
                  } catch {
                    snippet = "(impossible de charger)";
                  }
                } else {
                  snippet = "(note introuvable)";
                }
                previewCacheRef.current.set(noteTitle, snippet ?? "");
              }
              setWikiPreview({ x: rect.left, y: rect.bottom + 6, title: noteTitle, snippet: snippet ?? "" });
            }, 300);
          }}
          onMouseOut={(e) => {
            const target = e.relatedTarget as HTMLElement | null;
            if (target?.closest("[data-wikilink], .wikilink-candidate")) return;
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            setWikiPreview(null);
          }}
        >
          <div
            className="mx-auto min-h-full pb-24"
            style={{
              maxWidth: { narrow: "600px", normal: "720px", wide: "960px", full: "none" }[settings.editor_max_width ?? "normal"] ?? "720px",
              fontSize: `${settings.editor_font_size ?? 15}px`,
              fontFamily: settings.editor_font_family === "serif"
                ? "Georgia, 'Times New Roman', serif"
                : settings.editor_font_family === "mono"
                ? "Menlo, Consolas, 'Courier New', monospace"
                : "var(--font-sans, system-ui, sans-serif)",
            }}
          >
            <EditorContent editor={editor} className="min-h-full" />
          </div>
        </div>
        {showBacklinks && (
          <div className="w-64 border-l border-border shrink-0 overflow-hidden">
            <BacklinksPanel onClose={() => setShowBacklinks(false)} />
          </div>
        )}
      </div>

      {/* Wikilink hover preview */}
      {wikiPreview && (
        <div
          className="fixed z-[400] bg-panel border border-border rounded-xl shadow-2xl p-3 w-72 pointer-events-none"
          style={{ left: Math.min(wikiPreview.x, window.innerWidth - 300), top: wikiPreview.y }}
        >
          <p className="text-xs font-semibold text-primary mb-1 truncate">[[{wikiPreview.title}]]</p>
          <p className="text-[11px] text-secondary leading-relaxed line-clamp-4">{wikiPreview.snippet}</p>
        </div>
      )}

      {/* Tags row */}
      <TagsBar noteId={activeNote.id} tags={activeNote.tags} folder={activeNote.folder} />

      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-1 border-t border-border bg-sidebar shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Save status */}
          <span className={`text-[10px] transition-colors ${isSaving ? "text-accent" : "text-muted/50"}`}>
            {isSaving ? "Sauvegarde…" : saveMode === "manual" ? "Manuel" : "Sauvegardé"}
          </span>
          {/* Provider */}
          <span className="text-[10px] text-muted/40 capitalize">{settings.ai_provider}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted">
            {wordCount} mot{wordCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-muted/60">
            {Math.max(1, Math.ceil(wordCount / 200))} min
          </span>
          <button
            onClick={() => setShowFindReplace((s) => !s)}
            title="Chercher & remplacer (Ctrl+H)"
            aria-label="Chercher et remplacer"
            className={`transition-colors ${showFindReplace ? "text-accent" : "text-muted/50 hover:text-muted"}`}
          >
            <Search size={11} />
          </button>
        </div>
      </div>

      {showTemplates && (
        <TemplatesPanel
          onClose={() => setShowTemplates(false)}
          onApply={(content, title) => {
            if (editor) editor.commands.setContent(content);
            if (title !== "Note vide") {
              setLocalTitle(title);
              if (activeNote) renameNote(activeNote.id, title);
            }
            setShowTemplates(false);
          }}
        />
      )}

      {/* Slash command menu */}
      {slashMenu && filteredSlashItems.length >= 0 && (
        <SlashMenu
          items={filteredSlashItems}
          pos={{ x: slashMenu.x, y: slashMenu.y }}
          selectedIdx={Math.min(slashIdx, Math.max(0, filteredSlashItems.length - 1))}
          onSelect={applySlash}
        />
      )}

      {/* Wikilink autocomplete menu */}
      {wikiMenu && (
        <WikilinkMenu
          notes={notes}
          query={wikiMenu.query}
          pos={{ x: wikiMenu.x, y: wikiMenu.y }}
          selectedIdx={wikiIdx}
          onSelect={applyWikilink}
        />
      )}
    </div>
  );
}

// ─── Tags bar ────────────────────────────────────────────────────────────────

import React from "react";

function TagsBar({
  noteId,
  tags,
  folder,
}: {
  noteId: string;
  tags: string[];
  folder: string | null;
}) {
  const { activeNote, updateNote } = useStore();
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (!tag || tags.includes(tag) || !activeNote) return;
    const newTags = [...tags, tag];
    updateNote(noteId, activeNote.title, activeNote.content, newTags, folder);
    setInput("");
  };

  const removeTag = (tag: string) => {
    if (!activeNote) return;
    const newTags = tags.filter((t) => t !== tag);
    updateNote(noteId, activeNote.title, activeNote.content, newTags, folder);
  };

  return (
    <div className="flex items-center gap-2 px-6 py-2 border-t border-border bg-sidebar shrink-0 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 text-xs px-2 py-0.5 bg-hover rounded-full text-secondary"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="text-muted hover:text-primary transition-colors">
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="+ ajouter un tag"
        className="bg-transparent text-xs text-muted placeholder-muted outline-none min-w-24"
      />
    </div>
  );
}
