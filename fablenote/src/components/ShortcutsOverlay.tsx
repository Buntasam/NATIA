import { Keyboard, X } from "lucide-react";

// Fiche récapitulative des raccourcis clavier (Ctrl+/)

const GROUPS: { title: string; items: { keys: string; label: string }[] }[] = [
  {
    title: "Navigation",
    items: [
      { keys: "Ctrl+P", label: "Ouvrir une note (palette)" },
      { keys: "Ctrl+P puis >", label: "Exécuter une commande" },
      { keys: "Alt+← / Alt+→", label: "Note précédente / suivante" },
      { keys: "Ctrl+Shift+F", label: "Recherche globale (sidebar)" },
      { keys: "Échap", label: "Fermer le panneau ouvert" },
    ],
  },
  {
    title: "Notes",
    items: [
      { keys: "Ctrl+N", label: "Nouvelle note" },
      { keys: "Ctrl+S", label: "Sauvegarder" },
      { keys: "Ctrl+F", label: "Chercher dans la note" },
      { keys: "Ctrl+H", label: "Chercher & remplacer" },
    ],
  },
  {
    title: "Panneaux",
    items: [
      { keys: "Ctrl+Shift+A", label: "Panneau IA" },
      { keys: "Ctrl+Shift+H", label: "Historique des versions" },
      { keys: "Ctrl+G", label: "Mémoire IA (graphe)" },
      { keys: "Ctrl+,", label: "Paramètres" },
      { keys: "Ctrl+/", label: "Cette fiche" },
    ],
  },
  {
    title: "Dans l'éditeur",
    items: [
      { keys: "/", label: "Menu d'insertion (titres, listes, tableau…)" },
      { keys: "[[", label: "Lien vers une note (wikilink)" },
      { keys: "Ctrl+B / I / U", label: "Gras / italique / souligné" },
    ],
  },
];

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border sticky top-0 bg-panel">
          <Keyboard size={15} className="text-accent" />
          <span className="text-sm font-medium text-primary flex-1">Raccourcis clavier</span>
          <button onClick={onClose} aria-label="Fermer" className="text-muted hover:text-primary transition-colors p-1">
            <X size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 p-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{group.title}</p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center gap-3">
                    <kbd className="shrink-0 text-[11px] font-mono text-secondary bg-hover border border-border rounded px-1.5 py-0.5">
                      {item.keys}
                    </kbd>
                    <span className="text-xs text-secondary">{item.label}</span>
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
