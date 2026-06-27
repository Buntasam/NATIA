import { CheckCheck } from "lucide-react";
import * as Diff from "diff";

interface Props {
  title: string;
  subtitle: string;
  applyLabel: string;
  original: string;
  proposed: string;
  html: string;
  onApply: (html: string) => void;
  onCancel: () => void;
}

export function CorrectionModal({ title, subtitle, applyLabel, original, proposed, html, onApply, onCancel }: Props) {
  const diffParts = Diff.diffWordsWithSpace(original, proposed);
  const hasChanges = diffParts.some((p) => p.added || p.removed);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[680px] max-h-[80vh] flex flex-col shadow-2xl">

        <div className="px-5 py-4 border-b border-border flex items-start gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <CheckCheck size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <p className="text-xs text-muted mt-0.5">
              {hasChanges ? subtitle : "Aucune modification détectée dans le texte"}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {diffParts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? "bg-green-500/20 text-green-400 rounded"
                    : part.removed
                    ? "bg-red-500/15 text-red-400 line-through rounded"
                    : "text-secondary"
                }
              >
                {part.value}
              </span>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between shrink-0">
          <p className="text-xs text-muted">
            {hasChanges
              ? `${diffParts.filter((p) => p.added).length} ajout(s) · ${diffParts.filter((p) => p.removed).length} suppression(s)`
              : "Le texte est identique"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-hover hover:bg-active text-secondary hover:text-primary text-sm transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => onApply(html)}
              disabled={!hasChanges}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {applyLabel}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
