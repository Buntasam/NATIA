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
import { createLowlight } from "lowlight";
import { CODE_LANGUAGES } from "../lib/codeLanguages";
import { PostIt } from "../extensions/PostIt";
import { Wikilink } from "../extensions/Wikilink";
import { Attachment } from "../extensions/Attachment";
import { Reminder } from "../extensions/Reminder";
import {
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clipboard,
  FileInput,
  FileOutput,
  LayoutTemplate,
  Link2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import TemplatesPanel from "./TemplatesPanel";
import BacklinksPanel from "./BacklinksPanel";
import ShareDialog from "./ShareDialog";
import { SHARE_EVENT } from "./CommandPalette";
import Tip from "./Tooltip";
import { registerSaveNow } from "./CloseOverlay";
import { markdownToHtml } from "../lib/markdown";
import { useStore, isNewNoteTitle } from "../store";
import { imageToDataUrl } from "../lib/imageToDataUrl";
import { invoke } from "@tauri-apps/api/core";
import { tr, trError, useLocale, useT } from "../i18n";
import { attachFiles } from "../lib/attachments";
import Toolbar from "./Toolbar";
import VoiceRecorder from "./VoiceRecorder";
import { NoteMetadata } from "../types";
import React from "react";
import { SlashItem, SlashMenu, filterSlashItems } from "./editor/SlashMenu";
import { WikilinkMenu } from "./editor/WikilinkMenu";
import { FindReplaceBar } from "./editor/FindReplaceBar";
import { TagsBar } from "./editor/TagsBar";
import { escapeHtml, htmlToMarkdown, safeFilename, saveExport } from "../lib/noteExport";
const lowlight = createLowlight(CODE_LANGUAGES);

const AUTOSAVE_DELAY = 1500;

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
    goBack,
    goForward,
    navBackIds,
    navForwardIds,
  } = useStore();

  const [localTitle, setLocalTitle] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dropError, setDropError] = useState("");
  const [showShare, setShowShare] = useState(false);
  // Commande « Partager la note » de la palette.
  useEffect(() => {
    const open = () => setShowShare(true);
    window.addEventListener(SHARE_EVENT, open);
    return () => window.removeEventListener(SHARE_EVENT, open);
  }, []);
  useEffect(() => {
    if (!dropError) return;
    const id = setTimeout(() => setDropError(""), 6000);
    return () => clearTimeout(id);
  }, [dropError]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const wasSavingRef = useRef(false);

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
  const titleFocused = useRef(false);
  const t = useT();
  const loc = useLocale();
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

        // Fichiers déposés : les images s'affichent dans la note, les autres deviennent des fichiers joints.
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        const images = files.filter((f) => f.type.startsWith("image/"));
        const others = files.filter((f) => !f.type.startsWith("image/"));
        images.forEach((file) => {
          imageToDataUrl(file).then((src) => {
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.insert(Math.min(at, view.state.doc.content.size), node));
          }).catch((err) => console.error("Image :", err));
        });
        const noteId = useStore.getState().activeNote?.id;
        if (others.length && noteId) {
          attachFiles(noteId, others).then((added) => {
            const nodes = added.flatMap((a) => [
              view.state.schema.nodes.attachment.create({ id: a.id, name: a.name, size: a.size }),
              view.state.schema.text(" "),
            ]);
            const pos = Math.min(at, view.state.doc.content.size);
            // Hors d'un paragraphe (entre deux blocs), on en crée un pour accueillir les pastilles.
            const $pos = view.state.doc.resolve(pos);
            const tr = $pos.parent.inlineContent
              ? view.state.tr.insert(pos, nodes)
              : view.state.tr.insert(pos, view.state.schema.nodes.paragraph.create(null, nodes));
            view.dispatch(tr);
          }).catch((err) => setDropError(trError(err)));
        }
        return true;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            imageToDataUrl(file).then((src) => {
              const node = view.state.schema.nodes.image.create({ src });
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            }).catch((err) => console.error("Image :", err));
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
        placeholder: () => tr("Commence à écrire… ou tape / pour insérer un élément"),
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
      Attachment,
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (!activeNote) return;
      const html = editor.getHTML();
      if (html === lastSavedContent.current) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);

      const delay = saveModeRef.current === "manual" ? null
        : saveModeRef.current === "auto" ? AUTOSAVE_DELAY : 5000;
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

  // ─── Horodatage de la dernière sauvegarde ──────────────────────────────────

  useEffect(() => {
    if (wasSavingRef.current && !isSaving) setLastSavedAt(new Date());
    wasSavingRef.current = isSaving;
  }, [isSaving]);

  // ─── Insertion depuis la conversation IA ───────────────────────────────────

  useEffect(() => {
    if (!editor) return;
    const onInsert = (e: Event) => {
      const html = (e as CustomEvent<string>).detail;
      if (!html) return;
      editor.chain().focus().insertContent(DOMPurify.sanitize(html)).run();
    };
    window.addEventListener("natia:insert-from-chat", onInsert);
    return () => window.removeEventListener("natia:insert-from-chat", onInsert);
  }, [editor]);

  // ─── Load note content ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!editor || !activeNote) return;
    if (activeNote.content !== lastSavedContent.current) {
      editor.commands.setContent(activeNote.content || "");
      lastSavedContent.current = activeNote.content;
    }
    // Ne pas remettre « Nouvelle note » pendant que l'utilisateur écrit le titre.
    if (!(titleFocused.current && isNewNoteTitle(activeNote.title))) setLocalTitle(activeNote.title);
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

      // Ctrl+F / Ctrl+H — chercher & remplacer dans la note
      // (Ctrl+Shift+F = recherche globale, gérée dans Layout)
      if (ctrl && !e.shiftKey && (e.key === "f" || e.key === "h")) {
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
        titleTimer.current = null;
        renameNote(activeNote.id, title || tr("Sans titre"));
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

  useEffect(() => {
    saveNowRef.current = saveNow;
    registerSaveNow(saveNow);
    return () => { registerSaveNow(null); };
  }, [saveNow]);

  const handleVersionToggle = () => {
    toggleVersionPanel();
    if (!showVersionPanel && activeNote) {
      loadVersions(activeNote.id);
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportMarkdown = () => {
    if (!editor || !activeNote) return;
    setShowMoreMenu(false);
    const title = localTitle || activeNote.title;
    saveExport(`# ${title}

${htmlToMarkdown(editor.getHTML())}`, title, "md").catch((e) => console.error("Export :", e));
  };

  const exportText = () => {
    if (!editor || !activeNote) return;
    setShowMoreMenu(false);
    const title = localTitle || activeNote.title;
    saveExport(`${title}

${editor.getText()}`, title, "txt").catch((e) => console.error("Export :", e));
  };

  const exportHtml = () => {
    if (!editor || !activeNote) return;
    setShowMoreMenu(false);
    const title = escapeHtml(localTitle || activeNote.title);
    const page = `<!DOCTYPE html>
<html lang="${document.documentElement.lang || "fr"}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}img{max-width:100%}</style>
</head>
<body>
<h1>${title}</h1>
${editor.getHTML()}
</body>
</html>
`;
    saveExport(page, localTitle || activeNote.title, "html").catch((e) => console.error("Export :", e));
  };

  const exportPdf = () => {
    if (!editor || !activeNote) return;
    setShowMoreMenu(false);

    let printEl = document.getElementById("natia-print");
    if (!printEl) {
      printEl = document.createElement("div");
      printEl.id = "natia-print";
      document.body.appendChild(printEl);
    }

    const h1 = document.createElement("h1");
    h1.className = "print-title";
    h1.textContent = localTitle || activeNote.title || t("Note");

    const contentDiv = document.createElement("div");
    contentDiv.innerHTML = editor.getHTML();

    printEl.innerHTML = "";
    printEl.appendChild(h1);
    printEl.appendChild(contentDiv);

    window.print();
    setTimeout(() => { if (printEl) printEl.innerHTML = ""; }, 400);
  };

  const copyAsMarkdown = () => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.getHTML());
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setShowMoreMenu(false); }, 900);
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
        <p className="text-sm">{t("Sélectionne une note ou crée-en une nouvelle")}</p>
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
        {/* Breadcrumb — cliquable : révèle le dossier dans la sidebar */}
        {folderParts.length > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            {folderParts.map((part, i) => {
              const path = folderParts.slice(0, i + 1).join("/");
              return (
                <span key={i} className="flex items-center gap-1 text-[11px] text-muted">
                  {i > 0 && <span className="opacity-40">/</span>}
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("natia:reveal-folder", { detail: path }))}
                    className="hover:text-accent transition-colors"
                    aria-label={t("Afficher le dossier {path} dans la barre latérale", { path })}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Navigation historique */}
          <div className="flex items-center shrink-0 -ml-2">
            <Tip label={t("Note précédente")} shortcut="Alt+←">
              <button
                onClick={goBack}
                disabled={navBackIds.length === 0}
                aria-label={t("Note précédente")}
                className="p-1 rounded transition-colors text-muted hover:text-primary hover:bg-hover disabled:opacity-25 disabled:pointer-events-none"
              >
                <ChevronLeft size={16} />
              </button>
            </Tip>
            <Tip label={t("Note suivante")} shortcut="Alt+→">
              <button
                onClick={goForward}
                disabled={navForwardIds.length === 0}
                aria-label={t("Note suivante")}
                className="p-1 rounded transition-colors text-muted hover:text-primary hover:bg-hover disabled:opacity-25 disabled:pointer-events-none"
              >
                <ChevronRight size={16} />
              </button>
            </Tip>
          </div>

          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            // Titre par défaut d'une nouvelle note : effacé au clic pour écrire directement.
            onFocus={() => { titleFocused.current = true; if (isNewNoteTitle(localTitle)) setLocalTitle(""); }}
            onBlur={() => { titleFocused.current = false; if (!localTitle && !titleTimer.current && activeNote) setLocalTitle(activeNote.title); }}
            placeholder={activeNote && isNewNoteTitle(activeNote.title) ? activeNote.title : t("Sans titre")}
            aria-label={t("Titre de la note")}
            className="flex-1 bg-transparent text-xl font-semibold text-primary placeholder-muted outline-none"
          />
          <div className="flex items-center gap-1 shrink-0">
            {saveMode === "manual" && (
              <Tip label={t("Sauvegarder")} shortcut="Ctrl+S">
                <button
                  onClick={saveNow}
                  aria-label={t("Sauvegarder")}
                  className={`p-1.5 rounded transition-colors ${
                    isSaving ? "text-accent" : "text-secondary hover:text-primary hover:bg-hover"
                  }`}
                >
                  <Save size={17} className={isSaving ? "animate-pulse" : ""} />
                </button>
              </Tip>
            )}
            <Tip label={t("Liens & notes liées")}>
              <button
                onClick={() => setShowBacklinks((s) => !s)}
                aria-label={t("Liens et backlinks")}
                className={`p-1.5 rounded transition-colors ${
                  showBacklinks ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                }`}
              >
                <Link2 size={17} />
              </button>
            </Tip>
            <Tip label={t("Historique des versions")} shortcut="Ctrl+Shift+H">
              <button
                onClick={handleVersionToggle}
                aria-label={t("Historique des versions")}
                className={`p-1.5 rounded transition-colors ${
                  showVersionPanel ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                }`}
              >
                <Clock size={17} />
              </button>
            </Tip>
            <Tip label={focusMode ? t("Quitter le mode focus") : t("Mode focus (plein écran)")} shortcut="F11">
              <button
                onClick={toggleFocusMode}
                aria-label={focusMode ? t("Quitter le mode focus") : t("Mode focus")}
                className={`p-1.5 rounded transition-colors ${
                  focusMode ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                }`}
              >
                {focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </Tip>
            <VoiceRecorder
              onInsert={(text) => {
                if (editor) {
                  editor.chain().focus().insertContent(" " + text).run();
                }
              }}
            />
            <Tip label={t("Panneau IA")} shortcut="Ctrl+Shift+A">
              <button
                onClick={toggleAiPanel}
                aria-label={t("Panneau IA")}
                className={`p-1.5 rounded transition-colors ${
                  showAiPanel ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                }`}
              >
                <BrainCircuit size={17} />
              </button>
            </Tip>

            {/* Menu ⋯ : actions occasionnelles */}
            <div className="relative">
              <Tip label={t("Plus d'actions")}>
                <button
                  onClick={() => setShowMoreMenu((s) => !s)}
                  aria-label={t("Plus d'actions")}
                  className={`p-1.5 rounded transition-colors ${
                    showMoreMenu ? "text-accent bg-accent/10" : "text-secondary hover:text-primary hover:bg-hover"
                  }`}
                >
                  <MoreHorizontal size={17} />
                </button>
              </Tip>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-panel border border-border rounded-lg shadow-xl py-1 min-w-52">
                    <button
                      onClick={() => { setShowTemplates(true); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                    >
                      <LayoutTemplate size={14} className="text-muted" />
                      {t("Modèles")}
                    </button>
                    <button
                      onClick={() => { importRef.current?.click(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                    >
                      <FileInput size={14} className="text-muted" />
                      {t("Importer (.md, .txt)")}
                    </button>
                    <button
                      onClick={copyAsMarkdown}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                    >
                      {copied ? <Check size={14} className="text-accent" /> : <Clipboard size={14} className="text-muted" />}
                      {copied ? t("Copié !") : t("Copier en Markdown")}
                    </button>
                    <div className="border-t border-border my-1" />
                    <button onClick={exportMarkdown} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      <FileOutput size={14} className="text-muted" />
                      {t("Exporter en Markdown")}
                    </button>
                    <button onClick={exportText} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      <FileOutput size={14} className="text-muted" />
                      {t("Exporter en texte brut")}
                    </button>
                    <button onClick={exportHtml} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      <FileOutput size={14} className="text-muted" />
                      {t("Exporter en HTML")}
                    </button>
                    <button onClick={exportPdf} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">
                      <FileOutput size={14} className="text-muted" />
                      {t("Exporter en PDF (impression)")}
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowShare(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
                    >
                      <ShieldCheck size={14} className="text-muted" />
                      {t("Partager (protégé par mot de passe)…")}
                    </button>
                  </div>
                </>
              )}
            </div>
            <input ref={importRef} type="file" accept=".md,.txt" className="hidden" onChange={handleImport} />
          </div>
        </div>
      </div>

      {showShare && editor && activeNote && (
        <ShareDialog
          title={localTitle || activeNote.title}
          html={editor.getHTML()}
          onClose={() => setShowShare(false)}
        />
      )}

      {dropError && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-3 py-2 rounded-lg border border-red-500/40 bg-panel text-xs text-red-500 shadow-lg">
          {dropError}
        </div>
      )}

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
            // Fichier joint : ouvert avec son application
            const att = (target as HTMLElement).closest("[data-attachment-id]") as HTMLElement | null;
            if (att) {
              const id = att.getAttribute("data-attachment-id");
              if (id) invoke("open_attachment", { id }).catch((err) => console.error("open_attachment:", err));
              return;
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
                    snippet = (div.textContent ?? "").trim().slice(0, 200) || tr("(note vide)");
                  } catch {
                    snippet = tr("(impossible de charger)");
                  }
                } else {
                  snippet = tr("(note introuvable)");
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
          {/* Indicateur de sauvegarde */}
          <span className={`text-[11px] transition-colors ${isSaving ? "text-accent" : "text-muted/60"}`}>
            {isSaving
              ? t("Enregistrement…")
              : saveMode === "manual"
              ? (lastSavedAt
                  ? t("Manuel — enregistré à {time}", { time: lastSavedAt.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) })
                  : t("Manuel — Ctrl+S pour enregistrer"))
              : lastSavedAt
              ? t("✓ Enregistré à {time}", { time: lastSavedAt.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) })
              : t("✓ Enregistré")}
          </span>
          {/* Provider */}
          <span className="text-[11px] text-muted/40 capitalize">{settings.ai_provider}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted">
            {wordCount === 1 ? t("{n} mot", { n: 1 }) : t("{n} mots", { n: wordCount })}
          </span>
          <span className="text-[11px] text-muted/60">
            {t("{n} min de lecture", { n: Math.max(1, Math.ceil(wordCount / 200)) })}
          </span>
          <Tip label={t("Chercher & remplacer")} shortcut="Ctrl+F" side="top">
            <button
              onClick={() => setShowFindReplace((s) => !s)}
              aria-label={t("Chercher et remplacer")}
              className={`transition-colors ${showFindReplace ? "text-accent" : "text-muted/50 hover:text-muted"}`}
            >
              <Search size={11} />
            </button>
          </Tip>
        </div>
      </div>

      {showTemplates && (
        <TemplatesPanel
          onClose={() => setShowTemplates(false)}
          onApply={(content, title) => {
            if (editor) editor.commands.setContent(content);
            if (title !== tr("Note vide")) {
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

