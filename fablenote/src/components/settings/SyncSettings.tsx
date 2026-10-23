import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Download, FolderOpen, Loader2, RefreshCw, Save } from "lucide-react";
import CloudLogo from "../CloudLogo";
import { CLOUD_APPS, CloudFolder, SyncConfig, SyncStatus, detectCloudFolders, getSyncConfig, prepareCloudFolder, setSyncConfig, syncNow } from "../../lib/sync";
import { Section, SecInput } from "./SettingsWidgets";
import { trError, useLocale, useT } from "../../i18n";

/** Paramètres → Données → Synchronisation entre plusieurs PC. */
export default function SyncSettings() {
  const t = useT();
  const loc = useLocale();
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [saved, setSaved] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ last: null, error: null, report: null });
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [clouds, setClouds] = useState<CloudFolder[]>([]);
  /** Dossier cloud choisi en un clic, en attente du mot de passe pour finir la liaison. */
  const [pendingCloud, setPendingCloud] = useState<string | null>(null);

  useEffect(() => { detectCloudFolders().then(setClouds).catch(() => setClouds([])); }, []);

  useEffect(() => {
    getSyncConfig()
      .then(([c, s]) => { setConfig(c); setSaved(c); setStatus(s); setPassword2(c.password); })
      .catch((e) => setError(trError(e)));
  }, []);

  if (!config) return error ? <p className="text-xs text-red-400">{error}</p> : null;

  const update = (patch: Partial<SyncConfig>) => { setConfig({ ...config, ...patch }); setError(""); setJustSaved(false); };
  const dirty = JSON.stringify(config) !== JSON.stringify(saved) || password2 !== config.password;

  const pickDir = async () => {
    const picked = await openDialog({ directory: true, multiple: false, defaultPath: config.dir || undefined, title: t("Dossier partagé entre vos PC") });
    if (typeof picked === "string") update({ dir: picked });
  };

  /** Enregistre, puis synchronise tout de suite : la liaison est faite en un geste. */
  const saveConfig = async (next: SyncConfig): Promise<boolean> => {
    if (next.password !== password2) { setError(t("Les deux mots de passe ne correspondent pas")); return false; }
    setBusy("save");
    try {
      await setSyncConfig(next);
      setSaved(next); setJustSaved(true); setPendingCloud(null);
    } catch (e) { setError(trError(e)); setBusy(null); return false; }
    if (next.enabled) {
      setBusy("sync");
      try { const st = await syncNow(); if (st) setStatus(st); }
      catch (e) { setError(trError(e)); }
    }
    setBusy(null);
    return true;
  };
  const save = () => saveConfig(config);

  /** Un clic : dossier « NATIA-sync » dans l'application cloud, puis liaison immédiate si le mot de passe est prêt. */
  const pickCloud = async (c: CloudFolder) => {
    let dir: string;
    try { dir = await prepareCloudFolder(c.root); }
    catch (e) { setError(trError(e)); return; }
    const next = { ...config, enabled: true, dir };
    setConfig(next); setError(""); setJustSaved(false);
    if (next.password.length >= 8 && next.password === password2) {
      await saveConfig(next);
    } else {
      setPendingCloud(c.provider);
      document.getElementById("sync-password")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const runNow = async () => {
    if (dirty) { await save(); return; }
    setBusy("sync"); setError("");
    try { const s = await syncNow(); if (s) setStatus(s); }
    catch (e) { setError(trError(e)); }
    finally { setBusy(null); }
  };

  /** Application cloud à laquelle la synchronisation enregistrée est liée. */
  const linked = saved?.enabled ? clouds.find((c) => saved.dir.toLowerCase().startsWith(c.root.toLowerCase())) : undefined;
  const linkedName = linked && CLOUD_APPS.find((a) => a.provider === linked.provider)?.name;
  const pendingName = pendingCloud && CLOUD_APPS.find((a) => a.provider === pendingCloud)?.name;

  const r = status.report;
  const summary = r && (r.sent || r.received || r.conflicts || r.deleted)
    ? t("{sent} envoyée(s), {received} reçue(s), {conflicts} conflit(s), {deleted} suppression(s)", { ...r })
    : t("tout était déjà à jour");

  return (
    <Section title={t("Synchronisation entre plusieurs PC")}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">{t("Synchroniser mes notes")}</p>
            <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
              {t("Choisissez le même dossier partagé (OneDrive, Dropbox, clé USB…) et le même mot de passe sur chaque PC. Tout y est chiffré : le dossier ne contient rien de lisible.")}
            </p>
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
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-secondary">{t("En un clic, avec votre application cloud")}</p>
              <div className="flex flex-wrap gap-1.5">
                {CLOUD_APPS.flatMap((app) => {
                  const found = clouds.filter((c) => c.provider === app.provider);
                  if (found.length === 0) {
                    return [(
                      <button
                        key={app.provider}
                        onClick={() => openUrl(app.download).catch(() => {})}
                        title={t("{name} n'est pas installé sur ce PC : télécharger l'application", { name: app.name })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted hover:text-primary transition-colors"
                      >
                        <CloudLogo provider={app.provider} muted /><Download size={10} />{app.name}
                      </button>
                    )];
                  }
                  return found.map((c) => {
                    const active = config.dir.toLowerCase().startsWith(c.root.toLowerCase());
                    return (
                      <button
                        key={c.root}
                        onClick={() => pickCloud(c)}
                        title={c.root}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${active ? "bg-accent/15 border-accent/40 text-accent font-medium" : "bg-hover border-border text-secondary hover:text-primary hover:border-accent/40"}`}
                      >
                        <CloudLogo provider={app.provider} />
                        {app.name}{c.label && ` (${t(c.label)})`}
                        {active && <Check size={11} />}
                      </button>
                    );
                  });
                })}
              </div>
              {linkedName && !dirty && (
                <p className="flex items-center gap-1.5 text-[11px] text-green-500">
                  <CloudLogo provider={linked!.provider} size={12} />{t("Lié à {name} ✓", { name: linkedName })}
                </p>
              )}
              {pendingName && (
                <p className="text-[11px] text-accent">{t("Dernière étape : choisissez le mot de passe de synchronisation ci-dessous, puis Enregistrer. La liaison avec {name} se fait aussitôt.", { name: pendingName })}</p>
              )}
              <p className="text-[10px] text-muted leading-relaxed">
                {t("NATIA range ses fichiers chiffrés dans un dossier « NATIA-sync » de l'application ; c'est elle qui les copie dans le cloud. Sur l'autre PC, choisissez la même application et le même compte.")}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-secondary">{t("Dossier partagé")}</p>
              <div className="flex gap-2">
                <p className={`flex-1 min-w-0 truncate bg-hover border border-border rounded-lg px-3 py-1.5 text-xs ${config.dir ? "text-primary" : "text-muted"}`} title={config.dir}>
                  {config.dir || t("Aucun dossier choisi")}
                </p>
                <button onClick={pickDir} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors shrink-0">
                  <FolderOpen size={11} />{t("Choisir…")}
                </button>
              </div>
            </div>

            <div id="sync-password" className={`flex flex-col gap-1.5 ${pendingCloud ? "rounded-lg ring-1 ring-accent/40 p-2 -m-2" : ""}`}>
              <p className="text-xs text-secondary">{t("Mot de passe de synchronisation")}</p>
              <SecInput label={t("Mot de passe (8 caractères minimum)")} value={config.password} onChange={(v) => update({ password: v })} show={showPw} onToggleShow={() => setShowPw((s) => !s)} />
              <SecInput label={t("Confirmer le mot de passe")} value={password2} onChange={(v) => { setPassword2(v); setError(""); setJustSaved(false); }} show={showPw} onToggleShow={() => setShowPw((s) => !s)} />
              <p className="text-[10px] text-muted leading-relaxed">
                {t("Le même sur chaque PC. Il chiffre le dossier partagé (AES-256) et ne remplace pas le mot de passe de NATIA. Sans lui, les notes du dossier sont illisibles : notez-le.")}
              </p>
            </div>

            <p className="text-[10px] text-muted leading-relaxed">
              {t("Synchronisation à l'ouverture, toutes les 5 minutes et en revenant sur NATIA. Si une note a été modifiée sur les deux PC, la version la plus récente est gardée et l'autre devient une note « (conflit …) » : rien n'est perdu.")}
            </p>
          </>
        )}

        {(status.last || status.error) && (
          <p className="text-[11px] text-muted">
            {status.error
              ? <span className="text-red-400">{t("Échec de la dernière synchronisation : {e}", { e: trError(status.error) })}</span>
              : t("Dernière synchronisation : {date} · {summary}", {
                  date: new Date(status.last!).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" }),
                  summary,
                })}
          </p>
        )}
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
              <RefreshCw size={11} className={busy === "sync" ? "animate-spin" : ""} />
              {t("Synchroniser maintenant")}
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}
