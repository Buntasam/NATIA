import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { Note, NoteMetadata, Settings, TrashItem, Version } from "../types";

interface AppStore {
  // Data
  notes: NoteMetadata[];
  activeNote: Note | null;
  versions: Version[];
  settings: Settings;
  folders: string[];
  itemColors: Record<string, string>;

  // Security
  isLocked: boolean;
  hasPassword: boolean;
  passwordType: "pin" | "alpha";
  checkSecurity: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  setupPassword: (password: string, pwType: string) => Promise<void>;
  changePassword: (oldPass: string, newPass: string) => Promise<void>;
  removePassword: (password: string) => Promise<void>;

  // UI state
  searchQuery: string;
  showAiPanel: boolean;
  showVersionPanel: boolean;
  showSettings: boolean;
  showTrash: boolean;
  isLoading: boolean;
  isSaving: boolean;

  // Note actions
  loadNotes: () => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  clearActiveNote: () => void;
  createNote: () => Promise<Note>;
  updateNote: (id: string, title: string, content: string, tags: string[], folder: string | null, label?: string) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNote: (id: string, folder: string | null) => Promise<void>;

  // Folder actions
  loadFolders: () => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  renameFolder: (oldPath: string, newPath: string) => Promise<void>;

  // Color actions
  loadColors: () => Promise<void>;
  setItemColor: (key: string, color: string) => Promise<void>;
  deleteItemColor: (key: string) => Promise<void>;

  // Version actions
  loadVersions: (noteId: string) => Promise<void>;
  restoreVersion: (noteId: string, hash: string) => Promise<void>;

  // Settings actions
  loadSettings: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;

  // UI actions
  isDark: boolean;
  versionLimit: number | null;
  saveMode: "manual" | "balanced" | "auto";
  toggleTheme: () => void;
  setSearchQuery: (q: string) => void;
  toggleAiPanel: () => void;
  toggleVersionPanel: () => void;
  toggleSettings: () => void;
  toggleTrash: () => void;

