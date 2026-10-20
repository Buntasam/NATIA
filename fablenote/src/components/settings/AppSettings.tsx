import React, { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Bug, Download, ExternalLink, Github, Lightbulb, RotateCcw, Star } from "lucide-react";
import { checkForUpdate, getPendingUpdate, isAutoUpdateEnabled, setAutoUpdateEnabled } from "../../lib/updater";
import { callSaveNow } from "../CloseOverlay";
import { Section } from "./SettingsWidgets";
import { SettingsFormProps } from "./types";

const GITHUB_URL = "https://github.com/Buntasam/NATIA";

// La webview Tauri n'ouvre pas les liens externes : on passe par le navigateur du système.
// Les URLs autorisées sont listées dans src-tauri/capabilities/default.json.
const openExternal = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const url = e.currentTarget.getAttribute("href");
  if (url) openUrl(url).catch((err) => console.error("openUrl:", err));
};

export default function AppSettings({ form, set }: Pick<SettingsFormProps, "form" | "set">) {
  const [disclaimerReset, setDisclaimerReset] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(isAutoUpdateEnabled);
  const [appVersion, setAppVersion] = useState("");
  const [upd, setUpd] = useState<{ status: "idle" | "checking" | "none" | "available" | "downloading" | "error"; version?: string; progress?: number; error?: string }>(
    () => { const p = getPendingUpdate(); return p ? { status: "available", version: p.version } : { status: "idle" }; }
  );
  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  const runUpdateCheck = async () => {
    setUpd({ status: "checking" });
    try {
      const u = await checkForUpdate();
      setUpd(u ? { status: "available", version: u.version } : { status: "none" });
    } catch {
      setUpd({ status: "error", error: "Vérification impossible : aucune version publiée ou pas de connexion." });
    }
  };

  const installUpdate = async () => {
    const u = getPendingUpdate();
    if (!u) return;
    // L'installeur ferme l'app : on enregistre la note en cours avant.
    callSaveNow();
    await new Promise((r) => setTimeout(r, 600));
    let total = 0, received = 0;
    setUpd({ status: "downloading", version: u.version, progress: 0 });
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        if (ev.event === "Progress") {
          received += ev.data.chunkLength;
          setUpd((s) => ({ ...s, progress: total ? Math.min(100, Math.round((received / total) * 100)) : 0 }));
        }
      });
    } catch (e) {
      setUpd({ status: "error", error: `Échec de l'installation : ${String(e)}` });
    }
  };

  const resetDisclaimer = () => {
    localStorage.removeItem("natia_disclaimer_v1");
    setDisclaimerReset(true);
    setTimeout(() => setDisclaimerReset(false), 2000);
  };
  return (
    <>
      <Section title="Application">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Disclaimer de démarrage</p>
            <p className="text-[10px] text-muted mt-0.5">Réafficher le message d'avertissement au prochain lancement</p>
          </div>
          <button onClick={resetDisclaimer} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors">
            <RotateCcw size={11} className={disclaimerReset ? "text-accent" : ""} />
            {disclaimerReset ? "Réinitialisé ✓" : "Réinitialiser"}
          </button>
        </div>
      </Section>

      <Section title="Mises à jour">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Rechercher au démarrage</p>
            <p className="text-[10px] text-muted mt-0.5">Version installée : {appVersion || "…"} · une notification signale les nouvelles versions</p>
          </div>
          <button
            role="switch"
            aria-checked={autoUpdate}
            onClick={() => { setAutoUpdate(!autoUpdate); setAutoUpdateEnabled(!autoUpdate); }}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${autoUpdate ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoUpdate ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-xs text-muted">
            {upd.status === "checking" && "Recherche…"}
            {upd.status === "none" && "NATIA est à jour."}
            {upd.status === "available" && <span className="text-accent">Version {upd.version} disponible.</span>}
            {upd.status === "downloading" && `Téléchargement… ${upd.progress}%`}
            {upd.status === "error" && <span className="text-red-400">{upd.error}</span>}
          </p>
          {upd.status === "available" ? (
            <button onClick={installUpdate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors shrink-0">
              <Download size={11} />
              Installer et redémarrer
            </button>
          ) : (
            <button onClick={runUpdateCheck} disabled={upd.status === "checking" || upd.status === "downloading"} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0">
              <RotateCcw size={11} />
              Rechercher maintenant
            </button>
          )}
        </div>
      </Section>

      <Section title="Développement">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Mode débogage</p>
            <p className="text-[10px] text-muted mt-0.5">Active l'onglet Activité dans le panneau IA — journalisation des requêtes</p>
          </div>
          <button
            role="switch"
            aria-checked={form.debug_mode}
            onClick={() => set("debug_mode", !form.debug_mode)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.debug_mode ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.debug_mode ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </Section>

      <Section title="Signaler un bug ou une idée">
        <p className="text-[10px] text-muted mb-2">Les retours se font sur GitHub — un compte GitHub (gratuit) est nécessaire pour poster.</p>
        <div className="flex gap-2">
          <a
            href={`${GITHUB_URL}/issues`}
            onClick={openExternal}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border bg-hover hover:bg-active text-xs text-secondary hover:text-primary transition-colors"
          >
            <Bug size={12} className="text-red-400" />
            Signaler un bug
            <ExternalLink size={10} className="text-muted" />
          </a>
          <a
            href={`${GITHUB_URL}/discussions`}
            onClick={openExternal}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border bg-hover hover:bg-active text-xs text-secondary hover:text-primary transition-colors"
          >
            <Lightbulb size={12} className="text-amber-400" />
            Idées & discussions
            <ExternalLink size={10} className="text-muted" />
          </a>
        </div>
      </Section>

      <Section title="Communauté">
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            onClick={openExternal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-hover hover:bg-active text-xs text-secondary hover:text-primary transition-colors shrink-0"
          >
            <Github size={13} />
            <span className="font-medium">Buntasam/NATIA</span>
            <ExternalLink size={10} className="text-muted" />
          </a>
          <p className="text-xs text-muted">
            Si NATIA te plaît, une{" "}
            <a href={GITHUB_URL} onClick={openExternal} className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-medium">
              <Star size={11} className="fill-amber-400" />
              étoile sur GitHub
            </a>
            {" "}aide beaucoup !
          </p>
        </div>
      </Section>
    </>
  );
}
