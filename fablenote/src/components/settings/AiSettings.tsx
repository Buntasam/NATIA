import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, CheckCircle2, ChevronDown, Eye, EyeOff, Leaf, Minus, RotateCcw, Terminal, TrendingUp, XCircle, Zap } from "lucide-react";
import { Settings as SettingsType } from "../../types";
import ApiKeysPanel from "../ApiKeysPanel";
import { Field, Input, Section } from "./SettingsWidgets";
import { PROMPT_PRESETS, TEMP_PRESET_MAP } from "./promptPresets";
import { SettingsFormProps } from "./types";
import { msg, trError, useT } from "../../i18n";
import { promptIn, usePromptLang } from "../../i18n/prompts";
import LocalAiPanel from "./LocalAiPanel";

const INTENSITY_LEVELS: {
  key: "eco" | "low" | "medium" | "high" | "max";
  label: string;
  desc: string;
  icon: React.ReactNode;
  activeClass: string;
}[] = [
  { key: "eco",    label: msg("Éco"),   desc: msg("1-2 phrases · minimal"),      icon: <Leaf size={11} />,       activeClass: "bg-green-400/15 border-green-400/50 text-green-400"   },
  { key: "low",    label: msg("Court"), desc: msg("3-5 phrases · concis"),       icon: <Minus size={11} />,      activeClass: "bg-teal-400/15 border-teal-400/50 text-teal-400"       },
  { key: "medium", label: msg("Moyen@@intensité"), desc: msg("Longueur naturelle"),         icon: <Activity size={11} />,   activeClass: "bg-accent/15 border-accent/50 text-accent"             },
  { key: "high",   label: msg("Fort"),  desc: msg("Développé avec exemples"),    icon: <TrendingUp size={11} />, activeClass: "bg-orange-400/15 border-orange-400/50 text-orange-400" },
  { key: "max",    label: msg("Maxi"),  desc: msg("Exhaustif · structuré"),      icon: <Zap size={11} />,        activeClass: "bg-red-400/15 border-red-400/50 text-red-400"          },
];

