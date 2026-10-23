import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { CheckCircle2, Download, Loader2, X } from "lucide-react";
import { checkForUpdate, installPendingUpdate, isAutoUpdateEnabled } from "../lib/updater";
import { useT } from "../i18n";

const LAST_VERSION_KEY = "natia_last_version";

/**
 * Au démarrage : propose la nouvelle version s'il y en a une (installer ou passer),
 * et confirme une mise à jour qui vient d'être installée.
 */
export default function UpdatePrompt() {
  const t = useT();
  const [available, setAvailable] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then((v) => {
      let last: string | null = null;
      try { last = localStorage.getItem(LAST_VERSION_KEY); localStorage.setItem(LAST_VERSION_KEY, v); } catch { /* stockage indisponible */ }
      if (last && last !== v) {
        setUpdatedTo(v);
        setTimeout(() => setUpdatedTo(null), 6000);
      }
    }).catch(() => {});

    // Pas de release publiée ou pas de réseau : rien à signaler.
    if (!isAutoUpdateEnabled()) return;
    checkForUpdate().then((u) => { if (u) setAvailable(u.version); }).catch(() => {});
  }, []);

  const install = async () => {
    setError("");
    try {
      await installPendingUpdate(setProgress);
    } catch (e) {
      setProgress(null);
      setError(t("Échec de l'installation : {e}", { e: String(e) }));
    }
  };

  return (
    <>
      {available && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl shadow-2xl w-[380px] max-w-[92vw] p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                <Download size={16} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-primary">{t("NATIA {v} est disponible", { v: available })}</h2>
                <p className="text-xs text-muted mt-0.5">{t("La note en cours est enregistrée, puis NATIA redémarre sur la nouvelle version.")}</p>
              </div>
            </div>
            {progress !== null && (
              <div className="flex flex-col gap-1">
                <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[10px] text-muted">{t("Téléchargement… {p}%", { p: progress })}</p>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAvailable(null)}
                disabled={progress !== null}
                className="px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors disabled:opacity-40"
              >
                {t("Plus tard")}
              </button>
              <button
                onClick={install}
                disabled={progress !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-60"
              >
                {progress !== null ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                {t("Mettre à jour")}
              </button>
            </div>
          </div>
        </div>
      )}

      {updatedTo && (
        <div className="fixed bottom-4 right-4 z-[110] flex items-center gap-2 px-3 py-2 rounded-lg bg-panel border border-green-500/30 shadow-xl text-xs text-secondary">
          <CheckCircle2 size={13} className="text-green-500 shrink-0" />
          {t("NATIA a été mise à jour en {v}", { v: updatedTo })}
          <button onClick={() => setUpdatedTo(null)} aria-label={t("Fermer")} className="text-muted hover:text-primary ml-1"><X size={11} /></button>
        </div>
      )}
    </>
  );
}
