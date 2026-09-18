import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { BarChart2, BookMarked, BookOpen, BrainCircuit, CheckCircle2, Database, Download, Eye, EyeOff, FolderOpen, Leaf, Lock, LogOut, Minus, Palette, Plus, RotateCcw, ScrollText, Search, Shield, ShieldOff, Sparkles, Terminal, Trash2 as TrashIcon, TrendingUp, Wrench, X, ChevronDown, Clock, Trash2, XCircle, Zap, Activity } from "lucide-react";
import { useStore } from "../store";
import { DEFAULT_SETTINGS } from "../store";
import { Settings as SettingsType, PromptVersion } from "../types";
import ApiKeysPanel from "./ApiKeysPanel";
import StatsPanel from "./StatsPanel";
import AiManual from "./AiManual";
import React from "react";
import { Section, Field, Input, SecInput } from "./settings/SettingsWidgets";

// ─── Catégories de la navigation latérale ─────────────────────────────────────

type SettingsCat = "appearance" | "ai" | "manual" | "prompts" | "memory" | "security" | "data" | "app" | "stats";

const NAV: { key: SettingsCat; label: string; desc: string; icon: React.ReactNode; keywords: string }[] = [
  { key: "appearance", label: "Apparence",                 desc: "Thème, typographie de l'éditeur, extras",              icon: <Palette size={14} />,      keywords: "theme couleur sombre clair police taille largeur editeur de d20 dice" },
  { key: "ai",         label: "Intelligence artificielle", desc: "Fournisseur, clés API, modèles et comportement",       icon: <Sparkles size={14} />,     keywords: "ia modele cle api ollama claude openai gemini mistral cli temperature contexte tokens fournisseur connexion historique conversation" },
  { key: "manual",     label: "Manuel",                    desc: "Guide : configurer chaque type d'IA",                  icon: <BookOpen size={14} />,     keywords: "manuel guide aide documentation configurer ia ollama claude openai gemini mistral cli connexion cle api tutoriel comment" },
  { key: "prompts",    label: "Prompts",                   desc: "Prompts système des opérations IA",                    icon: <ScrollText size={14} />,   keywords: "prompt correction resume traduction titre tri email continuation bibliotheque historique systeme shadow" },
  { key: "memory",     label: "Mémoire IA",                desc: "Mémoire persistante et graphe neuronal",               icon: <BrainCircuit size={14} />, keywords: "memoire graphe noeud neuronal collecte" },
  { key: "security",   label: "Sécurité",                  desc: "Mot de passe, chiffrement, verrouillage automatique",  icon: <Shield size={14} />,       keywords: "securite mot de passe pin verrouillage chiffrement aes argon lock" },
  { key: "data",       label: "Données",                   desc: "Export, dossier de données, désinstallation",          icon: <Database size={14} />,     keywords: "export zip sauvegarde donnees dossier desinstaller backup archive" },
  { key: "app",        label: "Application",               desc: "Disclaimer et outils de développement",                icon: <Wrench size={14} />,       keywords: "disclaimer avertissement debogage debug developpement demarrage" },
  { key: "stats",      label: "Statistiques",              desc: "Activité et métriques de tes notes",                   icon: <BarChart2 size={14} />,    keywords: "statistiques graphique mots notes activite tags kpi" },
];

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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

const INTENSITY_LEVELS: {
  key: "eco" | "low" | "medium" | "high" | "max";
  label: string;
  desc: string;
  icon: React.ReactNode;
  activeClass: string;
}[] = [
  { key: "eco",    label: "Éco",   desc: "1-2 phrases · minimal",      icon: <Leaf size={11} />,       activeClass: "bg-green-400/15 border-green-400/50 text-green-400"   },
  { key: "low",    label: "Low",   desc: "3-5 phrases · concis",       icon: <Minus size={11} />,      activeClass: "bg-teal-400/15 border-teal-400/50 text-teal-400"       },
  { key: "medium", label: "Moyen", desc: "Longueur naturelle",         icon: <Activity size={11} />,   activeClass: "bg-accent/15 border-accent/50 text-accent"             },
  { key: "high",   label: "Fort",  desc: "Développé avec exemples",    icon: <TrendingUp size={11} />, activeClass: "bg-orange-400/15 border-orange-400/50 text-orange-400" },
  { key: "max",    label: "Maxi",  desc: "Exhaustif · structuré",      icon: <Zap size={11} />,        activeClass: "bg-red-400/15 border-red-400/50 text-red-400"          },
];

