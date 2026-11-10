import { useEffect, useMemo, useState } from "react";
import { CheckSquare, FileText, Loader2, Plus, Search, Square, X } from "lucide-react";
import { useStore } from "../store";
import { TaskItem, addTask, ensureTasksNote, getAllTasks, setTaskChecked } from "../lib/tasks";
import { ensureDailyNote } from "../lib/dailyNote";
import { trError, useT } from "../i18n";
import { fold } from "../lib/related";

type Filter = "todo" | "done" | "all";

/** Où va une tâche créée depuis la vue : la note « Tâches », la note du jour ou une note choisie. */
const DEST_KEY = "natia_tasks_dest";
const INBOX = "inbox";
const DAILY = "daily";

/** Vue « Tâches » : les cases à cocher de toutes les notes, regroupées par note. */
export default function TasksPanel() {
  const t = useT();
  const { toggleTasks, selectNote, notes, activeNote } = useStore();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const reload = () => getAllTasks().then(setTasks).catch((e) => { setTasks([]); setError(trError(e)); });
  useEffect(() => { reload(); }, []);

  // Nouvelle tâche
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [dest, setDest] = useState<string>(() => {
    try { return localStorage.getItem(DEST_KEY) ?? INBOX; } catch { return INBOX; }
  });
  const chooseDest = (v: string) => { setDest(v); try { localStorage.setItem(DEST_KEY, v); } catch { /* stockage indisponible */ } };

  // Notes proposées : la note ouverte et celles qui ont déjà des tâches.
  const destNotes = useMemo(() => {
    const ids = new Set((tasks ?? []).map((x) => x.note_id));
    if (activeNote) ids.add(activeNote.id);
    return notes.filter((n) => ids.has(n.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, notes, activeNote]);
  // Note choisie supprimée entre-temps : retour à la note « Tâches ».
  const destValue = dest === INBOX || dest === DAILY || destNotes.some((n) => n.id === dest) ? dest : INBOX;

  const create = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true); setError("");
    try {
      const noteId = destValue === INBOX ? await ensureTasksNote(t("Tâches"))
        : destValue === DAILY ? await ensureDailyNote()
        : destValue;
      await addTask(noteId, text);
      setNewText("");
      if (filter === "done") setFilter("todo");
      await reload();
    } catch (e) {
      setError(trError(e));
    } finally {
      setAdding(false);
    }
  };

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const shown = (tasks ?? []).filter((x) =>
      (filter === "all" || (filter === "done") === x.checked) &&
      (!q || fold(x.text).includes(q) || fold(x.note_title).includes(q)));
    const byNote = new Map<string, TaskItem[]>();
    for (const x of shown) byNote.set(x.note_id, [...(byNote.get(x.note_id) ?? []), x]);
    return [...byNote.values()];
  }, [tasks, filter, query]);

  const todo = (tasks ?? []).filter((x) => !x.checked).length;
  const done = (tasks ?? []).length - todo;

  const toggle = async (x: TaskItem) => {
    setError("");
    const flip = (v: boolean) => setTasks((all) => all?.map((y) => (y.note_id === x.note_id && y.index === x.index ? { ...y, checked: v } : y)) ?? null);
    flip(!x.checked);
    try { await setTaskChecked(x.note_id, x.index, !x.checked); }
    catch (e) { flip(x.checked); setError(trError(e)); }
  };

  const open = (noteId: string) => { selectNote(noteId); toggleTasks(); };

  const tab = (key: Filter, label: string) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${filter === key ? "bg-accent/15 text-accent" : "text-muted hover:text-primary hover:bg-hover"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Tâches")}>
      <div className="fixed inset-0 bg-black/40" onClick={toggleTasks} />
      <div className="relative z-10 w-[620px] max-w-[94vw] h-[75vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <CheckSquare size={15} className="text-accent" />
          <span className="text-sm font-semibold text-primary">{t("Tâches")}</span>
          <div className="flex items-center gap-1 ml-3">
            {tab("todo", t("À faire ({n})", { n: todo }))}
            {tab("done", t("Faites ({n})", { n: done }))}
            {tab("all", t("Toutes"))}
          </div>
          <button onClick={toggleTasks} aria-label={t("Fermer")} className="ml-auto p-1 text-muted hover:text-primary"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Plus size={13} className="text-accent shrink-0" />
          <input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
            placeholder={t("Nouvelle tâche… (Entrée pour ajouter)")}
            aria-label={t("Nouvelle tâche")}
            disabled={adding}
            className="flex-1 min-w-0 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          <select
            value={destValue}
            onChange={(e) => chooseDest(e.target.value)}
            aria-label={t("Ajouter dans")}
            title={t("Ajouter dans")}
            className="max-w-[180px] bg-hover border border-border rounded-md px-1.5 py-1 text-xs text-secondary outline-none"
          >
            <option value={INBOX}>{t("Note « Tâches »")}</option>
            <option value={DAILY}>{t("Note du jour")}</option>
            {destNotes.map((n) => <option key={n.id} value={n.id}>{n.title || t("Sans titre")}</option>)}
          </select>
          <button
            onClick={create}
            disabled={!newText.trim() || adding}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-white text-xs hover:bg-accent-hover disabled:opacity-40"
          >
            {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {t("Ajouter")}
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Search size={13} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Filtrer les tâches…")}
            aria-label={t("Filtrer les tâches…")}
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
        </div>
        {error && <p className="px-4 pt-2 text-xs text-red-500">{error}</p>}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {tasks === null && <Loader2 size={16} className="animate-spin text-muted mx-auto mt-8" />}
          {tasks !== null && groups.length === 0 && (
            <p className="text-sm text-muted text-center mt-8">
              {tasks.length === 0
                ? t("Aucune tâche pour l'instant : écrivez-en une ci-dessus, ou tapez « / » puis « Liste de tâches » dans une note.")
                : t("Rien à afficher avec ce filtre")}
            </p>
          )}
          {groups.map((items) => (
            <section key={items[0].note_id} className="flex flex-col gap-0.5">
              <button
                onClick={() => open(items[0].note_id)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted hover:text-accent transition-colors text-left"
                title={t("Ouvrir la note")}
              >
                <FileText size={11} className="shrink-0" />
                <span className="truncate font-medium">{items[0].note_title || t("Sans titre")}</span>
                {items[0].folder && <span className="truncate opacity-60">· {items[0].folder}</span>}
              </button>
              {items.map((x) => (
                <label key={x.index} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-hover cursor-pointer">
                  <button
                    role="checkbox"
                    aria-checked={x.checked}
                    onClick={(e) => { e.preventDefault(); toggle(x); }}
                    className={`mt-0.5 shrink-0 ${x.checked ? "text-accent" : "text-muted hover:text-primary"}`}
                  >
                    {x.checked ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                  <span className={`text-sm leading-snug ${x.checked ? "text-muted line-through" : "text-primary"}`}>{x.text}</span>
                </label>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
