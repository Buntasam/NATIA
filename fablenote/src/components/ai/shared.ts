import { msg } from "../../i18n";

// Types et constantes du panneau IA (AiPanel.tsx et ses sous-composants).

export interface PullProgress {
  status: string;
  total: number;
  completed: number;
  percent: number;
}

export interface TraceEntry {
  operation: string;
  model: string;
  system: string;
  user: string;
  response: string;
  elapsed: number;
  status: "running" | "done" | "error";
  error: string;
}

export type Tab = "ops" | "trace";

export interface SortProposal {
  id: string;
  title: string;
  currentFolder: string | null;
  suggestedFolder: string | null;
  accepted: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  provider: string;
  key_value: string;
  color: string;
  model: string;
}

export const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

export const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  Anthropic: [
    { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-opus-4-8", label: "Opus 4.8" },
  ],
  OpenAI: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "o1-mini", label: "o1 Mini" },
  ],
  Gemini: [
    { value: "gemini-2.0-flash", label: "2.0 Flash" },
    { value: "gemini-1.5-flash", label: "1.5 Flash" },
    { value: "gemini-1.5-pro", label: "1.5 Pro" },
  ],
  Mistral: [
    { value: "mistral-small-latest", label: "Small" },
    { value: "mistral-medium-latest", label: "Medium" },
    { value: "mistral-large-latest", label: "Large" },
  ],
  Groq: [
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
};

export function defaultModelForProvider(provider: string): string {
  return PROVIDER_MODELS[provider]?.[0]?.value ?? "";
}

// Niveaux de longueur des réponses — jauge signal compacte
export const INTENSITY: { key: "eco" | "low" | "medium" | "high" | "max"; label: string; color: string; desc: string }[] = [
  { key: "eco",    label: msg("Éco"),      color: "#22c55e", desc: msg("Ultra-court — 1 à 2 phrases") },
  { key: "low",    label: msg("Concis"),   color: "#2dd4bf", desc: msg("Court — 3 à 5 phrases") },
  { key: "medium", label: msg("Normal"),   color: "#d97757", desc: msg("Longueur standard") },
  { key: "high",   label: msg("Détaillé"), color: "#fb923c", desc: msg("Développé avec contexte") },
  { key: "max",    label: msg("Complet"),  color: "#f87171", desc: msg("Exhaustif et structuré") },
];

// Langues proposées pour « Traduire » (noms français = identifiants, traduits à l'affichage).
export const TRANSLATE_LANGS = [
  msg("français"), msg("anglais"), msg("espagnol"), msg("allemand"), msg("italien"),
  msg("portugais"), msg("japonais"), msg("chinois"), msg("arabe"), msg("russe"),
];

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Libellé affiché d'une opération (identifiants internes en français). */
export const OP_LABELS: Record<string, string> = {
  Résumer: msg("Résumer"), Corriger: msg("Corriger"), Renommer: msg("Renommer"), Trier: msg("Trier"),
  Formaliser: msg("Formaliser"), Traduire: msg("Traduire"), Continuer: msg("Continuer"),
  "Appliquer tri": msg("Appliquer tri"), "Chat debug": msg("Chat debug"),
};

export function detectProvider(key: string): string {
  if (key.startsWith("sk-ant-")) return "Anthropic";
  if (key.startsWith("AIza")) return "Gemini";
  if (key.startsWith("gsk_")) return "Groq";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "Mistral";
  if (key.startsWith("sk-")) return "OpenAI";
  return "";
}
