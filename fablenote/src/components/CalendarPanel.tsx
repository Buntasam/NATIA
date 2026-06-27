import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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

interface ReminderItem {
  note_id: string;
  note_title: string;
  due_date: string;
  done: boolean;
  text: string;
}

interface Props {
  onClose: () => void;
}

export default function CalendarPanel({ onClose }: Props) {
  const { notes, selectNote, activeNote, createNote, updateNote } = useStore();
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(today);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  const year = view.getFullYear();
  const month = view.getMonth();

  useEffect(() => {
    invoke<ReminderItem[]>("get_all_reminders")
      .then(setReminders)
      .catch(() => {});
  }, []);

  // Build calendar grid (Mon-start)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const getKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Index notes by date
  const notesByDate: Record<string, typeof notes> = {};
  for (const n of notes) {
    const d = new Date(n.updated_at);
    notesByDate[getKey(d)] = [...(notesByDate[getKey(d)] ?? []), n];
  }

  // Index reminders by date
  const remindersByDate: Record<string, ReminderItem[]> = {};
  for (const r of reminders) {
    if (!r.due_date || r.done) continue;
    const d = new Date(r.due_date);
    if (isNaN(d.getTime())) continue;
    remindersByDate[getKey(d)] = [...(remindersByDate[getKey(d)] ?? []), r];
  }

  const selectedNotes = selected ? (notesByDate[getKey(selected)] ?? []) : [];
  const selectedReminders = selected ? (remindersByDate[getKey(selected)] ?? []) : [];

  const handleAddReminder = async (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T09:00`;
    const title = `Rappel du ${date.toLocaleDateString("fr", { day: "numeric", month: "long" })}`;
    const html = `<div data-type="reminder" data-due="${iso}" data-done="false">Rappel</div>`;
    try {
      const note = await createNote();
      await updateNote(note.id, title, html, [], null);
      selectNote(note.id);
      onClose();
    } catch {
      // ignore
    }
  };

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
              const noteCount = notesByDate[key]?.length ?? 0;
              const remCount = remindersByDate[key]?.length ?? 0;
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
                      : noteCount > 0 || remCount > 0
                      ? "hover:bg-hover text-primary"
                      : "hover:bg-hover text-muted"
                  }`}
                >
                  {day.getDate()}
                  {/* Dots: blue=notes, orange=reminders */}
                  {(noteCount > 0 || remCount > 0) && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {noteCount > 0 && (
                        <span className={`w-1 h-1 rounded-full ${isSel ? "bg-white" : "bg-accent"}`} />
                      )}
                      {remCount > 0 && (
                        <span className={`w-1 h-1 rounded-full ${isSel ? "bg-white" : "bg-orange-400"}`} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 border-t border-border mt-3">
          {selected && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                  {selected.toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <button
                  onClick={() => handleAddReminder(selected)}
                  title="Créer un rappel ce jour"
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-hover text-muted hover:text-primary hover:bg-accent/10 hover:text-accent transition-colors"
                >
                  <Bell size={10} />
                  + Rappel
                </button>
              </div>

              {/* Reminders */}
              {selectedReminders.length > 0 && (
                <div className="mb-2 space-y-1">
                  <p className="text-[10px] text-orange-400 uppercase tracking-wider font-medium mb-1">Rappels</p>
                  {selectedReminders.map((r, i) => {
                    const t = new Date(r.due_date);
                    const time = t.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <button
                        key={i}
                        onClick={() => { selectNote(r.note_id); onClose(); }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-hover transition-colors flex items-start gap-2"
                      >
                        <Bell size={11} className="text-orange-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-primary truncate">{r.text}</p>
                          <p className="text-[10px] text-muted">{time} · {r.note_title}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Notes */}
              {selectedNotes.length === 0 && selectedReminders.length === 0 ? (
                <p className="text-xs text-muted py-2">Aucune note ni rappel ce jour</p>
              ) : selectedNotes.length > 0 && (
                <>
                  {selectedReminders.length > 0 && (
                    <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1">Notes modifiées</p>
                  )}
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
                </>
              )}
            </>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-muted">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" /> Notes
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Rappels
          </span>
        </div>
      </div>
    </div>
  );
}
