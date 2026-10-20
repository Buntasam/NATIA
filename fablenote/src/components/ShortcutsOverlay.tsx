import { Keyboard, X } from "lucide-react";
import { msg, useT } from "../i18n";

// Fiche récapitulative des raccourcis clavier (Ctrl+/)

const GROUPS: { title: string; items: { keys: string; label: string }[] }[] = [
  {
    title: msg("Navigation"),
    items: [
      { keys: "Ctrl+P", label: msg("Ouvrir une note (palette)") },
      { keys: msg("Ctrl+P puis >"), label: msg("Exécuter une commande") },
      { keys: "Alt+← / Alt+→", label: msg("Note précédente / suivante") },
      { keys: "Ctrl+Shift+F", label: msg("Recherche globale (barre latérale)") },
      { keys: msg("Échap"), label: msg("Fermer le panneau ouvert") },
    ],
  },
  {
    title: msg("Notes"),
    items: [
      { keys: "Ctrl+N", label: msg("Nouvelle note") },
      { keys: "Ctrl+S", label: msg("Sauvegarder") },
      { keys: "Ctrl+F", label: msg("Chercher dans la note") },
      { keys: "Ctrl+H", label: msg("Chercher & remplacer") },
    ],
  },
  {
    title: msg("Panneaux"),
    items: [
      { keys: "Ctrl+Shift+A", label: msg("Panneau IA") },
      { keys: "Ctrl+Shift+H", label: msg("Historique des versions") },
      { keys: "Ctrl+G", label: msg("Mémoire IA (graphe)") },
      { keys: "Ctrl+,", label: msg("Paramètres") },
      { keys: "Ctrl+/", label: msg("Cette fiche") },
    ],
  },
  {
    title: msg("Dans l'éditeur"),
    items: [
      { keys: "/", label: msg("Menu d'insertion (titres, listes, tableau…)") },
      { keys: "[[", label: msg("Lien vers une note (wikilink)") },
      { keys: "Ctrl+B / I / U", label: msg("Gras / italique / souligné") },
    ],
  },
];

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border sticky top-0 bg-panel">
          <Keyboard size={15} className="text-accent" />
          <span className="text-sm font-medium text-primary flex-1">{t("Raccourcis clavier")}</span>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-muted hover:text-primary transition-colors p-1">
            <X size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 p-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{t(group.title)}</p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center gap-3">
                    <kbd className="shrink-0 text-[11px] font-mono text-secondary bg-hover border border-border rounded px-1.5 py-0.5">
                      {t(item.keys)}
                    </kbd>
                    <span className="text-xs text-secondary">{t(item.label)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
