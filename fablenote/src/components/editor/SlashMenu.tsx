import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import {
  Bell,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  StickyNote,
  Table as TableIcon,
} from "lucide-react";
import { msg, tr, useT } from "../../i18n";
import React from "react";

// Menu « / » de l'éditeur : éléments à insérer.

// ─── Slash command items ──────────────────────────────────────────────────────

export interface SlashItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  keywords: string[];
  apply: (editor: ReturnType<typeof useEditor>) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1", label: msg("Titre 1"), desc: msg("Grand titre de section"), icon: <Heading1 size={14} />,
    keywords: ["titre", "h1", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2", label: msg("Titre 2"), desc: msg("Titre moyen"), icon: <Heading2 size={14} />,
    keywords: ["titre", "h2", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3", label: msg("Titre 3"), desc: msg("Petit titre"), icon: <Heading3 size={14} />,
    keywords: ["titre", "h3", "heading"],
    apply: (e) => e?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "ul", label: msg("Liste à puces"), desc: msg("Liste non ordonnée"), icon: <List size={14} />,
    keywords: ["liste", "ul", "bullet"],
    apply: (e) => e?.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ol", label: msg("Liste numérotée"), desc: msg("Liste ordonnée"), icon: <ListOrdered size={14} />,
    keywords: ["liste", "ol", "numbered"],
    apply: (e) => e?.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "todo", label: msg("Liste de tâches"), desc: msg("Cases à cocher"), icon: <ListChecks size={14} />,
    keywords: ["todo", "tache", "checkbox", "task"],
    apply: (e) => e?.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote", label: msg("Citation"), desc: msg("Bloc de citation"), icon: <Quote size={14} />,
    keywords: ["citation", "quote", "blockquote"],
    apply: (e) => e?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code", label: msg("Bloc de code"), desc: msg("Code avec coloration syntaxique"), icon: <Code size={14} />,
    keywords: ["code", "bloc"],
    apply: (e) => e?.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table", label: msg("Tableau"), desc: msg("Tableau 3×3"), icon: <TableIcon size={14} />,
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
    id: "postit", label: msg("Post-it"), desc: msg("Note adhésive colorée"), icon: <StickyNote size={14} />,
    keywords: ["postit", "post", "note", "adhesive"],
    apply: (e) => e?.chain().focus().insertPostIt().run(),
  },
  {
    id: "reminder", label: msg("Rappel"), desc: msg("Bloc de rappel avec date"), icon: <Bell size={14} />,
    keywords: ["rappel", "reminder", "alarm"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: (e) => (e?.chain().focus() as any)?.insertReminder().run(),
  },
  {
    id: "hr", label: msg("Séparateur"), desc: msg("Ligne horizontale"), icon: <Minus size={14} />,
    keywords: ["separateur", "hr", "ligne", "divider"],
    apply: (e) => e?.chain().focus().setHorizontalRule().run(),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  if (!query) return SLASH_ITEMS;
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      tr(item.label).toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q))
  );
}

// ─── Slash menu component ─────────────────────────────────────────────────────

export function SlashMenu({
  items, pos, selectedIdx, onSelect,
}: {
  items: SlashItem[];
  pos: { x: number; y: number };
  selectedIdx: number;
  onSelect: (item: SlashItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const t = useT();

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
        <p className="px-3 py-2 text-xs text-muted">{t("Aucune commande")}</p>
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
                <p className="text-xs font-medium leading-none mb-0.5">{t(item.label)}</p>
                <p className="text-[11px] text-muted">{t(item.desc)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
