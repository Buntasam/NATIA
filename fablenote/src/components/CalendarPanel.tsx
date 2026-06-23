import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useStore } from "../store";

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

interface Props {
  onClose: () => void;
}

export default function CalendarPanel({ onClose }: Props) {
  const { notes, selectNote, activeNote } = useStore();
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(today);

  const year = view.getFullYear();
  const month = view.getMonth();

  // Build calendar grid (Mon-start)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  // Index notes by date
  const notesByDate: Record<string, typeof notes> = {};
  for (const n of notes) {
    const d = new Date(n.updated_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!notesByDate[key]) notesByDate[key] = [];
    notesByDate[key].push(n);
  }

  const getKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const selectedNotes = selected ? (notesByDate[getKey(selected)] ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView(new Date(year, month - 1, 1))}
              className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-primary min-w-32 text-center">
              {MONTHS_FR[month]} {year}
            </span>
            <button
              onClick={() => setView(new Date(year, month + 1, 1))}
              className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setView(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}
              className="text-xs px-2 py-1 rounded bg-hover text-secondary hover:text-primary transition-colors"
            >
              Aujourd'hui
            </button>
            <button onClick={onClose} className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-7 mb-1">
            {DAYS_FR.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const key = getKey(day);
              const count = notesByDate[key]?.length ?? 0;
              const isToday = sameDay(day, today);
              const isSel = selected && sameDay(day, selected);
              return (
                <button
                  key={i}
                  onClick={() => setSelected(day)}
                  className={`relative flex flex-col items-center justify-center aspect-square rounded-lg text-sm transition-colors ${
                    isSel
                      ? "bg-accent text-white"
                      : isToday
                      ? "bg-accent/15 text-accent font-semibold"
                      : count > 0
                      ? "hover:bg-hover text-primary"
                      : "hover:bg-hover text-muted"
                  }`}
                >
                  {day.getDate()}
                  {count > 0 && (
                    <span
                      className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                        isSel ? "bg-white" : "bg-accent"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day notes */}
        <div className="flex-1 overflow-y-auto px-4 py-3 border-t border-border mt-3">
          {selected && (
            <>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                {selected.toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long" })}
                {selectedNotes.length > 0 && ` — ${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""}`}
              </p>
              {selectedNotes.length === 0 ? (
                <p className="text-xs text-muted py-2">Aucune note ce jour</p>
              ) : (
                <div className="space-y-1">
                  {selectedNotes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { selectNote(n.id); onClose(); }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        activeNote?.id === n.id ? "bg-active" : "hover:bg-hover"
                      }`}
                    >
                      <p className="text-sm text-primary truncate">{n.title || "Sans titre"}</p>
                      {n.folder && (
                        <p className="text-xs text-muted truncate">📁 {n.folder}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
