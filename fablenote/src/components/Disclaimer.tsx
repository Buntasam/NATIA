import { useState } from "react";
import { AlertTriangle, Lock, ShieldAlert } from "lucide-react";
import { useStore } from "../store";

const KEY = "natia_disclaimer_v1";

export default function Disclaimer() {
  const { toggleSettings } = useStore();
  const [dontShow, setDontShow] = useState(false);
  const [visible] = useState(() => !localStorage.getItem(KEY));
  const [closed, setClosed] = useState(false);

  if (!visible || closed) return null;

  const close = () => {
    if (dontShow) localStorage.setItem(KEY, "1");
    setClosed(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[460px] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 shrink-0">
          <div className="w-11 h-11 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={22} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary leading-snug">Application en développement</h2>
            <p className="text-xs text-muted mt-0.5">NATIA · Version bêta — à usage personnel uniquement</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-2 flex flex-col gap-3 text-sm text-secondary leading-relaxed overflow-y-auto">
          <p>
            NATIA est en développement actif : des bugs ou comportements inattendus peuvent survenir, et les suggestions de l'IA (tri, corrections, résumés) doivent toujours être vérifiées avant d'être appliquées.
          </p>
          <p>
            Vos notes sont stockées <strong className="text-primary">localement</strong> sur votre machine — sauvegardez-les régulièrement. L'auteur ne saurait être tenu responsable d'une perte de données.
          </p>

          {/* Encart chiffrement — le point le plus important */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-amber-600/30 bg-amber-500/8 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Vos notes ne sont pas chiffrées par défaut</span>
            </div>
            <p className="text-xs text-secondary/80 leading-relaxed">
              Sans mot de passe activé, notes, titres, tags et clés API sont stockés <strong className="text-primary">en clair</strong> dans la base locale. Activez un mot de passe pour chiffrer l'ensemble de vos données en <strong className="text-primary">AES-256-GCM</strong>.
            </p>
            <button
              onClick={() => { close(); toggleSettings(); }}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-600/30 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 text-xs font-medium transition-colors"
            >
              <Lock size={11} />
              Activer un mot de passe
            </button>
          </div>

          <p className="text-xs text-muted border-t border-border pt-3">
            En continuant, vous acceptez que cette application est fournie « en l'état » (as-is), sans garantie d'aucune sorte. L'auteur décline toute responsabilité pour tout dommage résultant de son utilisation.
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
            <span className="text-sm text-secondary">Ne plus afficher ce message au démarrage</span>
          </label>
          <button
            onClick={close}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            J'ai compris — Continuer
          </button>
          <p className="text-[10px] text-muted text-center">
            Signaler un bug ou une idée : <button onClick={() => { close(); localStorage.setItem("natia_settings_cat", "app"); toggleSettings(); }} className="text-accent hover:underline underline-offset-2">Paramètres → Application</button>
          </p>
        </div>
      </div>
    </div>
  );
}
