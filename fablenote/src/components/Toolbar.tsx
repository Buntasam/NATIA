import { useState } from "react";
import { Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  StickyNote,
  Strikethrough,
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

export default function Toolbar({ editor }: { editor: Editor | null }) {
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].hex);
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!editor) return null;

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    editor.chain().focus().toggleHighlight({ color }).run();
    setShowColorPicker(false);
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
            <div
              className="w-3.5 h-1 rounded-full"
              style={{ backgroundColor: highlightColor }}
            />
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
                    outline:
                      hex === highlightColor
                        ? "2px solid #555"
                        : "1px solid rgba(0,0,0,0.18)",
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
    </div>
  );
}

import React from "react";
