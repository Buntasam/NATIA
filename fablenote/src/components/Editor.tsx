import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { PostIt } from "../extensions/PostIt";
import { BrainCircuit, Clock, Download, Save, Upload } from "lucide-react";
import { useStore } from "../store";
import Toolbar from "./Toolbar";

const AUTOSAVE_DELAY = 1500;

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
    updateNote,
    renameNote,
    createNote,
    isSaving,
    showAiPanel,
    showVersionPanel,
    toggleAiPanel,
    toggleVersionPanel,
    loadVersions,
    saveMode,
  } = useStore();

  const [localTitle, setLocalTitle] = useState("");
  const [showExport, setShowExport] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef<string>("");
  const importRef = useRef<HTMLInputElement>(null);
  const saveNowRef = useRef<(() => void) | null>(null);
  const saveModeRef = useRef(saveMode);
  useEffect(() => { saveModeRef.current = saveMode; }, [saveMode]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Commence à écrire ta note…",
      }),
      PostIt,
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

  useEffect(() => {
    if (!editor || !activeNote) return;
    if (activeNote.content !== lastSavedContent.current) {
      editor.commands.setContent(activeNote.content || "");
      lastSavedContent.current = activeNote.content;
    }
    setLocalTitle(activeNote.title);
  }, [activeNote?.id, activeNote?.updated_at]);

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Keep ref up-to-date for the close handler
  useEffect(() => { saveNowRef.current = saveNow; }, [saveNow]);

  // Save on window close — remove listener BEFORE calling win.close() to avoid re-firing
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

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = "";

    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase();

    let html: string;
    if (ext === "md") {
      html = markdownToHtml(text);
    } else {
      // .txt : chaque ligne devient un paragraphe
      html = text
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
    }

    // Extraire le titre depuis le premier H1 ou le nom de fichier
    const titleMatch = text.match(/^#\s+(.+)/m);
    const title = titleMatch
      ? titleMatch[1].trim()
      : file.name.replace(/\.[^.]+$/, "");

    // Créer une nouvelle note avec ce contenu
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Note header */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-2 border-b border-border shrink-0">
        <input
          type="text"
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Sans titre"
          className="flex-1 bg-transparent text-xl font-semibold text-primary placeholder-muted outline-none"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={saveNow}
            title="Sauvegarder (Ctrl+S)"
            className={`p-1.5 rounded transition-colors ${
              isSaving
                ? "text-accent"
                : "text-secondary hover:text-primary hover:bg-hover"
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
          <input
            ref={importRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={handleImport}
          />

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
                  <button
                    onClick={exportMarkdown}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  >
                    Exporter en Markdown
                  </button>
                  <button
                    onClick={exportText}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  >
                    Exporter en texte brut
                  </button>
                  <button
                    onClick={exportHtml}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                  >
                    Exporter en HTML
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={toggleAiPanel}
            title="Panneau IA (Ctrl+Shift+A)"
            className={`p-1.5 rounded transition-colors ${
              showAiPanel
                ? "text-accent bg-accent/10"
                : "text-secondary hover:text-primary hover:bg-hover"
            }`}
          >
            <BrainCircuit size={17} />
          </button>
          <button
            onClick={handleVersionToggle}
            title="Historique des versions (Ctrl+Shift+H)"
            className={`p-1.5 rounded transition-colors ${
              showVersionPanel
                ? "text-accent bg-accent/10"
                : "text-secondary hover:text-primary hover:bg-hover"
            }`}
          >
            <Clock size={17} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar editor={editor} />

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto px-8 py-5"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".ProseMirror") && editor) {
              editor.commands.focus("end");
            }
          }}
        >
          <div className="max-w-2xl mx-auto min-h-full pb-24">
            <EditorContent editor={editor} className="min-h-full" />
          </div>
        </div>
      </div>

      {/* Tags row */}
      <TagsBar noteId={activeNote.id} tags={activeNote.tags} folder={activeNote.folder} />
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
          <button
            onClick={() => removeTag(tag)}
            className="text-muted hover:text-primary transition-colors"
          >
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