export default function AiSettings({ form, set, setForm }: SettingsFormProps) {
  const t = useT();
  const lang = usePromptLang();
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
      setClaudeCliStatus({ ok: true, msg: v || t("Installé ✓") });
    } catch (e) {
      setClaudeCliStatus({ ok: false, msg: trError(e) });
    } finally {
      setClaudeCliChecking(false);
    }
  };
  return (
    <>
      <Section title={t("IA intégrée (recommandée)")}>
        <LocalAiPanel form={form} set={set} />
      </Section>

      <Section title={t("Clés API & connexions")}>
        <ApiKeysPanel />
      </Section>

      <Section title={t("Intelligence artificielle")}>
        {/* Provider selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">{t("Fournisseur")}</label>
          <div className="flex flex-wrap gap-1.5">
            {(["local", "ollama", "claude", "openai", "gemini", "mistral", "claude_cli"] as const).map((p) => (
              <button
                key={p}
                onClick={() => set("ai_provider", p)}
                className={`flex-1 min-w-[80px] py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                  form.ai_provider === p
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "bg-hover border-border text-muted hover:text-primary"
                }`}
              >
                {p === "local" ? t("IA intégrée") : p === "ollama" ? "Ollama" : p === "claude" ? "Claude API" : p === "openai" ? "OpenAI" : p === "gemini" ? "Gemini" : p === "mistral" ? "Mistral" : "Claude CLI"}
              </button>
            ))}
          </div>
        </div>

        {/* Ollama fields */}
        {form.ai_provider === "ollama" && (
          <>
            <Field label={t("URL serveur Ollama")} id="ollama_url">
              <Input id="ollama_url" value={form.ollama_url} onChange={(v) => set("ollama_url", v)} placeholder="http://localhost:11434" />
              <p className="text-[10px] text-muted mt-1">{t("Serveur Ollama local. Modifie uniquement si tu as changé le port.")}</p>
            </Field>
            <Field label={t("Modèle par défaut")} id="default_model">
              <Input id="default_model" value={form.default_model} onChange={(v) => set("default_model", v)} placeholder="gemma3:1b, mistral…" />
              <p className="text-[10px] text-muted mt-1">{t("Nom exact du modèle installé sur ton serveur Ollama.")}</p>
            </Field>
            <p className="text-[10px] text-amber-500/80 leading-relaxed -mt-1">
              {t("Sur du matériel standard, les modèles locaux peuvent être très lents sur les notes longues. Modèles rapides recommandés :")} <code className="text-accent text-[10px] bg-accent/10 px-1 rounded">gemma3:1b</code> <code className="text-accent text-[10px] bg-accent/10 px-1 rounded">phi4-mini</code> <code className="text-accent text-[10px] bg-accent/10 px-1 rounded">qwen2.5:1.5b</code>.
            </p>
          </>
        )}

        {/* Claude fields */}
        {form.ai_provider === "claude" && (
          <>
            <Field label={t("Clé API Anthropic")} id="claude_api_key">
              <div className="relative">
                <Input id="claude_api_key" value={form.claude_api_key} onChange={(v) => set("claude_api_key", v)} placeholder="sk-ant-api03-…" type={showClaudeKey ? "text" : "password"} />
                <button onClick={() => setShowClaudeKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showClaudeKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{t("Crée ta clé sur")} <strong className="text-secondary">console.anthropic.com</strong> → API Keys.</p>
            </Field>
            <Field label={t("Modèle")} id="claude_model">
              <div className="relative">
                <select id="claude_model" value={form.claude_model} onChange={(e) => set("claude_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — {t("rapide · économique")}</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — {t("équilibré · recommandé")}</option>
                  <option value="claude-opus-4-8">Claude Opus 4.8 — {t("puissant · plus lent")}</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* OpenAI fields */}
        {form.ai_provider === "openai" && (
          <>
            <Field label={t("Clé API OpenAI")} id="openai_api_key">
              <div className="relative">
                <Input id="openai_api_key" value={form.openai_api_key} onChange={(v) => set("openai_api_key", v)} placeholder="sk-…" type={showOpenAiKey ? "text" : "password"} />
                <button onClick={() => setShowOpenAiKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showOpenAiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{t("Crée ta clé sur")} <strong className="text-secondary">platform.openai.com</strong> → API Keys.</p>
            </Field>
            <Field label={t("Modèle")} id="openai_model">
              <div className="relative">
                <select id="openai_model" value={form.openai_model} onChange={(e) => set("openai_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="gpt-4o-mini">GPT-4o Mini — {t("rapide · économique")}</option>
                  <option value="gpt-4o">GPT-4o — {t("équilibré · recommandé")}</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo — {t("puissant")}</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* Gemini fields */}
        {form.ai_provider === "gemini" && (
          <>
            <Field label={t("Clé API Google")} id="gemini_api_key">
              <div className="relative">
                <Input id="gemini_api_key" value={form.gemini_api_key} onChange={(v) => set("gemini_api_key", v)} placeholder="AIza…" type={showGeminiKey ? "text" : "password"} />
                <button onClick={() => setShowGeminiKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showGeminiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{t("Crée ta clé sur")} <strong className="text-secondary">aistudio.google.com</strong> → Get API Key. {t("Offre gratuite généreuse.")}</p>
            </Field>
            <Field label={t("Modèle")} id="gemini_model">
              <div className="relative">
                <select id="gemini_model" value={form.gemini_model} onChange={(e) => set("gemini_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash — {t("rapide · recommandé")}</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash — {t("économique")}</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro — {t("puissant")}</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </Field>
          </>
        )}

        {/* Mistral fields */}
        {form.ai_provider === "mistral" && (
          <>
            <Field label={t("Clé API Mistral")} id="mistral_api_key">
              <div className="relative">
                <Input id="mistral_api_key" value={form.mistral_api_key} onChange={(v) => set("mistral_api_key", v)} placeholder="…" type={showMistralKey ? "text" : "password"} />
                <button onClick={() => setShowMistralKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                  {showMistralKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{t("Crée ta clé sur")} <strong className="text-secondary">console.mistral.ai</strong> → API Keys.</p>
            </Field>
            <Field label={t("Modèle")} id="mistral_model">
              <div className="relative">
                <select id="mistral_model" value={form.mistral_model} onChange={(e) => set("mistral_model", e.target.value)}
                  className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none appearance-none cursor-pointer">
                  <option value="mistral-small-latest">Mistral Small — {t("rapide · économique")}</option>
                  <option value="mistral-medium-latest">Mistral Medium — {t("équilibré")}</option>
                  <option value="mistral-large-latest">Mistral Large — {t("puissant")}</option>
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
                {t("Utilise la commande")} <strong className="text-primary">claude</strong> {t("installée sur ta machine via npm. Aucune clé API requise — utilise directement ton abonnement Claude.")}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={checkClaudeCli}
                disabled={claudeCliChecking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover hover:bg-active border border-border text-xs text-secondary transition-colors disabled:opacity-50"
              >
                <RotateCcw size={11} className={claudeCliChecking ? "animate-spin" : ""} />
                {claudeCliChecking ? t("Vérification…") : t("Vérifier l'installation")}
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
                {t("Installe Claude Code :")} <strong className="text-secondary font-mono">npm install -g @anthropic-ai/claude-code</strong><br />
                {t("Puis connecte-toi avec :")} <strong className="text-secondary font-mono">claude</strong>
              </p>
            )}
          </div>
        )}

        {/* Temperature (all providers) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-secondary">{t("Température")}</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{t("Froide")}</span>
              <span className="text-xs font-mono text-accent w-7 text-center">{form.temperature.toFixed(1)}</span>
              <span className="text-[10px] text-muted">{t("Chaude")}</span>
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
                  if (preset) (updated as Record<string, unknown>)[key as string] = promptIn(preset.value, lang);
                }
                return updated;
              });
            }}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted mt-0.5">
            <span>0.0 — {t("Déterministe")}</span>
            <span>0.7 — {t("Équilibré")}</span>
            <span>2.0 — {t("Créatif")}</span>
          </div>
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20">
            <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
            <p className="text-[10px] text-amber-300/90 leading-relaxed">
              {t("Ce curseur modifie automatiquement les prompts de")} <strong className="text-amber-300">{t("toutes les tâches")}</strong>{t(". Ajuste-les individuellement dans la section")} <strong className="text-amber-300">{t("Prompts")}</strong> {t("pour un comportement optimal.")}
            </p>
          </div>
        </div>

        {/* Context window */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">{t("Historique de conversation")}</p>
            <p className="text-[10px] text-muted mt-0.5">{t("Nombre de messages passés envoyés à l'IA")}</p>
          </div>
          <select value={form.context_messages} onChange={(e) => set("context_messages", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value={0}>{t("Illimité")}</option>
            <option value={10}>{t("{n} messages", { n: 10 })}</option>
            <option value={20}>{t("{n} messages", { n: 20 })}</option>
            <option value={50}>{t("{n} messages", { n: 50 })}</option>
          </select>
        </div>

        {/* Prompt intensity bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">{t("Consommation de tokens")}</p>
              <p className="text-[10px] text-muted mt-0.5">
                {t(INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.desc ?? "Longueur naturelle")}
              </p>
            </div>
            <span className={`text-[11px] font-semibold ${INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.activeClass.split(" ").find(c => c.startsWith("text-")) ?? "text-accent"}`}>
              {t(INTENSITY_LEVELS.find(l => l.key === (form.prompt_intensity ?? "medium"))?.label ?? "")}
            </span>
          </div>
          <div className="flex gap-1">
            {INTENSITY_LEVELS.map((level) => {
              const active = (form.prompt_intensity ?? "medium") === level.key;
              return (
                <button
                  key={level.key}
                  onClick={() => set("prompt_intensity", level.key)}
                  title={t(level.desc)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-medium transition-all ${
                    active ? level.activeClass : "bg-hover border-border text-muted hover:text-secondary hover:border-border/80"
                  }`}
                >
                  <span className={active ? "" : "opacity-50"}>{level.icon}</span>
                  {t(level.label)}
                </button>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );
}
