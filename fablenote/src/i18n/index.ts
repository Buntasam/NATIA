// Traduction de l'interface.
//
// Le texte français sert de clé : `t("Nouvelle note")`. Les autres langues sont des
// dictionnaires « texte français → traduction » (voir en.ts). Une traduction
// manquante affiche le français, rien ne casse.
// Variables : `t("{n} notes", { n: 3 })`.
// `npm run i18n:check` liste les textes sans traduction.

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import en from "./en";

export type Lang = "fr" | "en";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

const DICTS: Record<Lang, Record<string, string> | null> = { fr: null, en };
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };
const STORAGE_KEY = "natia_lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch { /* stockage indisponible */ }
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

interface LangState { lang: Lang; setLang: (l: Lang) => void }

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* préférence non conservée */ }
    set({ lang });
    applyLang(lang);
  },
}));

export type Vars = Record<string, string | number>;

/** Marque un texte traduit plus tard avec t() (listes de libellés, constantes). */
export const msg = (text: string) => text;

function format(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** `"Moyen@@intensité"` : même texte français, traduction propre au contexte. */
const CONTEXT = /@@.*$/;

function translate(lang: Lang, text: string, vars?: Vars): string {
  return format(DICTS[lang]?.[text] ?? text.replace(CONTEXT, ""), vars);
}

/** Hors composant React (store, utilitaires) : langue courante, sans rafraîchissement automatique. */
export function tr(text: string, vars?: Vars): string {
  return translate(useLang.getState().lang, text, vars);
}

/** Dans un composant : se met à jour quand la langue change. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (text: string, vars?: Vars) => translate(lang, text, vars);
}

/** Locale pour les dates et les nombres (`toLocaleDateString(locale())`). */
export function locale(): string {
  return LOCALES[useLang.getState().lang];
}

export function useLocale(): string {
  return LOCALES[useLang((s) => s.lang)];
}

// Messages d'erreur venant du backend Rust (en français) : textes fixes via le
// dictionnaire, textes variables via ces motifs.
const ERROR_PATTERNS: { re: RegExp; key: string }[] = [
  { re: /^Trop de tentatives\. Réessayez dans (.+)\.$/, key: "Trop de tentatives. Réessayez dans {0}." },
  { re: /^Impossible de contacter Ollama : (.*)$/s, key: "Impossible de contacter Ollama : {0}" },
  { re: /^Ollama a répondu (\S+) : (.*)$/s, key: "Ollama a répondu {0} : {1}" },
  { re: /^Connexion impossible : (.*)$/s, key: "Connexion impossible : {0}" },
  { re: /^Erreur (Claude API|Gemini API|Mistral API|Ollama|OpenAI) : (.*)$/s, key: "Erreur {0} : {1}" },
  { re: /^Impossible de lancer claude CLI : (.*)$/s, key: "Impossible de lancer claude CLI : {0}" },
  { re: /^Impossible de trouver claude CLI : (.*)$/s, key: "Impossible de trouver claude CLI : {0}" },
];

export function trError(e: unknown): string {
  const msg = String(e).replace(/^Error: /, "");
  for (const { re, key } of ERROR_PATTERNS) {
    const m = msg.match(re);
    if (m) return tr(key, Object.fromEntries(m.slice(1).map((v, i) => [i, v])));
  }
  return tr(msg);
}

/** Langue de la page (correcteur orthographique, lecteurs d'écran) et menu de l'icône Windows. */
function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  invoke("set_tray_language", {
    labels: { open: tr("Ouvrir NATIA"), lock: tr("Verrouiller"), quit: tr("Quitter") },
  }).catch(() => {});
}

applyLang(useLang.getState().lang);
