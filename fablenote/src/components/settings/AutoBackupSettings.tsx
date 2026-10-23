import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpen, Loader2, Save } from "lucide-react";
import { useStore } from "../../store";
import { BackupConfig, BackupStatus, getBackupConfig, runBackup, setBackupConfig } from "../../lib/autoBackup";
import { Section, SecInput } from "./SettingsWidgets";
import { trError, useLocale, useT } from "../../i18n";

const KEEP_CHOICES = [3, 7, 14, 30];

/** Paramètres → Données → Sauvegarde automatique : dossier, fréquence, nombre gardé, mot de passe. */
export default function AutoBackupSettings() {
  const { hasPassword } = useStore();
  const t = useT();
  const loc = useLocale();
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [saved, setSaved] = useState<BackupConfig | null>(null);
  const [status, setStatus] = useState<BackupStatus>({ last: null, error: null });
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    getBackupConfig()
      .then(([c, s]) => { setConfig(c); setSaved(c); setStatus(s); setPassword2(c.password); })
      .catch((e) => setError(trError(e)));
  }, []);

  if (!config) return error ? <p className="text-xs text-red-400">{error}</p> : null;

  const update = (patch: Partial<BackupConfig>) => { setConfig({ ...config, ...patch }); setError(""); setJustSaved(false); };
  const dirty = JSON.stringify(config) !== JSON.stringify(saved) || password2 !== config.password;

  const pickDir = async () => {
    const picked = await openDialog({ directory: true, multiple: false, defaultPath: config.dir || undefined });
    if (typeof picked === "string") update({ dir: picked });
  };

  const save = async (): Promise<boolean> => {
    if (config.password !== password2) { setError(t("Les deux mots de passe ne correspondent pas")); return false; }
    setBusy("save");
    try {
      await setBackupConfig(config);
      setSaved(config); setJustSaved(true);
      return true;
    } catch (e) { setError(trError(e)); return false; }
    finally { setBusy(null); }
  };

  const runNow = async () => {
    if (dirty && !(await save())) return;
    setBusy("run"); setError("");
    try { setStatus(await runBackup(true)); }
    catch (e) { setError(trError(e)); }
    finally { setBusy(null); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
  const select = "bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none cursor-pointer";

  return (
    <Section title={t("Sauvegarde automatique")}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">{t("Sauvegarder automatiquement")}</p>
            <p className="text-[10px] text-muted mt-0.5">{t("Une archive ZIP de toutes les notes, dans le dossier de votre choix (OneDrive, clé USB, disque externe…)")}</p>
          </div>
          <button
            role="switch"
            aria-checked={config.enabled}
            onClick={() => update({ enabled: !config.enabled })}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${config.enabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${config.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>

        {config.enabled && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-secondary">{t("Dossier des sauvegardes")}</p>
              <div className="flex gap-2">
                <p className={`flex-1 min-w-0 truncate bg-hover border border-border rounded-lg px-3 py-1.5 text-xs ${config.dir ? "text-primary" : "text-muted"}`} title={config.dir}>
                  {config.dir || t("Aucun dossier choisi")}
                </p>
                <button onClick={pickDir} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors shrink-0">
                  <FolderOpen size={11} />{t("Choisir…")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-secondary">{t("Fréquence")}</span>
                <select value={config.frequency} onChange={(e) => update({ frequency: e.target.value as BackupConfig["frequency"] })} className={select}>
                  <option value="daily">{t("Chaque jour")}</option>
                  <option value="weekly">{t("Chaque semaine")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-secondary">{t("Sauvegardes gardées")}</span>
                <select value={config.keep} onChange={(e) => update({ keep: Number(e.target.value) })} className={select}>
                  {KEEP_CHOICES.map((n) => <option key={n} value={n}>{t("Les {n} dernières", { n })}</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-secondary">
                {t("Mot de passe des archives")}
                {!hasPassword && <span className="text-muted">{" · "}{t("facultatif")}</span>}
              </p>
              <SecInput label={t("Mot de passe (8 caractères minimum)")} value={config.password} onChange={(v) => update({ password: v })} show={showPw} onToggleShow={() => setShowPw((s) => !s)} />
              <SecInput label={t("Confirmer le mot de passe")} value={password2} onChange={(v) => { setPassword2(v); setError(""); setJustSaved(false); }} show={showPw} onToggleShow={() => setShowPw((s) => !s)} />
              <p className="text-[10px] text-muted leading-relaxed">
                {hasPassword
                  ? t("Obligatoire : vos notes sont chiffrées, les sauvegardes doivent l'être aussi (AES-256, ouvrable avec 7-Zip ou l'import de NATIA).")
                  : t("Recommandé si le dossier est synchronisé en ligne. Archive AES-256, ouvrable avec 7-Zip ou l'import de NATIA.")}
              </p>
            </div>
          </>
        )}

        <p className="text-[11px] text-muted">
          {status.error
            ? <span className="text-red-400">{t("Échec de la dernière sauvegarde : {e}", { e: trError(status.error) })}</span>
            : status.last
              ? t("Dernière sauvegarde automatique : {date}", { date: fmt(status.last) })
              : t("Aucune sauvegarde automatique pour l'instant.")}
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!dirty || busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            {busy === "save" ? <Loader2 size={11} className="animate-spin" /> : justSaved && !dirty ? <Check size={11} /> : <Save size={11} />}
            {justSaved && !dirty ? t("Enregistré") : t("Enregistrer")}
          </button>
          {config.enabled && (
            <button
              onClick={runNow}
              disabled={busy !== null || !config.dir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              {busy === "run" && <Loader2 size={11} className="animate-spin" />}
              {t("Sauvegarder maintenant")}
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}
