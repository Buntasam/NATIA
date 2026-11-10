import { useState } from "react";
import { FileText, X } from "lucide-react";
import { useStore } from "../store";
import { useT } from "../i18n";

const TAB_MIME = "application/x-natia-tab";

/**
 * Onglets des notes ouvertes, au-dessus de l'éditeur. Clic du milieu ou × pour fermer,
 * glisser pour réordonner ; Ctrl+Tab, Ctrl+W et Ctrl+1…9 au clavier (Layout.tsx).
 */
export default function NoteTabs() {
  const t = useT();
  const { openTabs, notes, activeNote, selectNote, closeTab, moveTab, itemColors } = useStore();
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Notes supprimées ou pas encore chargées : pas d'onglet.
  const byId = new Map(notes.map((n) => [n.id, n]));
  const tabs = openTabs.filter((id) => byId.has(id));
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={t("Notes ouvertes")}
      // Barre de défilement masquée : beaucoup d'onglets défilent à la molette.
      onWheel={(e) => { if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY; }}
      // Pas de défilement vertical (sinon une barre de défilement apparaît à droite) ; la ligne du
      // bas est une ombre intérieure, que l'onglet actif recouvre sans déborder.
      className="flex items-end gap-px px-2 pt-1.5 bg-sidebar overflow-x-auto overflow-y-hidden shrink-0 shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none]"
    >
      {tabs.map((id, i) => {
        const note = byId.get(id)!;
        const active = activeNote?.id === id;
        const color = itemColors[`note:${id}`];
        return (
          <div
            key={id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(TAB_MIME, id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(TAB_MIME)) { e.preventDefault(); setDragOver(i); } }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              const dragged = e.dataTransfer.getData(TAB_MIME);
              setDragOver(null);
              if (dragged) { e.preventDefault(); moveTab(dragged, i); }
            }}
            onClick={() => { if (!active) selectNote(id); }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(id); } }}
            title={note.folder ? `${note.folder} / ${note.title}` : note.title}
            className={`group relative flex items-center gap-1.5 min-w-0 max-w-[200px] pl-2.5 pr-1 py-1.5 rounded-t-md text-xs cursor-pointer select-none transition-colors ${
              active
                ? "bg-base text-primary border border-border border-b-transparent"
                : "text-muted hover:text-primary hover:bg-hover border border-transparent"
            } ${dragOver === i ? "ring-1 ring-accent" : ""}`}
          >
            <FileText size={11} className="shrink-0" style={color ? { color } : undefined} />
            <span className="truncate">{note.title || t("Sans titre")}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(id); }}
              aria-label={t("Fermer l'onglet {title}", { title: note.title || t("Sans titre") })}
              className={`shrink-0 p-0.5 rounded hover:bg-hover hover:text-primary ${active ? "opacity-70" : "opacity-0 group-hover:opacity-70"}`}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
