import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { Note, NoteMetadata, Settings, TrashItem, Version } from "../types";

export type MemoryNodeType = "projet" | "utilisateur" | "contexte" | "sujet";

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  label: string;
  content: string;
  connections: string[];
  strength: number; // 0.1 – 1.0
  createdAt: string;
  auto: boolean;
}

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
  isConfirmingClose: boolean;
  isClosingApp: boolean;
  closeOverlayDone: boolean;
  setIsConfirmingClose: (v: boolean) => void;
  setIsClosingApp: (v: boolean) => void;
  setCloseOverlayDone: (v: boolean) => void;

  // Pinned & recent
  pinnedNoteIds: string[];
  recentNoteIds: string[];
  togglePinNote: (id: string) => void;

  // Memory
  memoryEnabled: boolean;
  setMemoryEnabled: (v: boolean) => void;
  memoryGraphEnabled: boolean;
  setMemoryGraphEnabled: (v: boolean) => void;
  memoryNodes: MemoryNode[];
  addMemoryNode: (node: Omit<MemoryNode, "id" | "createdAt">) => void;
  updateMemoryNode: (id: string, updates: Partial<Omit<MemoryNode, "id" | "createdAt">>) => void;
  deleteMemoryNode: (id: string) => void;
  clearMemoryNodes: () => void;

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
  theme: string;
  isDark: boolean;
  setTheme: (name: string) => void;
  toggleTheme: () => void;
  versionLimit: number | null;
  saveMode: "manual" | "balanced" | "auto";
  focusMode: boolean;
  showGraph: boolean;
  setSearchQuery: (q: string) => void;
  toggleAiPanel: () => void;
  toggleVersionPanel: () => void;
  toggleSettings: () => void;
  toggleTrash: () => void;
  toggleFocusMode: () => void;
  toggleGraph: () => void;

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
  global_shadow_prompt: "Tu es NATIA, un assistant de prise de notes expert. Sois direct, précis et utile. Réponds TOUJOURS en français sauf si une autre langue est explicitement demandée. Ne te présente pas, ne conclus pas avec des formules de politesse — va directement à l'essentiel.",
  correct_prompt: "Tu es un correcteur orthographique professionnel. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. INTERDIT : reformuler, changer le style, réorganiser les idées, ajouter ou supprimer du contenu. Retourne SEULEMENT le texte corrigé, sans guillemets, sans commentaire, sans introduction. Texte à corriger :",
  summary_prompt: "Rédige un résumé en 2 à 3 phrases en français. Capture uniquement les idées essentielles. Réponds SEULEMENT avec le résumé, sans introduction, sans \"Résumé :\", sans commentaire. Texte :",
  rename_prompt: "Génère un titre de note en français de 3 à 5 mots. Le titre doit refléter le sujet central. Réponds avec le titre UNIQUEMENT : sans guillemets, sans point final, sans explication. Texte :",
  sort_prompt: "Analyse ces notes et assigne chacune à un dossier thématique. Utilise des sous-dossiers avec / pour plus de précision (ex: Travail/Projets). Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans bloc de code : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]",
  formalize_prompt: "Transforme ce texte en email professionnel en français. Structure obligatoire : \"Bonjour,\" (saut de ligne), corps clair et structuré, \"Cordialement,\" (saut de ligne), prénom/nom si mentionné sinon omis. Réponds UNIQUEMENT avec l'email, sans guillemets, sans commentaire :",
  translate_prompt: "Traduis le texte suivant en respectant strictement le style, le registre et le ton de l'original. Réponds UNIQUEMENT avec la traduction, sans introduction, sans commentaire, sans guillemets. Texte :",
  continue_prompt: "Continue ce texte de façon fluide et cohérente. Respecte strictement le style, le registre et le ton de l'auteur. Écris 80 à 150 mots. Réponds UNIQUEMENT avec le texte à ajouter, en continuant directement là où le texte s'arrête, sans en-tête ni commentaire. Texte :",
  temperature: 0.7,
  auto_lock_minutes: 0,
  editor_font_size: 16,
  editor_font_family: "system",
  editor_max_width: "normal",
  context_messages: 0,
  debug_mode: false,
  prompt_intensity: "medium",
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
    set({
      isLocked: true,
      notes: [],
      activeNote: null,
      folders: [],
      versions: [],
    });
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
  isConfirmingClose: false,
  isClosingApp: false,
  closeOverlayDone: false,
  setIsConfirmingClose: (v) => set({ isConfirmingClose: v }),
  setIsClosingApp: (v) => set({ isClosingApp: v }),
  setCloseOverlayDone: (v) => set({ closeOverlayDone: v }),

  pinnedNoteIds: (() => {
    try { return JSON.parse(localStorage.getItem("natia_pinned") ?? "[]") as string[]; }
    catch { return []; }
  })(),
  recentNoteIds: (() => {
    try { return JSON.parse(localStorage.getItem("natia_recent") ?? "[]") as string[]; }
    catch { return []; }
  })(),
  togglePinNote: (id: string) => {
    set((s) => {
      const pinned = s.pinnedNoteIds.includes(id)
        ? s.pinnedNoteIds.filter((p) => p !== id)
        : [id, ...s.pinnedNoteIds];
      localStorage.setItem("natia_pinned", JSON.stringify(pinned));
      return { pinnedNoteIds: pinned };
    });
  },

  memoryEnabled: localStorage.getItem("natia_memory_enabled") === "1",
  setMemoryEnabled: (v: boolean) => {
    localStorage.setItem("natia_memory_enabled", v ? "1" : "0");
    set({ memoryEnabled: v });
  },
  memoryGraphEnabled: localStorage.getItem("natia_memory_graph") === "1",
  setMemoryGraphEnabled: (v: boolean) => {
    localStorage.setItem("natia_memory_graph", v ? "1" : "0");
    set({ memoryGraphEnabled: v });
  },
  memoryNodes: (() => {
    try { return JSON.parse(localStorage.getItem("natia_memory_nodes") ?? "[]") as MemoryNode[]; }
    catch { return []; }
  })(),
  addMemoryNode: (node) => {
    set((s) => {
      const newNode: MemoryNode = { ...node, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      const nodes = [...s.memoryNodes, newNode];
      localStorage.setItem("natia_memory_nodes", JSON.stringify(nodes));
      return { memoryNodes: nodes };
    });
  },
  updateMemoryNode: (id, updates) => {
    set((s) => {
      const nodes = s.memoryNodes.map(n => n.id === id ? { ...n, ...updates } : n);
      localStorage.setItem("natia_memory_nodes", JSON.stringify(nodes));
      return { memoryNodes: nodes };
    });
  },
  deleteMemoryNode: (id) => {
    set((s) => {
      const nodes = s.memoryNodes.filter(n => n.id !== id);
      localStorage.setItem("natia_memory_nodes", JSON.stringify(nodes));
      return { memoryNodes: nodes };
    });
  },
  clearMemoryNodes: () => {
    localStorage.setItem("natia_memory_nodes", "[]");
    set({ memoryNodes: [] });
  },

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
      set((s) => {
        const recent = [id, ...s.recentNoteIds.filter((r) => r !== id)].slice(0, 10);
        localStorage.setItem("natia_recent", JSON.stringify(recent));
        return { activeNote: note, recentNoteIds: recent };
      });
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

  focusMode: false,
  showGraph: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleGraph: () => set((s) => ({ showGraph: !s.showGraph })),

  theme: localStorage.getItem("natia_theme") ?? (localStorage.getItem("theme") === "dark" ? "dark" : "light"),
  isDark: (() => {
    const t = localStorage.getItem("natia_theme") ?? (localStorage.getItem("theme") === "dark" ? "dark" : "light");
    return ["dark", "midnight", "ink", "foret", "crepuscule", "ocean"].includes(t);
  })(),
  setTheme: (name: string) => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-midnight", "theme-ink", "theme-foret", "theme-brume", "theme-sakura", "theme-crepuscule", "theme-ocean");
    if (name === "dark") root.classList.add("dark");
    else if (!["light"].includes(name)) root.classList.add(`theme-${name}`);
    localStorage.setItem("natia_theme", name);
    const dark = ["dark", "midnight", "ink", "foret", "crepuscule", "ocean"].includes(name);
    invoke("set_window_theme", { dark }).catch(() => {});
    set({ theme: name, isDark: dark });
  },
  toggleTheme: () => {
    const current = get().theme;
    const dark = ["dark", "midnight", "ink", "foret"].includes(current);
    get().setTheme(dark ? "light" : "dark");
  },
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
