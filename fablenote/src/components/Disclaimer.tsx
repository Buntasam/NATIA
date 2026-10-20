import { useState } from "react";
import { AlertTriangle, BookOpen, Cpu, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { msg, useT } from "../i18n";

export const DISCLAIMER_KEY = "natia_disclaimer_v2";

// Repères indicatifs : le besoin réel dépend aussi de la longueur des notes.
const MODEL_TIERS = [
  { machine: msg("PC standard, 8 Go de RAM, sans carte graphique"), size: msg("petits modèles (1 à 2 milliards de paramètres)"), models: ["gemma3:1b", "qwen2.5:1.5b"] },
  { machine: msg("16 Go de RAM"), size: msg("modèles moyens (3 à 4 milliards)"), models: ["phi4-mini", "llama3.2:3b", "gemma3:4b"] },
  { machine: msg("Carte graphique avec 8 Go de mémoire vidéo ou plus"), size: msg("modèles plus capables (7 à 8 milliards)"), models: ["mistral", "llama3.1:8b"] },
];

export default function Disclaimer() {
  const { toggleSettings } = useStore();
  const t = useT();
  const [dontShow, setDontShow] = useState(false);
  const [visible] = useState(() => !localStorage.getItem(DISCLAIMER_KEY));
  const [closed, setClosed] = useState(false);

  if (!visible || closed) return null;

  const close = () => {
    if (dontShow) localStorage.setItem(DISCLAIMER_KEY, "1");
    setClosed(true);
  };

  const openSettings = (cat: "security" | "ai" | "app" | "manual") => {
    close();
    localStorage.setItem("natia_settings_cat", cat);
    toggleSettings();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[500px] max-w-[95vw] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 shrink-0">
          <div className="w-11 h-11 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={22} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary leading-snug">{t("Application en développement")}</h2>
            <p className="text-xs text-muted mt-0.5">{t("NATIA · Version bêta — à usage personnel uniquement")}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-2 flex flex-col gap-3 text-sm text-secondary leading-relaxed overflow-y-auto">
          <p>
            {t("NATIA est en développement actif : des bugs ou comportements inattendus peuvent survenir, et les suggestions de l'IA (tri, corrections, résumés) doivent toujours être vérifiées avant d'être appliquées.")}
          </p>
          <p>
            {t("Vos notes sont stockées")} <strong className="text-primary">{t("localement")}</strong> {t("sur votre machine — sauvegardez-les régulièrement. L'auteur ne saurait être tenu responsable d'une perte de données.")}
          </p>

          {/* Encart chiffrement — le point le plus important */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-amber-600/30 bg-amber-500/8 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("Vos notes ne sont pas chiffrées par défaut")}</span>
            </div>
            <p className="text-xs text-secondary/80 leading-relaxed">
              {t("Sans mot de passe activé, notes, titres, tags et clés API sont stockés")} <strong className="text-primary">{t("en clair")}</strong> {t("dans la base locale. Activez un mot de passe pour chiffrer l'ensemble de vos données en")} <strong className="text-primary">AES-256-GCM</strong>.
            </p>
            <button
              onClick={() => openSettings("security")}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-600/30 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 text-xs font-medium transition-colors"
            >
              <Lock size={11} />
              {t("Activer un mot de passe")}
            </button>
          </div>

          {/* Encart IA locale */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-red-500 shrink-0" />
              <span className="text-xs font-semibold text-red-500">{t("IA en local : installez Ollama et choisissez un modèle adapté à votre PC")}</span>
            </div>
            <p className="text-xs text-secondary/80 leading-relaxed">
              {t("L'IA locale n'est pas incluse dans NATIA : installez")} <strong className="text-primary">Ollama</strong> {t("depuis")} <strong className="text-primary">ollama.com</strong>{t(", puis téléchargez un modèle, par exemple avec")} <code className="text-[10px] bg-red-500/10 px-1 rounded">ollama pull gemma3:1b</code>.
            </p>
            <ul className="text-xs text-secondary/80 leading-relaxed flex flex-col gap-1">
              {MODEL_TIERS.map((tier) => (
                <li key={tier.machine} className="flex flex-col">
                  <span><strong className="text-primary">{t(tier.machine)}</strong> → {t(tier.size)}</span>
                  <span className="flex flex-wrap gap-1 mt-0.5">
                    {tier.models.map((m) => (
                      <code key={m} className="text-[10px] bg-red-500/10 px-1 rounded">{m}</code>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-red-500/90 leading-relaxed">
              {t("Un modèle trop gros pour votre machine peut mettre plusieurs minutes à répondre, voire ralentir tout le PC.")}
            </p>
            <p className="text-xs text-secondary/80 leading-relaxed">
              <strong className="text-primary">{t("Sans PC puissant")}</strong>{t(", utilisez plutôt une IA en ligne : une clé API Claude, OpenAI, Gemini ou Mistral (Gemini et Mistral ont une offre gratuite), ou Claude Code CLI si vous avez un abonnement Claude. Le texte des notes envoyées à l'IA est alors transmis à ce fournisseur.")}
            </p>
            <button
              onClick={() => openSettings("ai")}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-500 text-xs font-medium transition-colors"
            >
              <Sparkles size={11} />
              {t("Configurer l'IA")}
            </button>
            <button
              onClick={() => openSettings("manual")}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover hover:bg-active border border-border text-secondary text-xs font-medium transition-colors"
            >
              <BookOpen size={11} />
              {t("Guide d'installation pas à pas (Paramètres → Manuel)")}
            </button>
          </div>

          <p className="text-xs text-muted border-t border-border pt-3">
            {t("En continuant, vous acceptez que cette application est fournie « en l'état » (as-is), sans garantie d'aucune sorte. L'auteur décline toute responsabilité pour tout dommage résultant de son utilisation.")}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 flex flex-col gap-3 mt-auto shrink-0">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-secondary">{t("Ne plus afficher ce message au démarrage")}</span>
          </label>
          <button
            onClick={close}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            {t("J'ai compris — Continuer")}
          </button>
          <p className="text-[10px] text-muted text-center">
            {t("Signaler un bug ou une idée :")} <button onClick={() => openSettings("app")} className="text-accent hover:underline underline-offset-2">{t("Paramètres → Application")}</button>
          </p>
        </div>
      </div>
    </div>
  );
}
