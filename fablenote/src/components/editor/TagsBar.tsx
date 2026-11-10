import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { relatedNotes, suggestTags } from "../../lib/related";

// Tags sous la note, avec les tags suggérés.

// ─── Tags bar ────────────────────────────────────────────────────────────────


export function TagsBar({
  noteId,
  tags,
  folder,
}: {
  noteId: string;
  tags: string[];
  folder: string | null;
}) {
  const { activeNote, updateNote, setSearchQuery, notes } = useStore();
  const [input, setInput] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const t = useT();

  // Tags suggérés : ceux des notes proches et ceux déjà utilisés dont le nom apparaît dans
  // la note. Recalculés après chaque enregistrement, par les mots seulement (instantané).
  const updatedAt = activeNote?.updated_at;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const st = useStore.getState();
      const note = st.activeNote;
      if (!note || note.id !== noteId) return;
      relatedNotes(noteId, 6, false)
        .then((rel) => {
          if (cancelled) return;
          const text = `${note.title} ${note.content.replace(/<[^>]+>/g, " ")}`;
          setSuggested(suggestTags(text, note.tags, rel, st.notes));
        })
        .catch(() => { if (!cancelled) setSuggested([]); });
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [noteId, updatedAt, notes.length]);

  const addTag = (raw = input) => {
    const tag = raw.trim();
    if (!tag || tags.includes(tag) || !activeNote) return;
    const newTags = [...tags, tag];
    updateNote(noteId, activeNote.title, activeNote.content, newTags, folder);
    setSuggested((s) => s.filter((x) => x !== tag));
    if (raw === input) setInput("");
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
          <button
            onClick={() => setSearchQuery(`#${tag}`)}
            className="hover:text-accent transition-colors"
            aria-label={t("Filtrer les notes par le tag {tag}", { tag })}
          >
            {tag}
          </button>
          <button onClick={() => removeTag(tag)} aria-label={t("Retirer le tag {tag}", { tag })} className="text-muted hover:text-primary transition-colors">
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
            addTag(input);
          }
        }}
        placeholder={t("+ ajouter un tag")}
        className="bg-transparent text-xs text-muted placeholder-muted outline-none min-w-24"
      />
      {suggested.length > 0 && (
        <div className="flex items-center gap-1.5 ml-auto" aria-label={t("Tags suggérés")}>
          <span className="text-[10px] text-muted">{t("Suggestions :")}</span>
          {suggested.map((tag) => (
            <button
              key={tag}
              onClick={() => addTag(tag)}
              title={t("Ajouter le tag {tag}", { tag })}
              className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted hover:text-accent hover:border-accent transition-colors"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
