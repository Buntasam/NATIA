import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

interface ReminderItem {
  note_id: string;
  note_title: string;
  due_date: string;
  done: boolean;
  text: string;
}

function reminderKey(r: ReminderItem) {
  return `${r.note_id}::${r.due_date}`;
}

export default function ReminderDaemon() {
  const notifiedRef = useRef<Set<string>>(new Set());

  const check = async () => {
    try {
      const reminders = await invoke<ReminderItem[]>("get_all_reminders");
      const now = Date.now();

      const granted = await isPermissionGranted();
      const canNotify = granted || (await requestPermission()) === "granted";
      if (!canNotify) return;

      for (const r of reminders) {
        if (r.done || !r.due_date) continue;
        const due = new Date(r.due_date).getTime();
        if (due > now) continue;
        const key = reminderKey(r);
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);
        sendNotification({
          title: r.note_title,
          body: r.text,
        });
      }
    } catch {
      // silently ignore (app might not be fully loaded yet)
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
