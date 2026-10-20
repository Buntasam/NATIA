// Post-its de l'écran de verrouillage. Volontairement en clair : ils s'affichent
// avant le déverrouillage, donc ne doivent rien contenir de personnel.

export interface LockPostIt {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  width?: number;
  height?: number;
}

export const POSTIT_COLORS = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bae6fd", "#e9d5ff"];

const POSTIT_KEY = "natia_lock_postits";
const HIDDEN_KEY = "natia_lock_postits_hidden";

export function loadPostIts(): LockPostIt[] {
  try {
    return JSON.parse(localStorage.getItem(POSTIT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function savePostIts(postIts: LockPostIt[]) {
  localStorage.setItem(POSTIT_KEY, JSON.stringify(postIts));
}

export function newPostIt(): LockPostIt {
  return {
    id: crypto.randomUUID(),
    text: "",
    x: 40 + Math.random() * Math.max(window.innerWidth - 260, 100),
    y: 40 + Math.random() * Math.max(window.innerHeight - 260, 100),
    color: POSTIT_COLORS[Math.floor(Math.random() * POSTIT_COLORS.length)],
  };
}

export const arePostItsHidden = () => localStorage.getItem(HIDDEN_KEY) === "1";
export const setPostItsHidden = (v: boolean) => localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
