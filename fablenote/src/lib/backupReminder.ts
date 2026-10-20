import { tr } from "../i18n";
// Rappel hebdomadaire de sauvegarde : depuis que le chiffrement est lié au PC,
// un export est la seule façon de récupérer ses notes après une réinstallation.

const LAST_BACKUP_KEY = "natia_last_backup";
const FIRST_SEEN_KEY = "natia_first_seen";
const SNOOZE_KEY = "natia_backup_snooze_until";
const ENABLED_KEY = "natia_backup_reminder";

export const BACKUP_INTERVAL_MS = 7 * 24 * 3600 * 1000;
export const SNOOZE_MS = 24 * 3600 * 1000;

const readTime = (key: string): number | null => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : null;
};

export const isBackupReminderEnabled = () => localStorage.getItem(ENABLED_KEY) !== "0";
export const setBackupReminderEnabled = (v: boolean) => localStorage.setItem(ENABLED_KEY, v ? "1" : "0");

export const getLastBackup = () => readTime(LAST_BACKUP_KEY);

export function recordBackup(now = Date.now()) {
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
  localStorage.removeItem(SNOOZE_KEY);
}

export function snoozeBackupReminder(now = Date.now()) {
  localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS));
}

/** Sans sauvegarde connue, le premier rappel arrive une semaine après la première utilisation. */
export function isBackupDue(now = Date.now()): boolean {
  if (!isBackupReminderEnabled()) return false;
  const snoozeUntil = readTime(SNOOZE_KEY);
  if (snoozeUntil && now < snoozeUntil) return false;
  let reference = getLastBackup() ?? readTime(FIRST_SEEN_KEY);
  if (reference === null) {
    localStorage.setItem(FIRST_SEEN_KEY, String(now));
    reference = now;
  }
  return now - reference >= BACKUP_INTERVAL_MS;
}

export function formatLastBackup(now = Date.now()): string {
  const last = getLastBackup();
  if (last === null) return tr("jamais");
  const days = Math.floor((now - last) / (24 * 3600 * 1000));
  if (days <= 0) return tr("aujourd'hui");
  if (days === 1) return tr("hier");
  return tr("il y a {n} jours", { n: days });
}
