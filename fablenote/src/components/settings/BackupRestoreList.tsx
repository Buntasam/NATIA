import { useEffect, useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { useStore } from "../../store";
import { BackupFile, listBackups, restoreBackup } from "../../lib/autoBackup";
import { SecInput } from "./SettingsWidgets";
import { trError, useLocale, useT } from "../../i18n";

/** « NATIA-sauvegarde-2026-10-23_080000.zip » → date de la sauvegarde. */
function backupDate(name: string): Date | null {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

/** Sauvegardes du dossier choisi, à restaurer en un clic. `refresh` change après chaque sauvegarde. */
export default function BackupRestoreList({ refresh }: { refresh: number }) {
  const t = useT();
  const loc = useLocale();
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { listBackups().then(setFiles).catch(() => setFiles([])); }, [refresh]);

  if (files.length === 0) return null;

  const restore = async (name: string, pw: string | null) => {
    setBusy(name); setResult(null);
    try {
      const r = await restoreBackup(name, pw);
      setConfirm(null); setNeedPassword(null); setPassword("");
      const parts = [r.imported === 1 ? t("{n} note restaurée", { n: 1 }) : t("{n} notes restaurées", { n: r.imported })];
      if (r.skipped) parts.push(r.skipped === 1 ? t("{n} déjà présente", { n: 1 }) : t("{n} déjà présentes", { n: r.skipped }));
      setResult({ ok: true, text: parts.join(" · ") });
      const st = useStore.getState();
      await Promise.all([st.loadNotes(), st.loadFolders()]);
    } catch (e) {
      const msg = String(e);
      // Archive faite avec un ancien mot de passe des sauvegardes : on le demande.
      if (/mot de passe/i.test(msg)) { setNeedPassword(name); setConfirm(null); }
      setResult({ ok: false, text: trError(e) });
    } finally { setBusy(null); }
  };

  const label = (f: BackupFile) => {
    const d = backupDate(f.name);
    const when = d ? d.toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }) : f.name;
    return `${when} · ${t("{n} Mo", { n: (f.size / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }) })}`;
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="text-xs text-secondary">{t("Restaurer une sauvegarde")}</p>
      <p className="text-[10px] text-muted">{t("Les notes absentes reviennent ; celles déjà présentes ne sont pas remplacées.")}</p>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {files.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded-lg bg-hover border border-border">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-[11px] text-secondary" title={f.name}>{label(f)}</span>
              {busy === f.name ? (
                <Loader2 size={12} className="animate-spin text-accent shrink-0" />
              ) : (
                <button
                  onClick={() => (confirm === f.name ? restore(f.name, null) : setConfirm(f.name))}
                  disabled={busy !== null}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors shrink-0 disabled:opacity-40 ${confirm === f.name ? "bg-accent text-white" : "text-muted hover:text-primary"}`}
                >
                  <ArchiveRestore size={10} />{confirm === f.name ? t("Confirmer") : t("Restaurer")}
                </button>
              )}
            </div>
            {needPassword === f.name && (
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <SecInput label={t("Mot de passe de cette sauvegarde")} value={password} onChange={setPassword} show={showPw} onToggleShow={() => setShowPw((s) => !s)} />
                </div>
                <button
                  onClick={() => restore(f.name, password)}
                  disabled={!password || busy !== null}
                  className="px-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] disabled:opacity-40 shrink-0"
                >
                  {t("Restaurer")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {result && <p className={`text-[11px] ${result.ok ? "text-green-500" : "text-red-400"}`}>{result.ok ? "✓ " : ""}{result.text}</p>}
    </div>
  );
}
