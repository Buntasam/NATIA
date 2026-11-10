import { useState } from "react";
import { Check, Clipboard, Loader2, Stethoscope, X } from "lucide-react";
import { buildDiagnostics } from "../../lib/diagnostics";
import { useT } from "../../i18n";

/** Mode débogage : diagnostic à relire, puis copier pour un signalement de bug. */
export default function DiagnosticsButton() {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const open = async () => {
    setBusy(true);
    try { setText(await buildDiagnostics()); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-secondary">{t("Diagnostic")}</p>
          <p className="text-[10px] text-muted mt-0.5">{t("Version, état de l'IA, de la synchronisation et dernières erreurs, à joindre à un signalement de bug. Sans le contenu de vos notes.")}</p>
        </div>
        <button
          onClick={open}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Stethoscope size={12} />}
          {t("Copier le diagnostic")}
        </button>
      </div>

      {text !== null && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Diagnostic")}>
          <div className="fixed inset-0 bg-black/40" onClick={() => setText(null)} />
          <div className="relative z-10 w-[640px] max-w-[94vw] max-h-[80vh] bg-panel border border-border rounded-xl shadow-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Stethoscope size={15} className="text-accent" />
              <span className="text-sm font-semibold text-primary flex-1">{t("Diagnostic")}</span>
              <button onClick={() => setText(null)} aria-label={t("Fermer")} className="p-1 text-muted hover:text-primary"><X size={14} /></button>
            </div>
            <p className="text-[11px] text-muted">{t("Relisez avant de l'envoyer : les chemins, e-mails et clés sont masqués, mais un message d'erreur peut citer un nom de fichier.")}</p>
            <pre className="flex-1 overflow-auto text-[11px] font-mono bg-base border border-border rounded-lg p-3 text-secondary whitespace-pre-wrap select-text">{text}</pre>
            <button
              onClick={copy}
              className="self-end flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover"
            >
              {copied ? <Check size={13} /> : <Clipboard size={13} />}
              {copied ? t("Copié !") : t("Copier")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
