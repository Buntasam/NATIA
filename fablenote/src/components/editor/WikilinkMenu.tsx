import { useEffect, useRef } from "react";
import { Wikilink } from "../../extensions/Wikilink";
import { Link2 } from "lucide-react";
import { NoteMetadata } from "../../types";

// Suggestions de notes en tapant « [[ ».

// ─── Wikilink autocomplete menu ───────────────────────────────────────────────


export function WikilinkMenu({
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
              {note.folder && <p className="text-[11px] text-muted truncate">{note.folder}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
