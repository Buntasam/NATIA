import { useState } from "react";
import { CloudAlert, Columns2, FileText, X } from "lucide-react";
import { useStore } from "../store";
import { findConflicts, Conflict } from "../lib/conflicts";
import { trError, useT } from "../i18n";

/**
 * Copies « (conflit …) » créées par la synchronisation : comparer côte à côte avec la note
 * gardée, puis garder l'une ou l'autre. Celle qu'on ne garde pas part à la corbeille.
 */
export default function ConflictsPanel() {
  const t = useT();
  const { notes, toggleConflicts, selectNote, setSplitNote, deleteNote, renameNote } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const conflicts = findConflicts(notes);

  const run = async (c: Conflict, action: () => Promise<void>) => {
    setBusy(c.copy.id); setError("");
    try { await action(); }
    catch (e) { setError(trError(e)); }
    finally { setBusy(null); }
  };

  const compare = (c: Conflict) => {
    if (!c.original) { selectNote(c.copy.id); toggleConflicts(); return; }
    selectNote(c.original.id).then(() => setSplitNote(c.copy.id));
    toggleConflicts();
  };

  // Garder la copie : l'original part à la corbeille, la copie reprend son titre.
  const keepCopy = (c: Conflict) => run(c, async () => {
    if (c.original) await deleteNote(c.original.id);
    await renameNote(c.copy.id, c.base);
  });

  const keepOriginal = (c: Conflict) => run(c, () => deleteNote(c.copy.id));

  const btn = "px-2 py-1 rounded-md text-xs transition-colors disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Conflits de synchronisation")}>
      <div className="fixed inset-0 bg-black/40" onClick={toggleConflicts} />
      <div className="relative z-10 w-[560px] max-w-[94vw] max-h-[75vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <CloudAlert size={15} className="text-amber-500" />
          <span className="text-sm font-semibold text-primary flex-1">{t("Conflits de synchronisation")}</span>
          <button onClick={toggleConflicts} aria-label={t("Fermer")} className="p-1 text-muted hover:text-primary"><X size={14} /></button>
        </div>
        <p className="px-4 pt-3 text-xs text-secondary leading-relaxed">
          {t("Ces notes ont été modifiées sur deux PC entre deux synchronisations. NATIA a gardé la plus récente et mis l'autre de côté. Comparez-les, puis gardez celle que vous voulez : l'autre va dans la corbeille.")}
        </p>
        {error && <p className="px-4 pt-2 text-xs text-red-500">{error}</p>}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {conflicts.length === 0 && <p className="text-sm text-muted text-center py-8">{t("Aucun conflit : tout est à jour.")}</p>}
          {conflicts.map((c) => (
            <div key={c.copy.id} className="flex flex-col gap-2 p-3 rounded-lg border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={13} className="text-muted shrink-0" />
                <span className="text-sm text-primary truncate flex-1">{c.base || t("Sans titre")}</span>
                <span className="text-[11px] text-muted shrink-0">{t("copie de {origin}, {when}", { origin: c.origin, when: c.when })}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => compare(c)} disabled={busy !== null} className={`${btn} flex items-center gap-1 bg-hover text-secondary hover:text-primary`}>
                  <Columns2 size={11} />{c.original ? t("Comparer") : t("Ouvrir")}
                </button>
                <button onClick={() => keepOriginal(c)} disabled={busy !== null} className={`${btn} border border-border text-secondary hover:text-primary`}>
                  {c.original ? t("Garder la version actuelle") : t("Supprimer la copie")}
                </button>
                <button onClick={() => keepCopy(c)} disabled={busy !== null} className={`${btn} border border-border text-secondary hover:text-primary`}>
                  {t("Garder la copie")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
