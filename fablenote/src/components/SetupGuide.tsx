import React, { useEffect, useState } from "react";
import { create } from "zustand";
import { ArchiveRestore, BookOpen, Check, ChevronRight, Lock, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { getBackupConfig } from "../lib/autoBackup";
import { Settings } from "../types";
import { useT } from "../i18n";

// Guide de démarrage : affiché juste après l'acceptation des conditions (premier
// lancement, réinitialisation) et depuis Paramètres → Application. Chaque étape
// ouvre la bonne page des paramètres ; le guide revient quand on les referme.

export const useSetupGuide = create<{ open: boolean }>(() => ({ open: false }));
export const openSetupGuide = () => useSetupGuide.setState({ open: true });

type Cat = "security" | "ai" | "data" | "manual";

function aiReady(s: Settings): boolean {
  switch (s.ai_provider) {
    case "local": return !!s.local_model;
    case "claude": return !!s.claude_api_key;
    case "openai": return !!s.openai_api_key;
    case "gemini": return !!s.gemini_api_key;
    case "mistral": return !!s.mistral_api_key;
    case "claude_cli": return true;
    default: return false;
  }
}

export default function SetupGuide() {
  const t = useT();
  const open = useSetupGuide((s) => s.open);
  const { hasPassword, settings, showSettings, toggleSettings } = useStore();
  const [backupOn, setBackupOn] = useState(false);

  // Relu à chaque retour des paramètres : l'étape vient peut-être d'être faite.
  useEffect(() => {
    if (!open || showSettings) return;
    getBackupConfig().then(([c]) => setBackupOn(c.enabled)).catch(() => {});
  }, [open, showSettings]);

  if (!open || showSettings) return null;

  const goTo = (cat: Cat) => {
    localStorage.setItem("natia_settings_cat", cat);
    toggleSettings();
  };

  const steps: { icon: React.ReactNode; title: string; text: string; done: boolean; action: string; cat: Cat }[] = [
    {
      icon: <Lock size={15} />,
      title: t("Protéger vos notes"),
      text: t("Sans mot de passe, notes et clés API sont stockées en clair sur ce PC. Un mot de passe les chiffre (AES-256) et vous donne une clé de récupération à garder précieusement."),
      done: hasPassword,
      action: t("Activer un mot de passe"),
      cat: "security",
    },
    {
      icon: <Sparkles size={15} />,
      title: t("Choisir une IA"),
      text: t("L'IA intégrée s'installe en un clic et tourne sur ce PC, sans rien envoyer sur internet. Vous pouvez aussi utiliser Ollama ou une clé API (Claude, OpenAI, Gemini, Mistral)."),
      done: aiReady(settings),
      action: t("Configurer l'IA"),
      cat: "ai",
    },
    {
      icon: <ArchiveRestore size={15} />,
      title: t("Sauvegarder automatiquement"),
      text: t("Une copie de toutes vos notes, chaque jour ou chaque semaine, dans le dossier de votre choix : OneDrive, clé USB, disque externe…"),
      done: backupOn,
      action: t("Mettre en place"),
      cat: "data",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[520px] max-w-[95vw] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-base font-semibold text-primary">{t("Bien démarrer avec NATIA")}</h2>
          <p className="text-xs text-muted mt-0.5">
            {t("Trois réglages conseillés, chacun facultatif · {n}/3 faits", { n: doneCount })}
          </p>
        </div>

        <div className="px-6 pb-2 flex flex-col gap-2.5 overflow-y-auto">
          {steps.map((s, i) => (
            <div key={s.cat} className={`flex gap-3 rounded-xl border px-4 py-3 ${s.done ? "border-green-500/25 bg-green-500/5" : "border-border bg-hover/50"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${s.done ? "bg-green-500/15 text-green-500" : "bg-accent/15 text-accent"}`}>
                {s.done ? <Check size={15} /> : s.icon}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <p className="text-sm font-medium text-primary">{i + 1}. {s.title}</p>
                <p className="text-xs text-secondary/80 leading-relaxed">{s.text}</p>
                {s.done ? (
                  <button onClick={() => goTo(s.cat)} className="self-start text-[11px] text-green-500 hover:underline underline-offset-2">
                    {t("Fait ✓ · modifier")}
                  </button>
                ) : (
                  <button
                    onClick={() => goTo(s.cat)}
                    className="self-start flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
                  >
                    {s.action}<ChevronRight size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => goTo("manual")} className="self-start flex items-center gap-1.5 text-[11px] text-muted hover:text-primary transition-colors mt-1">
            <BookOpen size={11} />{t("Tout est expliqué pas à pas dans Paramètres → Manuel")}
          </button>
        </div>

        <div className="px-6 py-4 shrink-0">
          <button
            onClick={() => useSetupGuide.setState({ open: false })}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            {doneCount === 3 ? t("C'est parti") : t("Terminer, je verrai plus tard")}
          </button>
          <p className="text-[10px] text-muted text-center mt-2">{t("Ce guide reste accessible dans Paramètres → Application.")}</p>
        </div>
      </div>
    </div>
  );
}