const TEMP_PRESET_MAP: Record<string, (t: number) => string> = {
  global_shadow_prompt: (t) => t <= 0.3 ? "Factuel" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Créatif" : "Expert",
  correct_prompt:       (t) => t <= 0.3 ? "Léger" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Complet" : "Stylistique",
  summary_prompt:       (t) => t <= 0.3 ? "1 phrase" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Détaillé" : "Bullet points",
  rename_prompt:        (t) => t <= 0.3 ? "Minimaliste" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Descriptif" : "Créatif",
  sort_prompt:          (t) => t <= 0.8 ? "Simple" : t <= 1.4 ? "Défaut" : "Détaillé",
};

const PROMPT_PRESETS: Record<string, { label: string; value: string }[]> = {
  global_shadow_prompt: [
    { label: "Défaut",   value: "Tu es NATIA, un assistant de prise de notes expert. Sois direct, précis et utile. Réponds TOUJOURS en français sauf si une autre langue est explicitement demandée. Ne te présente pas, ne conclus pas avec des formules de politesse — va directement à l'essentiel." },
    { label: "Factuel",  value: "Tu es un assistant factuel et neutre. Réponds en français, sans reformulation ni fioritures. Faits uniquement, pas d'opinion." },
    { label: "Créatif",  value: "Tu es un assistant créatif et inspirant. En français, enrichis les idées, propose des angles originaux et des connexions inattendues." },
    { label: "Expert",   value: "Tu es un expert analytique et méthodique. En français, réponds avec précision technique, structure claire et profondeur d'analyse." },
    { label: "Coach",    value: "Tu es un coach bienveillant. En français, encourage, structure les pensées et pose des questions pertinentes pour approfondir la réflexion." },
  ],
  correct_prompt: [
    { label: "Défaut",       value: "Tu es un correcteur orthographique professionnel. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. INTERDIT : reformuler, changer le style, réorganiser les idées, ajouter ou supprimer du contenu. Retourne SEULEMENT le texte corrigé, sans guillemets, sans commentaire, sans introduction. Texte à corriger :" },
    { label: "Léger",        value: "Corrige uniquement les fautes graves d'orthographe et d'accord. Ne modifie rien d'autre. Retourne SEULEMENT le texte, sans commentaire :" },
    { label: "Complet",      value: "Corrige l'orthographe, la grammaire, la ponctuation et la syntaxe. Ne reformule pas. Retourne SEULEMENT le texte corrigé, sans commentaire :" },
    { label: "Stylistique",  value: "Corrige les fautes ET améliore légèrement le style (clarté, fluidité) sans changer le sens. Retourne SEULEMENT le texte amélioré, sans commentaire :" },
  ],
  summary_prompt: [
    { label: "Défaut",        value: "Rédige un résumé en 2 à 3 phrases en français. Capture uniquement les idées essentielles. Réponds SEULEMENT avec le résumé, sans introduction, sans \"Résumé :\", sans commentaire. Texte :" },
    { label: "1 phrase",      value: "Résume en une seule phrase percutante en français. Réponds SEULEMENT avec cette phrase, sans commentaire :" },
    { label: "Détaillé",      value: "Résume en 5 à 6 phrases structurées en français. Couvre les points clés, le contexte et les implications. Réponds SEULEMENT avec le résumé, sans commentaire :" },
    { label: "Bullet points", value: "Résume sous forme de 3 à 5 bullet points en français (commence chaque point par « • »). Réponds SEULEMENT avec les bullet points, sans introduction :" },
    { label: "TL;DR",         value: "Donne un TL;DR de max 15 mots en français. Réponds SEULEMENT avec le TL;DR, sans le mot \"TL;DR\" :" },
  ],
  rename_prompt: [
    { label: "Défaut",      value: "Génère un titre de note en français de 3 à 5 mots. Le titre doit refléter le sujet central. Réponds avec le titre UNIQUEMENT : sans guillemets, sans point final, sans explication. Texte :" },
    { label: "Descriptif",  value: "Génère un titre descriptif de 5 à 8 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets, sans commentaire. Texte :" },
    { label: "Créatif",     value: "Génère un titre accrocheur et original de 4 à 6 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :" },
    { label: "Minimaliste", value: "Génère un titre de 2 à 3 mots en français qui capture l'essence. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :" },
  ],
  sort_prompt: [
    { label: "Défaut",   value: "Analyse ces notes et assigne chacune à un dossier thématique. Utilise des sous-dossiers avec / pour plus de précision (ex: Travail/Projets). Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans bloc de code : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]" },
    { label: "Simple",   value: "Classe ces notes par thème principal (1 seul niveau, pas de sous-dossiers). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]" },
    { label: "Détaillé", value: "Organise en arborescence précise avec sous-dossiers (ex: Travail/Projets/Web, Perso/Santé). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"Dossier/SousDossier\"}]" },
  ],
  formalize_prompt: [
    { label: "Défaut",      value: "Transforme ce texte en email professionnel en français. Structure obligatoire : \"Bonjour,\" (saut de ligne), corps clair et structuré, \"Cordialement,\" (saut de ligne), prénom/nom si mentionné sinon omis. Réponds UNIQUEMENT avec l'email, sans guillemets, sans commentaire :" },
    { label: "Formel",      value: "Transforme ce texte en email professionnel formel (registre soutenu). \"Madame, Monsieur,\" si destinataire inconnu. Corps structuré, \"Veuillez agréer mes salutations distinguées,\". Réponds UNIQUEMENT avec l'email :" },
    { label: "Décontracté", value: "Transforme ce texte en email professionnel mais accessible. Ton cordial et clair. \"Bonjour,\" puis corps fluide, \"Bonne journée,\" en fin. Réponds UNIQUEMENT avec l'email :" },
  ],
  translate_prompt: [
    { label: "Défaut",       value: "Traduis le texte suivant en respectant strictement le style, le registre et le ton de l'original. Réponds UNIQUEMENT avec la traduction, sans introduction, sans commentaire, sans guillemets. Texte :" },
    { label: "Littéral",     value: "Traduis mot à mot en restant aussi proche que possible de l'original, même si cela nuit à la fluidité. Réponds UNIQUEMENT avec la traduction :" },
    { label: "Naturel",      value: "Traduis en adaptant les expressions idiomatiques pour une lecture naturelle dans la langue cible. Réponds UNIQUEMENT avec la traduction :" },
  ],
  continue_prompt: [
    { label: "Défaut",    value: "Continue ce texte de façon fluide et cohérente. Respecte strictement le style, le registre et le ton de l'auteur. Écris 80 à 150 mots. Réponds UNIQUEMENT avec le texte à ajouter, en continuant directement là où le texte s'arrête, sans en-tête ni commentaire. Texte :" },
    { label: "Court",     value: "Continue ce texte en 30 à 50 mots. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe, sans en-tête :" },
    { label: "Long",      value: "Continue ce texte en 200 à 300 mots. Développe les idées avec profondeur. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe :" },
    { label: "Narratif",  value: "Continue ce texte narratif en restant fidèle à l'intrigue, aux personnages et au ton. 100 à 200 mots. Réponds UNIQUEMENT avec la continuation directe :" },
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
  const { settings, saveSettings, toggleSettings, theme, setTheme, isDark, hasPassword, passwordType, lock, setupPassword, changePassword, removePassword, getPasswordHint, setPasswordHint, memoryEnabled, setMemoryEnabled, memoryGraphEnabled, setMemoryGraphEnabled, memoryNodes, clearMemoryNodes } = useStore();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [form, setForm] = useState<SettingsType>({ ...settings });
  const [cat, setCat] = useState<SettingsCat>(() => {
    const saved = localStorage.getItem("natia_settings_cat") as SettingsCat | null;
    return saved && NAV.some((n) => n.key === saved) ? saved : "appearance";
  });
  const [navQuery, setNavQuery] = useState("");
  const [closeAttempt, setCloseAttempt] = useState(false);
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
  const [secHint, setSecHint] = useState("");
  const [hintSaved, setHintSaved] = useState(false);

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

  // Claude CLI check
  const [claudeCliStatus, setClaudeCliStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [claudeCliChecking, setClaudeCliChecking] = useState(false);
  const checkClaudeCli = async () => {
    setClaudeCliChecking(true);
    setClaudeCliStatus(null);
    try {
      const v = await invoke<string>("check_claude_cli");
      setClaudeCliStatus({ ok: true, msg: v || "Installé ✓" });
    } catch (e) {
      setClaudeCliStatus({ ok: false, msg: String(e) });
    } finally {
      setClaudeCliChecking(false);
    }
  };

  // Uninstall
  const [diceEnabled, setDiceEnabled] = useState(() => localStorage.getItem("natia_dice_enabled") === "1");
  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const uninstallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRevealData = async () => {
    await invoke("reveal_data_dir");
  };

  // ── Navigation, recherche et détection de modifications ─────────────────────

  const selectCat = (key: SettingsCat) => {
    setCat(key);
    localStorage.setItem("natia_settings_cat", key);
  };

  const filteredNav = navQuery.trim()
    ? NAV.filter((n) => normalize(`${n.label} ${n.desc} ${n.keywords}`).includes(normalize(navQuery)))
    : NAV;

  // Si la catégorie sélectionnée sort du filtre, bascule sur le premier résultat
  useEffect(() => {
    if (filteredNav.length > 0 && !filteredNav.some((n) => n.key === cat)) {
      setCat(filteredNav[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navQuery]);

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  useEffect(() => {
    if (!dirty) setCloseAttempt(false);
  }, [dirty]);

  const requestClose = () => {
    if (dirty) setCloseAttempt(true);
    else toggleSettings();
  };

  // Escape : intercepté ici (capture) pour protéger les modifications non sauvegardées
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (dirty) setCloseAttempt(true);
      else toggleSettings();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dirty, toggleSettings]);

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

  const cancelSec = () => { setSecMode("idle"); setSecA(""); setSecB(""); setSecC(""); setSecError(""); setSecHint(""); };

  const doSetup = async () => {
    if (secPwType === "pin" && !/^\d{4,8}$/.test(secA)) { setSecError("PIN : 4 à 8 chiffres requis"); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError("Minimum 6 caractères"); return; }
    if (secA !== secB) { setSecError("Les mots de passe ne correspondent pas"); return; }
    setSecLoading(true); setSecError("");
    try { await setupPassword(secA, secPwType, secHint); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  const doChange = async () => {
    if (secA !== secB) { setSecError("Les nouveaux mots de passe ne correspondent pas"); return; }
    if (secPwType === "pin" && !/^\d{4,8}$/.test(secA)) { setSecError("PIN : 4 à 8 chiffres requis"); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError("Minimum 6 caractères"); return; }
    setSecLoading(true); setSecError("");
    try { await changePassword(secC, secA, secHint); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  // Charger l'indice existant quand la protection est active (édition directe)
  // ou quand on entre en mode "changer".
  useEffect(() => {
    if (hasPassword && (secMode === "idle" || secMode === "change")) {
      getPasswordHint().then((h) => setSecHint(h)).catch(() => {});
    }
  }, [hasPassword, secMode]);

  const saveHint = async () => {
    try {
      await setPasswordHint(secHint);
      setHintSaved(true);
      setTimeout(() => setHintSaved(false), 2000);
    } catch (e) { setSecError(String(e)); }
  };

  const doRemove = async () => {
    setSecLoading(true); setSecError("");
    try { await removePassword(secA); cancelSec(); }
    catch (e) { setSecError(String(e)); }
    finally { setSecLoading(false); }
  };

  const set = (key: keyof SettingsType, value: string | number | boolean) =>
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
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-secondary">Protection par mot de passe</p>
              <p className="text-[10px] text-muted mt-0.5">Notes non chiffrées · Clés API protégées par le keychain OS · AES-256-GCM disponible</p>
            </div>
            <button onClick={() => setSecMode("setup")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">
              <Shield size={11} />Activer
            </button>
          </div>
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
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-xs text-secondary">Indice de récupération</p>
            <div className="flex gap-2">
              <input
                value={secHint}
                onChange={(e) => setSecHint(e.target.value)}
                placeholder="Ex : mon année de naissance à l'envers"
                maxLength={120}
                className="flex-1 px-3 py-2 rounded-lg bg-hover border border-border text-xs text-primary placeholder-muted outline-none focus:border-accent/50 transition-colors"
              />
              <button onClick={saveHint} className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">
                {hintSaved ? "✓ Enregistré" : "Enregistrer"}
              </button>
            </div>
            <p className="text-[10px] text-muted">Affiché sur l'écran de verrouillage pour t'aider à te souvenir. Ne contient jamais le code.</p>
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
          <div className="flex flex-col gap-1">
            <input
              value={secHint}
              onChange={(e) => setSecHint(e.target.value)}
              placeholder="Indice (optionnel) — pour t'aider si tu oublies"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-hover border border-border text-xs text-primary placeholder-muted outline-none focus:border-accent/50 transition-colors"
            />
            <p className="text-[10px] text-muted">Visible sur l'écran de verrouillage. N'y mets jamais le code lui-même.</p>
          </div>
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
          <input
            value={secHint}
            onChange={(e) => setSecHint(e.target.value)}
            placeholder="Indice (optionnel)"
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg bg-hover border border-border text-xs text-primary placeholder-muted outline-none focus:border-accent/50 transition-colors"
          />
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
      {secMode === "idle" && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-muted" />
            <div>
              <p className="text-xs text-secondary">Verrouillage automatique</p>
              <p className="text-[10px] text-muted">après inactivité</p>
            </div>
          </div>
          <select
            value={form.auto_lock_minutes}
            onChange={(e) => set("auto_lock_minutes", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50"
          >
            <option value={0}>Désactivé</option>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 heure</option>
          </select>
        </div>
      )}
    </Section>
  );

  // ── Contenus par catégorie ──────────────────────────────────────────────────

  const aiContent = (
    <>
      <Section title="Clés API & connexions">
        <ApiKeysPanel />
      </Section>

      <Section title="Intelligence artificielle">
        {/* Provider selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Fournisseur</label>
          <div className="flex flex-wrap gap-1.5">
            {(["ollama", "claude", "openai", "gemini", "mistral", "claude_cli"] as const).map((p) => (
              <button
                key={p}
                onClick={() => set("ai_provider", p)}
                className={`flex-1 min-w-[80px] py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                  form.ai_provider === p
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "bg-hover border-border text-muted hover:text-primary"
                }`}
              >
                {p === "ollama" ? "Ollama" : p === "claude" ? "Claude API" : p === "openai" ? "OpenAI" : p === "gemini" ? "Gemini" : p === "mistral" ? "Mistral" : "Claude CLI"}
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

        {/* Claude CLI fields */}
        {form.ai_provider === "claude_cli" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3.5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Terminal size={13} className="text-accent shrink-0" />
                <span className="text-xs font-semibold text-accent">Claude Code CLI</span>
              </div>
              <p className="text-[11px] text-secondary/80 leading-relaxed">
                Utilise le binaire <strong className="text-primary">claude</strong> installé sur ta machine via npm.
                Aucune clé API requise — utilise directement tes crédits Claude.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={checkClaudeCli}
                disabled={claudeCliChecking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover hover:bg-active border border-border text-xs text-secondary transition-colors disabled:opacity-50"
              >
                <RotateCcw size={11} className={claudeCliChecking ? "animate-spin" : ""} />
                {claudeCliChecking ? "Vérification…" : "Vérifier l'installation"}
              </button>
              {claudeCliStatus && (
                <span className={`flex items-center gap-1 text-[11px] font-medium ${claudeCliStatus.ok ? "text-green-500" : "text-red-400"}`}>
                  {claudeCliStatus.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {claudeCliStatus.msg}
                </span>
              )}
            </div>
            {claudeCliStatus && !claudeCliStatus.ok && (
              <p className="text-[10px] text-muted leading-relaxed">
                Installe Claude Code : <strong className="text-secondary font-mono">npm install -g @anthropic-ai/claude-code</strong><br />
                Puis connecte-toi avec : <strong className="text-secondary font-mono">claude</strong>
              </p>
            )}
          </div>
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
              Ce curseur modifie automatiquement les prompts de <strong className="text-amber-300">toutes les tâches</strong>. Ajuste-les individuellement dans la section <strong className="text-amber-300">Prompts</strong> pour un comportement optimal.
            </p>
          </div>
        </div>

        {/* Context window */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Historique de conversation</p>
            <p className="text-[10px] text-muted mt-0.5">Nombre de messages passés envoyés à l'IA</p>
          </div>
          <select value={form.context_messages} onChange={(e) => set("context_messages", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value={0}>Illimité</option>
            <option value={10}>10 messages</option>
            <option value={20}>20 messages</option>
            <option value={50}>50 messages</option>
          </select>
        </div>

        {/* Prompt intensity bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Consommation de tokens</p>
              <p className="text-[10px] text-muted mt-0.5">
                {INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.desc ?? "Longueur naturelle"}
              </p>
            </div>
            <span className={`text-[11px] font-semibold ${INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.activeClass.split(" ").find(c => c.startsWith("text-")) ?? "text-accent"}`}>
              {INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.label}
            </span>
          </div>
          <div className="flex gap-1">
            {INTENSITY_LEVELS.map((level) => {
              const active = (form.prompt_intensity ?? "medium") === level.key;
              return (
                <button
                  key={level.key}
                  onClick={() => set("prompt_intensity", level.key)}
                  title={level.desc}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-medium transition-all ${
                    active ? level.activeClass : "bg-hover border-border text-muted hover:text-secondary hover:border-border/80"
                  }`}
                >
                  <span className={active ? "" : "opacity-50"}>{level.icon}</span>
                  {level.label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );

  const dataContent = (
    <>
      <Section title="Sauvegarde">
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
    </>
  );

  const memoryContent = (
    <>
      <Section title="Mémoire IA">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Mémoire persistante</p>
            <p className="text-[10px] text-muted mt-0.5">Collecte le contexte de tes projets, sujets et habitudes</p>
          </div>
          <button
            role="switch"
            aria-checked={memoryEnabled}
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${memoryEnabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${memoryEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>

        {memoryEnabled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary">Graphe neuronal</p>
                <p className="text-[10px] text-muted mt-0.5">Visualise la mémoire sous forme de réseau de nœuds</p>
              </div>
              <button
                role="switch"
                aria-checked={memoryGraphEnabled}
                onClick={() => setMemoryGraphEnabled(!memoryGraphEnabled)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${memoryGraphEnabled ? "bg-accent" : "bg-border"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${memoryGraphEnabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-hover border border-border">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-secondary font-medium">Nœuds manuels</p>
                <p className="text-[10px] text-muted">{memoryNodes.length} enregistré{memoryNodes.length !== 1 ? "s" : ""}</p>
              </div>
              {memoryNodes.length > 0 && (
                <button
                  onClick={() => {
                    if (confirmClear) { clearMemoryNodes(); setConfirmClear(false); }
                    else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0 ${
                    confirmClear
                      ? "bg-red-400/15 border border-red-400/30 text-red-400"
                      : "bg-hover border border-border text-muted hover:text-red-400 hover:border-red-400/30"
                  }`}
                >
                  <TrashIcon size={10} />
                  {confirmClear ? "Confirmer la suppression" : "Vider"}
                </button>
              )}
            </div>
          </>
        )}
      </Section>
    </>
  );

  const appearanceContent = (
    <>
      <Section title="Apparence">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-secondary">Thème</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "light",    label: "Clair",   bg: "#f5f3ee", panel: "#e8e4db", accent: "#d97757", dark: false },
              { key: "dark",     label: "Sombre",  bg: "#242424", panel: "#303030", accent: "#d97757", dark: true  },
              { key: "midnight", label: "Minuit",  bg: "#0d1117", panel: "#1c2128", accent: "#818cf8", dark: true  },
              { key: "ink",      label: "Encre",   bg: "#0a0a0a", panel: "#171717", accent: "#e8b84b", dark: true  },
              { key: "foret",      label: "Forêt",      bg: "#0f1a14", panel: "#192620", accent: "#d97757", dark: true  },
              { key: "brume",      label: "Brume",      bg: "#eeecea", panel: "#dedad6", accent: "#5b7fa6", dark: false },
              { key: "sakura",     label: "Sakura",     bg: "#fdf6f0", panel: "#f1e2d6", accent: "#c97088", dark: false },
              { key: "crepuscule", label: "Crépuscule", bg: "#120d1e", panel: "#1f1535", accent: "#c084fc", dark: true  },
              { key: "ocean",      label: "Océan",      bg: "#071221", panel: "#0e2040", accent: "#22d3ee", dark: true  },
            ] as const).map(({ key, label, bg, panel, accent }) => {
              const active = theme === key;
              return (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                    active ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-border/60"
                  }`}
                  style={{ backgroundColor: bg }}
                  aria-label={`Thème ${label}`}
                >
                  <div className="w-full h-5 rounded-md" style={{ backgroundColor: panel }} />
                  <div className="w-4 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-[10px] font-medium" style={{ color: bg < "#888888" ? "#ffffff99" : "#00000099" }}>{label}</span>
                  {active && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor typography */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Police de l'éditeur</p>
            <p className="text-[10px] text-muted mt-0.5">Famille de caractères des notes</p>
          </div>
          <select value={form.editor_font_family} onChange={(e) => set("editor_font_family", e.target.value)}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value="system">Système</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Taille de la police</p>
            <p className="text-[10px] text-muted mt-0.5">Taille du texte dans l'éditeur</p>
          </div>
          <select value={form.editor_font_size} onChange={(e) => set("editor_font_size", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value={13}>Petite (13px)</option>
            <option value={15}>Normale (15px)</option>
            <option value={17}>Grande (17px)</option>
            <option value={19}>Très grande (19px)</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Largeur de l'éditeur</p>
            <p className="text-[10px] text-muted mt-0.5">Largeur max du contenu</p>
          </div>
          <select value={form.editor_max_width} onChange={(e) => set("editor_max_width", e.target.value)}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value="narrow">Étroit (600px)</option>
            <option value="normal">Normal (720px)</option>
            <option value="wide">Large (960px)</option>
            <option value="full">Pleine largeur</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Dé à 20 faces</p>
            <p className="text-[10px] text-muted mt-0.5">Panneau flottant draggable — écran de verrouillage et app</p>
          </div>
          <button
            role="switch"
            aria-checked={diceEnabled}
            onClick={() => {
              const next = !diceEnabled;
              setDiceEnabled(next);
              localStorage.setItem("natia_dice_enabled", next ? "1" : "0");
            }}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${diceEnabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${diceEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </Section>
    </>
  );

  const uninstallSection = (
    <>
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

  const promptsContent = (
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
                id={key} value={form[key] as string} onChange={(e) => set(key, e.target.value)} rows={rows}
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
    </>
  );

  const appContent = (
    <>
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

      <Section title="Développement">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Mode débogage</p>
            <p className="text-[10px] text-muted mt-0.5">Active l'onglet Activité dans le panneau IA — journalisation des requêtes</p>
          </div>
          <button
            role="switch"
            aria-checked={form.debug_mode}
            onClick={() => set("debug_mode", !form.debug_mode)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.debug_mode ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.debug_mode ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </Section>
    </>
  );

  const current = NAV.find((n) => n.key === cat) ?? NAV[0];

  // ── Layout : navigation latérale + contenu + footer ─────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border rounded-xl w-[880px] max-w-[95vw] h-[85vh] max-h-[720px] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-primary">Paramètres</h2>
          <button
            onClick={requestClose}
            aria-label="Fermer les paramètres"
            className="text-muted hover:text-primary transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Navigation latérale */}
          <nav className="w-56 shrink-0 border-r border-border flex flex-col bg-sidebar/40">
            <div className="p-3 pb-2 shrink-0">
              <div className="flex items-center gap-2 bg-hover rounded-lg px-2.5 py-1.5">
                <Search size={13} className="text-muted shrink-0" />
                <input
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                  placeholder="Chercher un réglage…"
                  aria-label="Chercher un réglage"
                  className="bg-transparent text-xs text-primary placeholder-muted outline-none w-full"
                />
                {navQuery && (
                  <button onClick={() => setNavQuery("")} aria-label="Effacer" className="text-muted hover:text-primary transition-colors shrink-0">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
              {filteredNav.length === 0 && (
                <p className="text-xs text-muted text-center py-4 px-2">Aucun réglage ne correspond</p>
              )}
              {filteredNav.map((item) => {
                const active = cat === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => selectCat(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      active
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-secondary hover:bg-hover hover:text-primary"
                    }`}
                  >
                    <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Contenu de la catégorie */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            <div className="pb-1 border-b border-border/50">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <span className="text-accent">{current.icon}</span>
                {current.label}
              </h3>
              <p className="text-xs text-muted mt-1">{current.desc}</p>
            </div>
            {cat === "appearance" && appearanceContent}
            {cat === "ai" && aiContent}
            {cat === "manual" && (
              <Section title="Manuel — faire fonctionner l'IA">
                <AiManual />
              </Section>
            )}
            {cat === "prompts" && promptsContent}
            {cat === "memory" && memoryContent}
            {cat === "security" && securitySection}
            {cat === "data" && <>{dataContent}{uninstallSection}</>}
            {cat === "app" && appContent}
            {cat === "stats" && (
              <Section title="Vue d'ensemble">
                <StatsPanel />
              </Section>
            )}
          </div>
        </div>

        {/* Footer : état des modifications + actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
          {closeAttempt ? (
            <>
              <span className="flex-1 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                ⚠ Modifications non sauvegardées — que faire ?
              </span>
              <button
                onClick={() => setCloseAttempt(false)}
                className="px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
              >
                Continuer l'édition
              </button>
              <button
                onClick={toggleSettings}
                className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-400/10 transition-colors"
              >
                Ignorer et fermer
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                Sauvegarder et fermer
              </button>
            </>
          ) : (
            <>
              <span className={`flex-1 text-xs transition-colors ${dirty ? "text-amber-700 dark:text-amber-300" : "text-muted/50"}`}>
                {dirty ? "● Modifications non sauvegardées" : "Aucune modification en attente"}
              </span>
              <button
                onClick={requestClose}
                className="px-4 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
              >
                {dirty ? "Annuler" : "Fermer"}
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty}
                className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40"
              >
                Sauvegarder
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

