import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckSquare, FileText, Loader2, Plus, Search, Square, X } from "lucide-react";
import { useStore } from "../store";
import { TaskItem, addTask, ensureTasksNote, getAllTasks, setTaskChecked } from "../lib/tasks";
import { ensureDailyNote } from "../lib/dailyNote";
import { DueStatus, dueOf, dueStatus, resolveDueShortcut, setDue, withoutDue } from "../lib/taskDates";
import { trError, useLocale, useT } from "../i18n";
import { fold } from "../lib/related";

type Filter = "todo" | "done" | "all";
type GroupBy = "note" | "due";

/** Où va une tâche créée depuis la vue : la note « Tâches », la note du jour ou une note choisie. */
const DEST_KEY = "natia_tasks_dest";
const GROUP_KEY = "natia_tasks_group";
const INBOX = "inbox";
const DAILY = "daily";

const DUE_ORDER: DueStatus[] = ["overdue", "today", "week", "later", "none"];
const DUE_COLOR: Record<DueStatus, string> = {
  overdue: "text-red-500 border-red-500/40",
  today: "text-amber-600 border-amber-500/40",
  week: "text-accent border-accent/30",
  later: "text-muted border-border",
  none: "",
};

/** Vue « Tâches » : les cases à cocher de toutes les notes, par note ou par échéance. */
export default function TasksPanel() {
  const t = useT();
  const loc = useLocale();
  const { toggleTasks, selectNote, notes, activeNote } = useStore();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    try { return localStorage.getItem(GROUP_KEY) === "due" ? "due" : "note"; } catch { return "note"; }
  });
  const chooseGroup = (g: GroupBy) => { setGroupBy(g); try { localStorage.setItem(GROUP_KEY, g); } catch { /* stockage indisponible */ } };

  const reload = () => getAllTasks().then(setTasks).catch((e) => { setTasks([]); setError(trError(e)); });
  useEffect(() => { reload(); }, []);

  // Nouvelle tâche
  const [newText, setNewText] = useState("");
  const [newDue, setNewDue] = useState("");
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
    let text = resolveDueShortcut(newText.trim());
    if (!text || adding) return;
    if (newDue) text = setDue(text, newDue);
    setAdding(true); setError("");
    try {
      const noteId = destValue === INBOX ? await ensureTasksNote(t("Tâches"))
        : destValue === DAILY ? await ensureDailyNote()
        : destValue;
      await addTask(noteId, text);
      setNewText(""); setNewDue("");
      if (filter === "done") setFilter("todo");
      await reload();
    } catch (e) {
      setError(trError(e));
    } finally {
      setAdding(false);
    }
  };

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (tasks ?? []).filter((x) =>
      (filter === "all" || (filter === "done") === x.checked) &&
      (!q || fold(x.text).includes(q) || fold(x.note_title).includes(q)));
  }, [tasks, filter, query]);

  // Par note (dans l'ordre des notes), ou par échéance (en retard d'abord, puis par date).
  const groups = useMemo(() => {
    const byKey = new Map<string, TaskItem[]>();
    const keyOf = (x: TaskItem) => (groupBy === "note" ? x.note_id : dueStatus(dueOf(x.text)));
    for (const x of shown) byKey.set(keyOf(x), [...(byKey.get(keyOf(x)) ?? []), x]);
    if (groupBy === "note") return [...byKey.entries()];
    return DUE_ORDER.filter((k) => byKey.has(k)).map((k) => [
      k,
      byKey.get(k)!.sort((a, b) => (dueOf(a.text) ?? "").localeCompare(dueOf(b.text) ?? "")),
    ] as [string, TaskItem[]]);
  }, [shown, groupBy]);

  const todo = (tasks ?? []).filter((x) => !x.checked).length;
  const done = (tasks ?? []).length - todo;
  const late = (tasks ?? []).filter((x) => !x.checked && dueStatus(dueOf(x.text)) === "overdue").length;

  const toggle = async (x: TaskItem) => {
    setError("");
    const flip = (v: boolean) => setTasks((all) => all?.map((y) => (y.note_id === x.note_id && y.index === x.index ? { ...y, checked: v } : y)) ?? null);
    flip(!x.checked);
    try { await setTaskChecked(x.note_id, x.index, !x.checked); }
    catch (e) { flip(x.checked); setError(trError(e)); }
  };

  const open = (noteId: string) => { selectNote(noteId); toggleTasks(); };

  const dueLabel = (iso: string) => {
    const status = dueStatus(iso);
    if (status === "today") return t("aujourd'hui");
    const d = new Date(`${iso}T00:00`);
    return d.toLocaleDateString(loc, { weekday: status === "week" ? "short" : undefined, day: "numeric", month: "short" });
  };

  const DUE_TITLES: Record<DueStatus, string> = {
    overdue: t("En retard"), today: t("Aujourd'hui"), week: t("Dans les 7 jours"), later: t("Plus tard"), none: t("Sans échéance"),
  };

  const tab = (key: Filter, label: string) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${filter === key ? "bg-accent/15 text-accent" : "text-muted hover:text-primary hover:bg-hover"}`}
    >
      {label}
    </button>
  );

  const row = (x: TaskItem) => {
    const due = dueOf(x.text);
    const status = dueStatus(due);
    return (
      <label key={`${x.note_id}:${x.index}`} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-hover cursor-pointer">
        <button
          role="checkbox"
          aria-checked={x.checked}
          onClick={(e) => { e.preventDefault(); toggle(x); }}
          className={`mt-0.5 shrink-0 ${x.checked ? "text-accent" : "text-muted hover:text-primary"}`}
        >
          {x.checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
        <span className="flex-1 min-w-0">
          <span className={`text-sm leading-snug ${x.checked ? "text-muted line-through" : "text-primary"}`}>{withoutDue(x.text)}</span>
          {groupBy === "due" && (
            <button
              onClick={(e) => { e.preventDefault(); open(x.note_id); }}
              className="block text-[11px] text-muted hover:text-accent truncate max-w-full text-left"
            >
              {x.note_title || t("Sans titre")}
            </button>
          )}
        </span>
        {due && (
          <span className={`shrink-0 mt-0.5 flex items-center gap-1 px-1.5 py-px rounded border text-[10px] ${x.checked ? "text-muted border-border" : DUE_COLOR[status]}`}>
            <CalendarClock size={10} />{dueLabel(due)}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Tâches")}>
      <div className="fixed inset-0 bg-black/40" onClick={toggleTasks} />
      <div className="relative z-10 w-[660px] max-w-[94vw] h-[75vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <CheckSquare size={15} className="text-accent" />
          <span className="text-sm font-semibold text-primary">{t("Tâches")}</span>
          <div className="flex items-center gap-1 ml-3">
            {tab("todo", t("À faire ({n})", { n: todo }))}
            {tab("done", t("Faites ({n})", { n: done }))}
            {tab("all", t("Toutes"))}
          </div>
          {late > 0 && <span className="text-[11px] text-red-500">{t("{n} en retard", { n: late })}</span>}
          <button onClick={toggleTasks} aria-label={t("Fermer")} className="ml-auto p-1 text-muted hover:text-primary"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Plus size={13} className="text-accent shrink-0" />
          <input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
            placeholder={t("Nouvelle tâche… (@demain, @vendredi, @15/11)")}
            aria-label={t("Nouvelle tâche")}
            disabled={adding}
            className="flex-1 min-w-0 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            aria-label={t("Échéance")}
            title={t("Échéance")}
            className="bg-hover border border-border rounded-md px-1.5 py-0.5 text-xs text-secondary outline-none [color-scheme:light_dark]"
          />
          <select
            value={destValue}
            onChange={(e) => chooseDest(e.target.value)}
            aria-label={t("Ajouter dans")}
            title={t("Ajouter dans")}
            className="max-w-[150px] bg-hover border border-border rounded-md px-1.5 py-1 text-xs text-secondary outline-none"
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
          <div className="flex items-center gap-0.5 text-[11px]" role="group" aria-label={t("Regrouper")}>
            {(["note", "due"] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => chooseGroup(g)}
                className={`px-2 py-0.5 rounded ${groupBy === g ? "bg-hover text-primary" : "text-muted hover:text-primary"}`}
              >
                {g === "note" ? t("Par note") : t("Par échéance")}
              </button>
            ))}
          </div>
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
          {groups.map(([key, items]) => (
            <section key={key} className="flex flex-col gap-0.5">
              {groupBy === "note" ? (
                <button
                  onClick={() => open(items[0].note_id)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted hover:text-accent transition-colors text-left"
                  title={t("Ouvrir la note")}
                >
                  <FileText size={11} className="shrink-0" />
                  <span className="truncate font-medium">{items[0].note_title || t("Sans titre")}</span>
                  {items[0].folder && <span className="truncate opacity-60">· {items[0].folder}</span>}
                </button>
              ) : (
                <p className={`px-2 py-1 text-xs font-medium ${key === "overdue" ? "text-red-500" : key === "today" ? "text-amber-600" : "text-muted"}`}>
                  {DUE_TITLES[key as DueStatus]} ({items.length})
                </p>
              )}
              {items.map(row)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