  // Trash actions
  getTrash: () => Promise<TrashItem[]>;
  restoreFromTrash: (id: string, itemType: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  permanentDeleteItem: (id: string, itemType: string) => Promise<void>;

  setActiveNoteContent: (content: string) => void;
  setVersionLimit: (limit: number | null) => void;
  setSaveMode: (mode: "manual" | "balanced" | "auto") => void;
}

export const DEFAULT_SETTINGS: Settings = {
  default_model: "gemma3:1b",
  ollama_url: "http://localhost:11434",
  ai_provider: "ollama",
  claude_api_key: "",
  claude_model: "claude-haiku-4-5-20251001",
  openai_api_key: "",
  openai_model: "gpt-4o-mini",
  gemini_api_key: "",
  gemini_model: "gemini-2.0-flash",
  mistral_api_key: "",
  mistral_model: "mistral-small-latest",
  global_shadow_prompt: "Tu es un assistant de prise de notes, précis et concis. Réponds toujours en français.",
  correct_prompt: "Corrige les fautes de grammaire et d'orthographe. Réponds uniquement avec le texte corrigé, sans explication :",
  summary_prompt: "Résume en 2-3 phrases en français :",
  rename_prompt: "Propose un titre court (5 mots max) en français. Réponds uniquement avec le titre :",
  sort_prompt: "Organise ces notes par sujet. Utilise des sous-dossiers avec / si utile (ex: Travail/Projets). Réponds UNIQUEMENT avec du JSON valide, sans texte autour : [{\"id\":\"...\",\"folder\":\"NomDossier\"}]",
  formalize_prompt: "Réécris ce texte sous forme d'email professionnel en français. Commence par \"Bonjour,\" et termine par \"Cordialement,\". Réponds uniquement avec l'email reformulé, sans commentaires :",
  translate_prompt: "Réponds uniquement avec la traduction, sans commentaires ni explications :",
  continue_prompt: "Continue ce texte de manière cohérente, en respectant le style et le ton de l'auteur. Écris entre 80 et 150 mots supplémentaires. Réponds uniquement avec le texte à ajouter :",
  temperature: 0.7,
};

export const useStore = create<AppStore>((set, get) => ({
  notes: [],
  activeNote: null,
  versions: [],
  settings: DEFAULT_SETTINGS,
  folders: [],
  itemColors: {},

  // Security
  isLocked: false,
  hasPassword: false,
  passwordType: "alpha",

  checkSecurity: async () => {
    const hasPw = await invoke<boolean>("has_password");
    if (hasPw) {
      const pwType = await invoke<string>("get_password_type");
      set({ hasPassword: true, isLocked: true, passwordType: pwType as "pin" | "alpha" });
    } else {
      set({ hasPassword: false, isLocked: false });
    }
  },

  unlock: async (password: string) => {
    const ok = await invoke<boolean>("verify_password", { password });
    if (ok) set({ isLocked: false });
    return ok;
  },

  lock: async () => {
    await invoke("lock_app");
    set({ isLocked: true });
  },

  setupPassword: async (password: string, pwType: string) => {
    await invoke("setup_password", { password, pwType });
    set({ hasPassword: true, passwordType: pwType as "pin" | "alpha" });
  },

  changePassword: async (oldPass: string, newPass: string) => {
    await invoke("change_password", { oldPass, newPass });
  },

  removePassword: async (password: string) => {
    await invoke("remove_password", { password });
    set({ hasPassword: false, passwordType: "alpha" });
  },

  searchQuery: "",
  showAiPanel: false,
  showVersionPanel: false,
  showSettings: false,
  showTrash: false,
  isLoading: false,
  isSaving: false,

  loadNotes: async () => {
    set({ isLoading: true });
    try {
      const notes = await invoke<NoteMetadata[]>("get_all_notes");
      set({ notes, isLoading: false });
    } catch (e) {
      console.error(e);
      set({ isLoading: false });
    }
  },

  selectNote: async (id: string) => {
    try {
      const note = await invoke<Note>("get_note", { id });
      set({ activeNote: note });
    } catch (e) {
      console.error(e);
    }
  },

  clearActiveNote: () => set({ activeNote: null }),

  createNote: async () => {
    const note = await invoke<Note>("create_note", {
      title: "Nouvelle note",
      content: "",
      tags: [],
      folder: null,
    });
    await get().loadNotes();
    set({ activeNote: note });
    return note;
  },

  updateNote: async (id, title, content, tags, folder, label) => {
    set({ isSaving: true });
    try {
      const updated = await invoke<Note>("update_note", { id, title, content, tags, folder, label: label ?? null });
      set((state) => ({
        activeNote: updated,
        notes: state.notes.map((n) =>
          n.id === id ? { ...n, title, tags, folder, updated_at: updated.updated_at } : n
        ),
        isSaving: false,
      }));
    } catch (e) {
      console.error(e);
      set({ isSaving: false });
    }
  },

  renameNote: async (id, title) => {
    await invoke("rename_note", { id, title });
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, title } : n)),
      activeNote: state.activeNote?.id === id
        ? { ...state.activeNote, title }
        : state.activeNote,
    }));
  },

  deleteNote: async (id) => {
    await invoke("delete_note", { id });
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      activeNote: state.activeNote?.id === id ? null : state.activeNote,
    }));
  },

  moveNote: async (id, folder) => {
    const updated = await invoke<NoteMetadata>("move_note", { id, folder });
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updated } : n)),
      activeNote:
        state.activeNote?.id === id
          ? { ...state.activeNote, folder, updated_at: updated.updated_at }
          : state.activeNote,
    }));
  },

  loadFolders: async () => {
    try {
      const folders = await invoke<string[]>("get_folders");
      set({ folders });
    } catch {
      set({ folders: [] });
    }
  },

  createFolder: async (path) => {
    await invoke("create_folder", { path });
    set((state) => ({
      folders: [...state.folders.filter((f) => f !== path), path].sort(),
    }));
  },

  deleteFolder: async (path) => {
    await invoke("delete_folder", { path });
    await get().loadNotes();
    await get().loadFolders();
  },

  renameFolder: async (oldPath, newPath) => {
    await invoke("rename_folder", { oldPath, newPath });
    await get().loadNotes();
    await get().loadFolders();
    // Refresh colors so renamed folder keys are up to date
    await get().loadColors();
  },

  loadColors: async () => {
    try {
      const colors = await invoke<Record<string, string>>("get_colors");
      set({ itemColors: colors });
    } catch {
      set({ itemColors: {} });
    }
  },

  setItemColor: async (key, color) => {
    await invoke("set_color", { itemKey: key, color });
    set((s) => ({ itemColors: { ...s.itemColors, [key]: color } }));
  },

  deleteItemColor: async (key) => {
    await invoke("delete_color", { itemKey: key });
    set((s) => {
      const next = { ...s.itemColors };
      delete next[key];
      return { itemColors: next };
    });
  },

  loadVersions: async (noteId) => {
    const versions = await invoke<Version[]>("get_versions", { noteId });
    set({ versions });
  },

  restoreVersion: async (noteId, hash) => {
    const restored = await invoke<Note>("restore_version", { noteId, hash });
    set({ activeNote: restored });
    await get().loadVersions(noteId);
    await get().loadNotes();
  },

  loadSettings: async () => {
    try {
      const settings = await invoke<Settings>("get_settings");
      set({ settings });
    } catch {
      set({ settings: DEFAULT_SETTINGS });
    }
  },

  saveSettings: async (settings) => {
    await invoke("update_settings", { settings });
    set({ settings });
  },

  isDark: localStorage.getItem("theme") === "dark",
  versionLimit: (() => {
    const v = localStorage.getItem("natia_version_limit");
    if (v === "null") return null;
    const n = parseInt(v ?? "30");
    return isNaN(n) ? 30 : n;
  })(),
  saveMode: (localStorage.getItem("natia_save_mode") as "manual" | "balanced" | "auto") || "balanced",
  setVersionLimit: (limit) => {
    localStorage.setItem("natia_version_limit", limit === null ? "null" : String(limit));
    set({ versionLimit: limit });
  },
  setSaveMode: (mode) => {
    localStorage.setItem("natia_save_mode", mode);
    set({ saveMode: mode });
  },
  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      invoke("set_window_theme", { dark: next }).catch(() => {});
      return { isDark: next };
    }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleAiPanel: () => set((s) => ({ showAiPanel: !s.showAiPanel, showVersionPanel: false })),
  toggleVersionPanel: () => set((s) => ({ showVersionPanel: !s.showVersionPanel, showAiPanel: false })),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  toggleTrash: () => set((s) => ({ showTrash: !s.showTrash })),

  getTrash: () => invoke<TrashItem[]>("get_trash"),
  restoreFromTrash: async (id, itemType) => {
    await invoke("restore_from_trash", { id, itemType });
    await get().loadNotes();
    await get().loadFolders();
  },
  emptyTrash: () => invoke("empty_trash"),
  permanentDeleteItem: (id, itemType) => invoke("permanent_delete_item", { id, itemType }),

  setActiveNoteContent: (content) =>
    set((s) => (s.activeNote ? { activeNote: { ...s.activeNote, content } } : {})),
}));
