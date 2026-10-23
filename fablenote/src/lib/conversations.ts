import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useStore } from "../store";

// Historique des conversations IA (panneau « Conversation IA »).
// Rangé dans user_data, donc chiffré quand un mot de passe est actif.

export type NoteRef = { id: string; title: string };
/** `sources` : notes données à l'IA pour cette réponse (mode « Toutes mes notes »). */
export type ConvMessage = { role: "user" | "ai"; content: string; sources?: NoteRef[] };
/** "note" : la note ouverte sert de contexte ; "all" : les notes utiles à chaque question. */
export type ConvScope = "note" | "all";

export interface Conversation {
  id: string;
  title: string;
  noteId: string | null;
  noteTitle: string;
  scope?: ConvScope;
  createdAt: string;
  updatedAt: string;
  messages: ConvMessage[];
}

const KEY = "ai_conversations";
/** Au-delà, les plus anciennes sont oubliées. */
const MAX_CONVERSATIONS = 100;
const TITLE_LENGTH = 60;

export function conversationTitle(firstMessage: string): string {
  const line = firstMessage.trim().split("\n")[0];
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}…` : line;
}

interface ConversationsState {
  list: Conversation[];
  loaded: boolean;
  /** Conversation affichée ; null = nouvelle conversation, pas encore enregistrée. */
  currentId: string | null;
  /** Une réponse est en cours : on ne change pas de conversation. */
  streaming: boolean;
  /** Contexte de la conversation affichée (celui d'une nouvelle conversation se choisit). */
  scope: ConvScope;
  setScope: (scope: ConvScope) => void;
  load: () => Promise<void>;
  open: (id: string | null) => void;
  save: (conv: Conversation) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
}

function persist(list: Conversation[]) {
  invoke("set_user_data", { name: KEY, value: JSON.stringify(list) })
    .catch((e) => console.error("conversations:", e));
}

export const useConversations = create<ConversationsState>((set, get) => ({
  list: [],
  loaded: false,
  currentId: null,
  streaming: false,
  scope: "note",
  setScope: (scope) => set({ scope }),

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await invoke<string | null>("get_user_data", { name: KEY });
      const list: Conversation[] = raw ? JSON.parse(raw) : [];
      set({ list, loaded: true });
    } catch (e) {
      console.error("conversations:", e);
    }
  },

  // Une conversation enregistrée garde son contexte ; une nouvelle garde celui choisi.
  open: (currentId) => {
    const conv = get().list.find((c) => c.id === currentId);
    set(conv ? { currentId, scope: conv.scope ?? "note" } : { currentId });
  },

  save: (conv) => {
    const list = [conv, ...get().list.filter((c) => c.id !== conv.id)].slice(0, MAX_CONVERSATIONS);
    set({ list, currentId: conv.id });
    persist(list);
  },

  rename: (id, title) => {
    const clean = title.trim().slice(0, 120);
    if (!clean) return;
    const list = get().list.map((c) => (c.id === id ? { ...c, title: clean } : c));
    set({ list });
    persist(list);
  },

  remove: (id) => {
    const list = get().list.filter((c) => c.id !== id);
    set((s) => ({ list, currentId: s.currentId === id ? null : s.currentId }));
    persist(list);
  },
}));

// Verrouillage : l'historique déchiffré ne reste pas en mémoire.
useStore.subscribe((s, prev) => {
  if (s.isLocked && !prev.isLocked) useConversations.setState({ list: [], loaded: false, currentId: null });
});
