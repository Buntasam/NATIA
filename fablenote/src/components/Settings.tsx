import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookMarked, Download, Eye, EyeOff, FolderOpen, Lock, LogOut, Moon, Plus, RotateCcw, Shield, ShieldOff, Sun, Trash2 as TrashIcon, X, ChevronDown, Clock, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { DEFAULT_SETTINGS } from "../store";
import { Settings as SettingsType, PromptVersion } from "../types";
import ApiKeysPanel from "./ApiKeysPanel";
import React from "react";

type Tab = "general" | "advanced";

const PROMPT_FIELDS: { key: keyof SettingsType; label: string; rows: number }[] = [
  { key: "global_shadow_prompt", label: "Prompt global (injecté dans chaque requête)", rows: 3 },
  { key: "correct_prompt",       label: "Correction orthographique",                   rows: 3 },
  { key: "summary_prompt",       label: "Résumé",                                      rows: 2 },
  { key: "rename_prompt",        label: "Renommage automatique",                       rows: 2 },
  { key: "sort_prompt",          label: "Tri des notes (instructions JSON)",            rows: 3 },
  { key: "formalize_prompt",     label: "Formalisation (email professionnel)",          rows: 3 },
  { key: "translate_prompt",     label: "Traduction (instructions de style)",           rows: 2 },
  { key: "continue_prompt",      label: "Continuation de texte",                       rows: 2 },
];

const TEMP_PRESET_MAP: Record<string, (t: number) => string> = {
  global_shadow_prompt: (t) => t <= 0.3 ? "Froid" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Chaud" : "Expert",
  correct_prompt:       (t) => t <= 0.3 ? "Minimal" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Complet" : "Formel",
  summary_prompt:       (t) => t <= 0.3 ? "1 phrase" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Détaillé" : "Bullet points",
  rename_prompt:        (t) => t <= 0.3 ? "Minimaliste" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Descriptif" : "Créatif",
  sort_prompt:          (t) => t <= 0.8 ? "Simple" : t <= 1.4 ? "Défaut" : "Détaillé",
};

const PROMPT_PRESETS: Record<string, { label: string; value: string }[]> = {
  global_shadow_prompt: [
    { label: "Défaut",  value: "Tu es un assistant de prise de notes, précis et concis. Réponds toujours en français." },
    { label: "Froid",   value: "Tu es un assistant factuel et neutre. Réponds en français de manière concise, sans reformulation ni fioritures." },
    { label: "Chaud",   value: "Tu es un assistant enthousiaste et créatif. Réponds en français avec dynamisme, propose des idées et suggestions." },
    { label: "Rapide",  value: "Réponds en français. Sois ultra-court : 1 à 2 phrases maximum, va droit au but." },
    { label: "Expert",  value: "Tu es un expert analytique. Réponds en français avec précision technique, structure et profondeur." },
  ],
  correct_prompt: [
    { label: "Défaut",   value: "Corrige les fautes de grammaire et d'orthographe. Réponds uniquement avec le texte corrigé, sans explication :" },
    { label: "Minimal",  value: "Corrige uniquement les fautes graves (orthographe, accords). Ne reformule pas. Texte corrigé uniquement :" },
    { label: "Complet",  value: "Corrige l'orthographe, la grammaire, la ponctuation et améliore légèrement le style. Réponds uniquement avec le texte corrigé :" },
    { label: "Formel",   value: "Corrige et adapte au registre formel/professionnel. Réponds uniquement avec le texte corrigé :" },
  ],
  summary_prompt: [
    { label: "Défaut",        value: "Résume en 2-3 phrases en français :" },
    { label: "1 phrase",      value: "Résume en une seule phrase en français :" },
    { label: "Détaillé",      value: "Résume en 5-6 phrases en français en structurant les points clés :" },
    { label: "Bullet points", value: "Résume sous forme de 3 à 5 bullet points en français :" },
    { label: "TL;DR",         value: "Donne un TL;DR de 1 ligne en français :" },
  ],
  rename_prompt: [
    { label: "Défaut",      value: "Propose un titre court (5 mots max) en français. Réponds uniquement avec le titre :" },
    { label: "Descriptif",  value: "Propose un titre descriptif (8 mots max) en français. Réponds uniquement avec le titre :" },
    { label: "Créatif",     value: "Propose un titre accrocheur et original en français. Réponds uniquement avec le titre :" },
    { label: "Minimaliste", value: "Propose un titre de 2-3 mots en français. Réponds uniquement avec le titre :" },
  ],
  sort_prompt: [
    { label: "Défaut",   value: "Organise ces notes par sujet. Utilise des sous-dossiers avec / si utile (ex: Travail/Projets). Réponds UNIQUEMENT avec du JSON valide, sans texte autour : [{\"id\":\"...\",\"folder\":\"NomDossier\"}]" },
    { label: "Simple",   value: "Classe ces notes par thème principal (1 niveau). Réponds UNIQUEMENT avec du JSON : [{\"id\":\"...\",\"folder\":\"NomDossier\"}]" },
    { label: "Détaillé", value: "Organise en arborescence détaillée avec des sous-dossiers (ex: Travail/Projets/Web). Réponds UNIQUEMENT avec du JSON : [{\"id\":\"...\",\"folder\":\"Dossier/SousDossier\"}]" },
  ],
};

