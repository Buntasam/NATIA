import { useEffect } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getAllTasks } from "../lib/tasks";
import { dueOf, dueStatus, isoDate, withoutDue } from "../lib/taskDates";
import { tr } from "../i18n";

const NOTIFIED_KEY = "natia_tasks_notified";

/** Une fois par jour : une notification Windows pour les tâches dues aujourd'hui ou en retard. */
export default function TaskDueDaemon() {
  useEffect(() => {
    const check = async () => {
      const today = isoDate(new Date());
      try { if (localStorage.getItem(NOTIFIED_KEY) === today) return; } catch { return; }
      try {
        const due = (await getAllTasks()).filter((x) => {
          const s = dueStatus(dueOf(x.text));
          return !x.checked && (s === "today" || s === "overdue");
        });
        if (due.length === 0) return;
        const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
        if (!granted) return;
        localStorage.setItem(NOTIFIED_KEY, today);
        const late = due.filter((x) => dueStatus(dueOf(x.text)) === "overdue").length;
        sendNotification({
          title: late
            ? tr("{n} tâche(s) à faire, dont {late} en retard", { n: due.length, late })
            : tr("{n} tâche(s) à faire aujourd'hui", { n: due.length }),
          body: due.slice(0, 3).map((x) => `• ${withoutDue(x.text)}`).join("\n") + (due.length > 3 ? "\n…" : ""),
        });
      } catch {
        // App pas encore prête, ou verrouillée : on réessaiera.
      }
    };
    const first = setTimeout(check, 8000);
    const id = setInterval(check, 30 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return null;
}
