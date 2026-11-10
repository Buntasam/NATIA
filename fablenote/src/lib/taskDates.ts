// Échéances des tâches : « 📅 2026-11-12 » dans le texte de la tâche (ou « @2026-11-12 »).
// À la création (vue Tâches, capture rapide), les raccourcis « @demain », « @lundi »,
// « @15/11 »… deviennent une date fixe : une tâche écrite lundi pour « demain » reste
// due mardi, même relue la semaine suivante.

const DUE_RE = /(?:📅\s?|@)(\d{4}-\d{2}-\d{2})\b/u;

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Échéance d'une tâche (« 2026-11-12 »), ou null. */
export function dueOf(text: string): string | null {
  return text.match(DUE_RE)?.[1] ?? null;
}

/** Texte de la tâche sans son échéance. */
export function withoutDue(text: string): string {
  return text.replace(DUE_RE, "").replace(/\s{2,}/g, " ").trim();
}

const DAYS: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Date désignée par un mot (« demain », « vendredi », « 15/11 »), ou null. */
function dateFromWord(word: string, now: Date): Date | null {
  const w = fold(word).replace(/['’]/g, "");
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plus = (n: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
  if (w === "aujourdhui" || w === "today") return day;
  if (w === "demain" || w === "tomorrow") return plus(1);
  if (w === "apres-demain") return plus(2);
  if (w in DAYS) {
    // Le prochain jour de ce nom ; « lundi » un lundi = lundi prochain.
    const diff = (DAYS[w] - day.getDay() + 7) % 7 || 7;
    return plus(diff);
  }
  const m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : day.getFullYear();
    let date = new Date(y, mo - 1, d);
    if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    // Sans année, une date déjà passée vise l'an prochain (« 05/01 » écrit en décembre).
    if (!m[3] && date < day) { y += 1; date = new Date(y, mo - 1, d); }
    return date;
  }
  return null;
}

/** Remplace le premier raccourci « @mot » reconnu par « 📅 AAAA-MM-JJ ». */
export function resolveDueShortcut(text: string, now = new Date()): string {
  if (dueOf(text)) return text;
  return text.replace(/@([\p{L}'’-]+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/u, (whole, word: string) => {
    const date = dateFromWord(word, now);
    return date ? `📅 ${isoDate(date)}` : whole;
  });
}

/** Ajoute (ou remplace) l'échéance d'une tâche. */
export function setDue(text: string, iso: string | null): string {
  const base = withoutDue(text);
  return iso ? `${base} 📅 ${iso}` : base;
}

export type DueStatus = "overdue" | "today" | "week" | "later" | "none";

export function dueStatus(due: string | null, now = new Date()): DueStatus {
  if (!due) return "none";
  const today = isoDate(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  const week = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return due <= week ? "week" : "later";
}
