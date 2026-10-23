import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, FileText, HardDrive, ShieldCheck, Sparkles } from "lucide-react";
import { trError, useT } from "../../i18n";
import LanguagePicker from "../LanguagePicker";
import LegalDocs from "./LegalDocs";
import { LEGAL_VERSION } from "./legalContent";

/**
 * Acceptation des conditions d'utilisation et de la politique de confidentialité :
 * au premier lancement, après une réinitialisation, et quand LEGAL_VERSION change.
 * Rien d'autre n'est affiché ni envoyé sur le réseau avant l'acceptation.
 */
export default function TermsGate({ updated, onAccepted }: { updated: boolean; onAccepted: () => void }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    try {
      await invoke("accept_terms", { version: LEGAL_VERSION });
      onAccepted();
    } catch (e) {
      setError(trError(e));
    }
  };

  const points = [
    { icon: <HardDrive size={13} />, text: t("Vos notes restent sur votre ordinateur. NATIA ne collecte rien : pas de compte, pas de statistiques, pas de publicité.") },
    { icon: <Sparkles size={13} />, text: t("Une IA en ligne (Claude, OpenAI, Gemini, Mistral) reçoit le texte que vous lui soumettez. L'IA intégrée et Ollama restent sur votre PC.") },
    { icon: <ShieldCheck size={13} />, text: t("Version bêta fournie en l'état : faites des sauvegardes et gardez votre mot de passe et votre clé de récupération.") },
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-base">
      <div className="bg-panel border border-border rounded-xl w-[640px] max-w-[95vw] max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 shrink-0">
          <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-primary leading-snug">
              {updated ? t("Les conditions de NATIA ont changé") : t("Bienvenue dans NATIA")}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {updated
                ? t("Lisez et acceptez la nouvelle version pour continuer.")
                : t("Avant de commencer, lisez et acceptez les conditions d'utilisation et la politique de confidentialité.")}
            </p>
          </div>
          <LanguagePicker />
        </div>

        <div className="px-6 pb-3 flex flex-col gap-4 overflow-y-auto">
          <ul className="flex flex-col gap-2">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-secondary leading-relaxed">
                <span className="text-accent shrink-0 mt-0.5">{p.icon}</span>{p.text}
              </li>
            ))}
          </ul>
          <LegalDocs />
        </div>

        <div className="px-6 py-4 flex flex-col gap-3 border-t border-border shrink-0">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-accent shrink-0"
            />
            <span className="text-sm text-secondary">{t("J'ai lu et j'accepte les conditions d'utilisation et la politique de confidentialité.")}</span>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => invoke("exit_app").catch(() => {})}
              className="px-4 py-2.5 rounded-lg bg-hover border border-border text-sm text-secondary hover:text-primary transition-colors"
            >
              {t("Refuser et quitter")}
            </button>
            <button
              onClick={accept}
              disabled={!checked}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={14} />{t("Accepter et continuer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
