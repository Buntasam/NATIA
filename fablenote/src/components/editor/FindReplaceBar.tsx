import { useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import { Search, X } from "lucide-react";
import { useT } from "../../i18n";

// Barre « Chercher / remplacer » (Ctrl+F, Ctrl+H).

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

export function FindReplaceBar({
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
  const t = useT();

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
        placeholder={t("Rechercher…")}
        className="bg-hover border border-border rounded-md px-2 py-1 text-xs text-primary outline-none focus:border-accent/50 w-40"
      />
      <span className="text-[11px] text-muted shrink-0 min-w-10">
        {matches.length > 0 ? `${idx + 1}/${matches.length}` : search ? t("0 résultat") : ""}
      </span>
      <button onClick={() => goTo(idx - 1)} disabled={matches.length === 0} aria-label={t("Résultat précédent")} className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors text-xs">↑</button>
      <button onClick={() => goTo(idx + 1)} disabled={matches.length === 0} aria-label={t("Résultat suivant")} className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors text-xs">↓</button>
      <div className="w-px h-4 bg-border mx-1" />
      <input
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceCurrent(); } if (e.key === "Escape") onClose(); }}
        placeholder={t("Remplacer…")}
        className="bg-hover border border-border rounded-md px-2 py-1 text-xs text-primary outline-none focus:border-accent/50 w-40"
      />
      <button onClick={replaceCurrent} disabled={matches.length === 0} className="px-2 py-1 text-xs bg-hover border border-border rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors">
        {t("Remplacer")}
      </button>
      <button onClick={replaceAll} disabled={matches.length === 0} className="px-2 py-1 text-xs bg-hover border border-border rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors">
        {t("Tout")}
      </button>
      <button onClick={onClose} aria-label={t("Fermer")} className="ml-auto text-muted hover:text-primary transition-colors p-1">
        <X size={13} />
      </button>
    </div>
  );
}
