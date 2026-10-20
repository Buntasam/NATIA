import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

// Affiche la clé de récupération une seule fois : elle n'est stockée nulle part en clair.
export default function RecoveryCodeDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papiers indisponible : l'utilisateur recopie à la main */ }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <KeyRound size={20} className="text-accent mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-primary">Votre clé de récupération</h2>
            <p className="text-sm text-muted mt-1">
              Notez-la sur papier ou dans un gestionnaire de mots de passe. Elle permet de rouvrir vos notes si vous oubliez
              le mot de passe, réinstallez Windows ou changez de PC.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-hover border border-border">
          <code className="flex-1 text-center font-mono text-base tracking-wider text-primary select-all break-all">{code}</code>
          <button onClick={copy} title="Copier" aria-label="Copier la clé" className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-active transition-colors">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>

        <p className="text-xs text-red-400 leading-relaxed">
          Elle ne sera plus jamais affichée. Ne l'enregistrez pas dans une note NATIA : elle serait chiffrée avec le reste.
          Toute personne qui la possède, avec une copie de vos données, peut lire vos notes.
        </p>

        <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer select-none">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-accent" />
          J'ai noté ma clé de récupération
        </label>

        <button
          onClick={onClose}
          disabled={!saved}
          className="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          Terminer
        </button>
      </div>
    </div>
  );
}