interface ShadowLibEntry { id: string; name: string; value: string; }

function loadLib(): ShadowLibEntry[] {
  try { return JSON.parse(localStorage.getItem("natia_shadow_prompt_library") ?? "[]"); } catch { return []; }
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function Settings() {
  const { settings, saveSettings, toggleSettings, isDark, toggleTheme, hasPassword, passwordType, lock, setupPassword, changePassword, removePassword } = useStore();
  const [form, setForm] = useState<SettingsType>({ ...settings });
  const [tab, setTab] = useState<Tab>("general");
  const [disclaimerReset, setDisclaimerReset] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [openDefault, setOpenDefault] = useState<string | null>(null);
  const [allReset, setAllReset] = useState(false);

  // Security state
  type SecMode = "idle" | "setup" | "change" | "remove";
  const [secMode, setSecMode] = useState<SecMode>("idle");
  const [secPwType, setSecPwType] = useState<"pin" | "alpha">("alpha");
  const [secA, setSecA] = useState("");
  const [secB, setSecB] = useState("");
  const [secC, setSecC] = useState("");
  const [secError, setSecError] = useState("");
  const [secLoading, setSecLoading] = useState(false);
  const [secShowA, setSecShowA] = useState(false);
  const [secShowB, setSecShowB] = useState(false);

  // Shadow prompt library
  const [shadowLib, setShadowLib] = useState<ShadowLibEntry[]>(loadLib);
  const [libSaveName, setLibSaveName] = useState("");
  const [libSaveOpen, setLibSaveOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);

  // History state
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // API key visibility
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showMistralKey, setShowMistralKey] = useState(false);

  // Uninstall
  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const uninstallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRevealData = async () => {
    await invoke("reveal_data_dir");
  };

  // Wide layout detection (fullscreen or maximized)
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    const check = async () => {
      const [fs, max] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
      setIsWide(fs || max);
    };
    check();
    let unlisten: (() => void) | undefined;
    win.listen("tauri://resize", check).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const handleExport = async () => {
    const filePath = await save({
      defaultPath: `natia-export-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Archive ZIP", extensions: ["zip"] }],
    });
    if (!filePath) return;
    setExporting(true);
    setExportDone(false);
    try {
      await invoke("save_zip_to_path", { path: filePath });
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (e) { console.error("save_zip_to_path error:", e); }
    finally { setExporting(false); }
  };

  const addToLib = () => {
    if (!libSaveName.trim()) return;
    const next = [{ id: crypto.randomUUID(), name: libSaveName.trim(), value: form.global_shadow_prompt }, ...shadowLib];
    setShadowLib(next);
    localStorage.setItem("natia_shadow_prompt_library", JSON.stringify(next));
    setLibSaveName(""); setLibSaveOpen(false);
  };

  const removeFromLib = (id: string) => {
    const next = shadowLib.filter(e => e.id !== id);
    setShadowLib(next);
    localStorage.setItem("natia_shadow_prompt_library", JSON.stringify(next));
  };

  const cancelSec = () => { setSecMode("idle"); setSecA(""); setSecB(""); setSecC(""); setSecError(""); };

  const doSetup = async () => {
    if (secPwType === "pin" && !/^\d{4,8}$/.test(secA)) { setSecError("PIN : 4 à 8 chiffres requis"); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError("Minimum 6 caractères"); return; }
    if (secA !== secB) { setSecError("Les mots de passe ne correspondent pas"); return; }
    setSecLoading(true); setSecError("");
    try { await setupPassword(secA, secPwType); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  const doChange = async () => {
    if (secA !== secB) { setSecError("Les nouveaux mots de passe ne correspondent pas"); return; }
    if (secPwType === "pin" && !/^\d{4,8}$/.test(secA)) { setSecError("PIN : 4 à 8 chiffres requis"); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError("Minimum 6 caractères"); return; }
    setSecLoading(true); setSecError("");
    try { await changePassword(secC, secA); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  const doRemove = async () => {
    setSecLoading(true); setSecError("");
    try { await removePassword(secA); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  const set = (key: keyof SettingsType, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isUnsaved = (key: keyof SettingsType) => form[key] !== settings[key];

  const handleSave = async () => { await saveSettings(form); toggleSettings(); };

  const resetDisclaimer = () => {
    localStorage.removeItem("natia_disclaimer_v1");
    setDisclaimerReset(true);
    setTimeout(() => setDisclaimerReset(false), 2000);
  };

  const resetPrompt = (key: keyof SettingsType) => { set(key, DEFAULT_SETTINGS[key] as string); setOpenDefault(null); };

  const resetAllPrompts = () => {
    setForm((f) => ({
      ...f,
      global_shadow_prompt: DEFAULT_SETTINGS.global_shadow_prompt,
      correct_prompt:        DEFAULT_SETTINGS.correct_prompt,
      summary_prompt:        DEFAULT_SETTINGS.summary_prompt,
      rename_prompt:         DEFAULT_SETTINGS.rename_prompt,
      sort_prompt:           DEFAULT_SETTINGS.sort_prompt,
    }));
    setOpenDefault(null); setHistoryKey(null);
    setAllReset(true); setTimeout(() => setAllReset(false), 2000);
  };

  const openHistory = async (key: string) => {
    if (historyKey === key) { setHistoryKey(null); return; }
    setHistoryKey(key); setPreviewId(null); setLoadingHistory(true);
    try { const v = await invoke<PromptVersion[]>("get_prompt_versions", { promptKey: key }); setVersions(v); }
    finally { setLoadingHistory(false); }
  };

  const restoreVersion = (v: PromptVersion) => {
    set(v.prompt_key as keyof SettingsType, v.value);
    setHistoryKey(null); setPreviewId(null);
  };

  const deleteVersion = async (id: string) => {
    await invoke("delete_prompt_version", { id });
    setVersions((vs) => vs.filter((v) => v.id !== id));
  };

  // Security section (shared between tabs)
  const securitySection = (
    <Section title="Sécurité">
      {!hasPassword && secMode === "idle" && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-secondary">Protection par mot de passe</p>
            <p className="text-[10px] text-muted mt-0.5">Données non chiffrées · AES-256-GCM disponible</p>
          </div>
          <button onClick={() => setSecMode("setup")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">
            <Shield size={11} />Activer
          </button>
        </div>
      )}

      {hasPassword && secMode === "idle" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Shield size={13} className="text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-green-400 font-medium">Données chiffrées — AES-256-GCM</p>
              <p className="text-[10px] text-muted">Type : {passwordType === "pin" ? "Code PIN" : "Alphanumérique"} · Argon2id key derivation</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={async () => { await lock(); toggleSettings(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">
              <Lock size={11} />Verrouiller maintenant
            </button>
            <button onClick={() => { setSecMode("change"); setSecPwType(passwordType); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">
              <LogOut size={11} />Changer le mot de passe
            </button>
            <button onClick={() => setSecMode("remove")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 hover:bg-red-400/15 transition-colors">
              <ShieldOff size={11} />Désactiver
            </button>
          </div>
        </div>
      )}

      {secMode === "setup" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-secondary">Type de mot de passe</p>
          <div className="flex gap-2">
            {(["alpha", "pin"] as const).map((t) => (
              <button key={t} onClick={() => setSecPwType(t)} className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${secPwType === t ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary hover:text-primary"}`}>
                {t === "pin" ? "Code PIN (0-9)" : "Alphanumérique"}
              </button>
            ))}
          </div>
          <SecInput label={secPwType === "pin" ? "Code PIN (4–8 chiffres)" : "Mot de passe (min. 6 car.)"} value={secA} onChange={setSecA} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          <SecInput label="Confirmer" value={secB} onChange={setSecB} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">Annuler</button>
            <button onClick={doSetup} disabled={secLoading || !secA || !secB} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? "Chiffrement…" : "Activer"}</button>
          </div>
        </div>
      )}

      {secMode === "change" && (
        <div className="flex flex-col gap-3">
          <SecInput label="Ancien mot de passe" value={secC} onChange={setSecC} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          <div className="flex gap-2">
            {(["alpha", "pin"] as const).map((t) => (
              <button key={t} onClick={() => setSecPwType(t)} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${secPwType === t ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary"}`}>
                {t === "pin" ? "PIN" : "Alphanumérique"}
              </button>
            ))}
          </div>
          <SecInput label={secPwType === "pin" ? "Nouveau PIN (4–8 chiffres)" : "Nouveau mot de passe"} value={secA} onChange={setSecA} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          <SecInput label="Confirmer le nouveau" value={secB} onChange={setSecB} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">Annuler</button>
            <button onClick={doChange} disabled={secLoading || !secA || !secB || !secC} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? "Rechiffrement…" : "Changer"}</button>
          </div>
        </div>
      )}

      {secMode === "remove" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Confirme ton mot de passe pour désactiver le chiffrement. Toutes les données seront déchiffrées.</p>
          <SecInput label="Mot de passe actuel" value={secA} onChange={setSecA} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">Annuler</button>
            <button onClick={doRemove} disabled={secLoading || !secA} className="flex-1 py-2 rounded-lg bg-red-400/80 hover:bg-red-400 text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? "Déchiffrement…" : "Désactiver"}</button>
          </div>
        </div>
      )}
    </Section>
  );

  // ── Content blocks (shared between tabbed and wide layouts) ─────────────────

  const generalContent = (
    <>
      <Section title="Clés API">
        <ApiKeysPanel />
      </Section>

      <Section title="Intelligence artificielle">
        {/* Provider selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Fournisseur</label>
          <div className="flex flex-wrap gap-1.5">
            {(["ollama", "claude", "openai", "gemini", "mistral"] as const).map((p) => (
              <button
                key={p}
                onClick={() => set("ai_provider", p)}
                className={`flex-1 min-w-[80px] py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                  form.ai_provider === p
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "bg-hover border-border text-muted hover:text-primary"
                }`}
              >
                {p === "ollama" ? "Ollama" : p === "claude" ? "Claude" : p === "openai" ? "OpenAI" : p === "gemini" ? "Gemini" : "Mistral"}
              </button>
            ))}
          </div>
        </div>

        {/* Ollama fields */}
        {form.ai_provider === "ollama" && (
          <>
            <Field label="URL serveur Ollama" id="ollama_url">
              <Input id="ollama_url" value={form.ollama_url} onChange={(v) => set("ollama_url", v)} placeholder="http://localhost:11434" />
              <p className="text-[10px] text-muted mt-1">Serveur Ollama local. Modifie uniquement si tu as changé le port.</p>
            </Field>
            <Field label="Modèle par défaut" id="default_model">
              <Input id="default_model" value={form.default_model} onChange={(v) => set("default_model", v)} placeholder="gemma3:1b, mistral…" />
              <p className="text-[10px] text-muted mt-1">Nom exact du modèle installé sur ton serveur Ollama.</p>
            </Field>
          </>
        )}

        {/* Claude fields */}
        {form.ai_provider === "claude" && (
          <>
            <Field label="Clé API Anthropic" id="claude_api_key">
              <div className="relative">
                <Input id="claude_api_key" value={form.claude_api_key} onChange={(v) => set("claude_api_key", v)} placeholder="sk-ant-api03-…" type={showClaudeKey ? "text" : "password"} />
                <button onClick={() => setShowClaudeKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showClaudeKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">Crée ta clé sur <strong className="text-secondary">console.anthropic.com</strong> → API Keys. Free tier disponible.</p>
            </Field>
            <Field label="Modèle" id="claude_model">
              <div className="relative">
                <select id="claude_model" value={form.claude_model} onChange={(e) => set("claude_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — rapide · économique</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — équilibré · recommandé</option>
                  <option value="claude-opus-4-8">Claude Opus 4.8 — puissant · plus lent</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* OpenAI fields */}
        {form.ai_provider === "openai" && (
          <>
            <Field label="Clé API OpenAI" id="openai_api_key">
              <div className="relative">
                <Input id="openai_api_key" value={form.openai_api_key} onChange={(v) => set("openai_api_key", v)} placeholder="sk-…" type={showOpenAiKey ? "text" : "password"} />
                <button onClick={() => setShowOpenAiKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showOpenAiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">Crée ta clé sur <strong className="text-secondary">platform.openai.com</strong> → API Keys. Free tier disponible.</p>
            </Field>
            <Field label="Modèle" id="openai_model">
              <div className="relative">
                <select id="openai_model" value={form.openai_model} onChange={(e) => set("openai_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="gpt-4o-mini">GPT-4o Mini — rapide · économique</option>
                  <option value="gpt-4o">GPT-4o — équilibré · recommandé</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo — puissant</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* Gemini fields */}
        {form.ai_provider === "gemini" && (
          <>
            <Field label="Clé API Google" id="gemini_api_key">
              <div className="relative">
                <Input id="gemini_api_key" value={form.gemini_api_key} onChange={(v) => set("gemini_api_key", v)} placeholder="AIza…" type={showGeminiKey ? "text" : "password"} />
                <button onClick={() => setShowGeminiKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showGeminiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">Crée ta clé sur <strong className="text-secondary">aistudio.google.com</strong> → Get API Key. Free tier généreux.</p>
            </Field>
            <Field label="Modèle" id="gemini_model">
              <div className="relative">
                <select id="gemini_model" value={form.gemini_model} onChange={(e) => set("gemini_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash — rapide · recommandé</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash — économique</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro — puissant</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* Mistral fields */}
        {form.ai_provider === "mistral" && (
          <>
            <Field label="Clé API Mistral" id="mistral_api_key">
              <div className="relative">
                <Input id="mistral_api_key" value={form.mistral_api_key} onChange={(v) => set("mistral_api_key", v)} placeholder="…" type={showMistralKey ? "text" : "password"} />
                <button onClick={() => setShowMistralKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showMistralKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">Crée ta clé sur <strong className="text-secondary">console.mistral.ai</strong> → API Keys.</p>
            </Field>
            <Field label="Modèle" id="mistral_model">
              <div className="relative">
                <select id="mistral_model" value={form.mistral_model} onChange={(e) => set("mistral_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="mistral-small-latest">Mistral Small — rapide · économique</option>
                  <option value="mistral-medium-latest">Mistral Medium — équilibré</option>
                  <option value="mistral-large-latest">Mistral Large — puissant</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* Temperature (all providers) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-secondary">Température</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">Froide</span>
              <span className="text-xs font-mono text-accent w-7 text-center">{form.temperature.toFixed(1)}</span>
              <span className="text-[10px] text-muted">Chaude</span>
            </div>
          </div>
          <input
            type="range" min={0} max={2} step={0.1} value={form.temperature}
            onChange={(e) => {
              const temp = parseFloat(e.target.value);
              setForm((f) => {
                const updated = { ...f, temperature: temp };
                for (const key of Object.keys(TEMP_PRESET_MAP) as Array<keyof SettingsType>) {
                  const presets = PROMPT_PRESETS[key as string];
                  if (!presets) continue;
                  const targetLabel = TEMP_PRESET_MAP[key as string](temp);
                  const preset = presets.find((p) => p.label === targetLabel);
                  if (preset) (updated as Record<string, unknown>)[key as string] = preset.value;
                }
                return updated;
              });
            }}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted mt-0.5">
            <span>0.0 — Déterministe</span>
            <span>0.7 — Équilibré</span>
            <span>2.0 — Créatif</span>
          </div>
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20">
            <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
            <p className="text-[10px] text-amber-300/90 leading-relaxed">
              Ce curseur modifie automatiquement les prompts de <strong className="text-amber-300">toutes les tâches</strong>. Ajuste-les individuellement dans l'onglet <strong className="text-amber-300">Avancé</strong> pour un comportement optimal.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Données">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Exporter toutes les notes</p>
            <p className="text-[10px] text-muted mt-0.5">Archive ZIP · dossiers, sous-dossiers et fichiers HTML inclus</p>
          </div>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0">
            <Download size={11} className={exporting ? "animate-bounce" : exportDone ? "text-accent" : ""} />
            {exporting ? "Export…" : exportDone ? "Téléchargé ✓" : "Exporter (.zip)"}
          </button>
        </div>
      </Section>

      {securitySection}

      <Section title="Apparence">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Thème</p>
            <p className="text-[10px] text-muted mt-0.5">Clair ou sombre</p>
          </div>
          <button onClick={toggleTheme} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hover border border-border text-sm text-secondary hover:text-primary hover:border-accent/40 transition-colors">
            {isDark ? <Moon size={13} className="text-accent" /> : <Sun size={13} className="text-amber-400" />}
            {isDark ? "Sombre" : "Clair"}
          </button>
        </div>
      </Section>

      <Section title="Désinstallation">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted leading-relaxed">
            Pour désinstaller NATIA, ouvre le dossier de données et supprime-le manuellement. Toutes tes notes et paramètres seront effacés.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRevealData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors"
            >
              <FolderOpen size={11} />
              Ouvrir le dossier de données
            </button>
            <button
              onClick={() => {
                if (uninstallConfirm) {
                  if (uninstallTimer.current) clearTimeout(uninstallTimer.current);
                  setUninstallConfirm(false);
                } else {
                  setUninstallConfirm(true);
                  uninstallTimer.current = setTimeout(() => setUninstallConfirm(false), 5000);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                uninstallConfirm
                  ? "bg-red-400/10 border-red-400/30 text-red-400"
                  : "bg-hover border-border text-muted hover:text-red-400 hover:border-red-400/30"
              }`}
            >
              <TrashIcon size={11} />
              {uninstallConfirm ? "Ouvre le dossier ci-dessus et supprime-le ↑" : "Désinstaller…"}
            </button>
          </div>
        </div>
      </Section>
    </>
  );

  const advancedContent = (
    <>
      <Section title="Prompts système">
        <div className="flex flex-col gap-7">
          {PROMPT_FIELDS.map(({ key, label, rows }) => (
            <div key={key}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={key} className="text-sm text-secondary flex items-center gap-2">
                  {label}
                  {isUnsaved(key) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-500 border border-amber-400/20 font-medium">non sauvegardé</span>
                  )}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openHistory(key)} className={`flex items-center gap-1 text-[10px] transition-colors ${historyKey === key ? "text-accent" : "text-muted hover:text-primary"}`}>
                    <Clock size={10} />Historique
                  </button>
                  <button onClick={() => setOpenDefault(openDefault === key ? null : key)} className={`flex items-center gap-1 text-[10px] transition-colors ${openDefault === key ? "text-accent" : "text-muted hover:text-primary"}`}>
                    <ChevronDown size={10} className={`transition-transform ${openDefault === key ? "rotate-180" : ""}`} />
                    Défaut
                  </button>
                </div>
              </div>

              {/* Presets */}
              {PROMPT_PRESETS[key] && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {PROMPT_PRESETS[key].map((preset) => (
                    <button key={preset.label} onClick={() => set(key, preset.value)} title={preset.value}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${form[key] === preset.value ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-muted hover:text-primary hover:border-border/80"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <textarea
                id={key} value={form[key]} onChange={(e) => set(key, e.target.value)} rows={rows}
                className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 transition-colors resize-none font-mono"
              />

              {/* Default preview */}
              {openDefault === key && (
                <div className="mt-1.5 rounded-lg border border-border bg-panel p-3 flex flex-col gap-2">
                  <p className="text-[10px] text-muted uppercase tracking-wider">Valeur par défaut</p>
                  <pre className="text-[11px] text-secondary/80 whitespace-pre-wrap font-mono leading-relaxed break-all">{DEFAULT_SETTINGS[key]}</pre>
                  <button onClick={() => resetPrompt(key)} className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors">
                    <RotateCcw size={10} />Restaurer ce prompt
                  </button>
                </div>
              )}

              {/* History panel */}
              {historyKey === key && (
                <div className="mt-1.5 rounded-lg border border-border bg-panel overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Clock size={11} className="text-accent" />
                    <span className="text-xs font-medium text-secondary">Historique des versions</span>
                  </div>
                  {loadingHistory ? (
                    <p className="text-xs text-muted px-3 py-4 text-center">Chargement…</p>
                  ) : versions.length === 0 ? (
                    <p className="text-xs text-muted px-3 py-4 text-center italic">Aucune version sauvegardée</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto">
                      {versions.map((v, i) => (
                        <div key={v.id} className="flex flex-col px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-hover/50 transition-colors group">
                          <div className="flex items-start gap-2.5">
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-accent" : "bg-border"}`} />
                              {i < versions.length - 1 && <div className="w-px flex-1 min-h-[20px] bg-border/60 mt-0.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] text-muted font-mono">{fmtDate(v.saved_at)}</span>
                                {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">actuel</span>}
                              </div>
                              <p className="text-[11px] text-secondary/70 font-mono truncate cursor-pointer hover:text-secondary transition-colors" onClick={() => setPreviewId(previewId === v.id ? null : v.id)}>
                                {v.value.slice(0, 80)}{v.value.length > 80 ? "…" : ""}
                              </p>
                              {previewId === v.id && (
                                <pre className="mt-1.5 text-[10px] text-secondary/80 font-mono whitespace-pre-wrap leading-relaxed bg-hover rounded p-2 max-h-28 overflow-y-auto">{v.value}</pre>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {i !== 0 && (
                                  <button onClick={() => restoreVersion(v)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors">
                                    <RotateCcw size={9} />Restaurer
                                  </button>
                                )}
                                <button onClick={() => deleteVersion(v.id)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded text-muted hover:text-red-400 transition-colors">
                                  <Trash2 size={9} />Supprimer
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shadow prompt library — only for global_shadow_prompt */}
              {key === "global_shadow_prompt" && (
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <button onClick={() => setLibOpen(v => !v)} className="flex items-center gap-1.5 text-[10px] text-muted hover:text-primary transition-colors">
                      <BookMarked size={10} />
                      Bibliothèque{shadowLib.length > 0 ? ` (${shadowLib.length})` : ""}
                      <ChevronDown size={10} className={`transition-transform ${libOpen ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={() => { setLibSaveOpen(v => !v); setLibSaveName(""); }} className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors">
                      <Plus size={10} />Sauvegarder
                    </button>
                  </div>

                  {libSaveOpen && (
                    <div className="flex gap-1.5 mb-2">
                      <input
                        value={libSaveName}
                        onChange={e => setLibSaveName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addToLib()}
                        placeholder="Nom du prompt (ex : Assistant créatif)"
                        className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
                        autoFocus
                      />
                      <button onClick={addToLib} disabled={!libSaveName.trim()} className="px-2.5 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-xs text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">OK</button>
                      <button onClick={() => { setLibSaveOpen(false); setLibSaveName(""); }} className="px-2 py-1.5 rounded-lg bg-hover border border-border text-xs text-muted hover:text-primary transition-colors">✕</button>
                    </div>
                  )}

                  {libOpen && (
                    shadowLib.length === 0 ? (
                      <p className="text-[10px] text-muted italic py-1">Aucun prompt sauvegardé · cliquez sur "Sauvegarder" pour en ajouter un</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {shadowLib.map(entry => (
                          <div key={entry.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-hover border border-border group hover:border-accent/30 transition-colors">
                            <button onClick={() => set("global_shadow_prompt", entry.value)} className="flex-1 text-left min-w-0">
                              <p className="text-xs text-secondary group-hover:text-primary transition-colors font-medium truncate">{entry.name}</p>
                              <p className="text-[10px] text-muted font-mono truncate mt-0.5">{entry.value.slice(0, 70)}{entry.value.length > 70 ? "…" : ""}</p>
                            </button>
                            <button onClick={() => removeFromLib(entry.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all shrink-0">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Reset all */}
          <div className="pt-1 border-t border-border">
            <button onClick={resetAllPrompts} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 hover:bg-red-400/15 hover:border-red-400/30 transition-colors">
              <RotateCcw size={11} />
              {allReset ? "Tous les prompts ont été réinitialisés ✓" : "Tout réinitialiser aux valeurs par défaut"}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Application">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Disclaimer de démarrage</p>
            <p className="text-[10px] text-muted mt-0.5">Réafficher le message d'avertissement au prochain lancement</p>
          </div>
          <button onClick={resetDisclaimer} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors">
            <RotateCcw size={11} className={disclaimerReset ? "text-accent" : ""} />
            {disclaimerReset ? "Réinitialisé ✓" : "Réinitialiser"}
          </button>
        </div>
      </Section>
    </>
  );

  // ── Footer (shared) ─────────────────────────────────────────────────────────
  const footer = (
    <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
      <button onClick={toggleSettings} className="px-4 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors">Annuler</button>
      <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-white transition-colors">Sauvegarder</button>
    </div>
  );

  // ── Wide layout (fullscreen / maximized) ────────────────────────────────────
  if (isWide) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-panel border border-border rounded-xl w-[90vw] max-w-[1360px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-primary">Paramètres</h2>
            <button onClick={toggleSettings} className="text-muted hover:text-primary transition-colors"><X size={16} /></button>
          </div>

          {/* Two-column body */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Left — Général */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-border">
              <div className="px-6 py-2 border-b border-border/60 shrink-0">
                <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Général</span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
                {generalContent}
              </div>
            </div>

            {/* Right — Avancé */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-2 border-b border-border/60 shrink-0">
                <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Avancé</span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
                {advancedContent}
              </div>
            </div>

          </div>

          {footer}
        </div>
      </div>
    );
  }

  // ── Normal layout (tabbed) ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border rounded-xl w-[600px] max-h-[88vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-primary">Paramètres</h2>
          <button onClick={toggleSettings} className="text-muted hover:text-primary transition-colors"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-5 pt-3 pb-0 shrink-0 border-b border-border">
          <TabBtn active={tab === "general"} onClick={() => setTab("general")}>Général</TabBtn>
          <TabBtn active={tab === "advanced"} onClick={() => setTab("advanced")}>Avancé</TabBtn>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {tab === "general" && generalContent}
          {tab === "advanced" && advancedContent}
        </div>

        {footer}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${active ? "text-primary border-accent" : "text-muted border-transparent hover:text-primary"}`}>
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wider mb-3">{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-secondary mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Input({ id, value, onChange, placeholder, type = "text" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 transition-colors" />
  );
}

function SecInput({ label, value, onChange, show, onToggleShow }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggleShow: () => void }) {
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label}
        className="w-full bg-hover border border-border rounded-lg px-3 py-2 pr-9 text-sm text-primary outline-none focus:border-accent/50 transition-colors" />
      <button type="button" onClick={onToggleShow} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors" tabIndex={-1}>
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}
