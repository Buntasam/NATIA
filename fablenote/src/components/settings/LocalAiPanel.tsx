import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Cpu, Download, ExternalLink, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import { msg, trError, useLocale, useT } from "../../i18n";
import { SettingsFormProps } from "./types";

// IA intégrée (llama.cpp, voir src-tauri/src/llm.rs) : installation en un clic,
// choix du modèle selon le PC, tout tourne sur la machine.

interface ModelInfo { id: string; name: string; size: number; license: string; license_url: string; installed: boolean }
interface Gpu { name: string; vram_mib: number }
interface LlmStatus {
  engine_installed: boolean; engine_version: string; engine_size: number;
  models: ModelInfo[]; recommended: string; ram_gb: number; gpu: Gpu | null;
  running: string | null; downloading: boolean;
}
interface Progress { kind: "engine" | "model"; id: string; received: number; total: number }

const MODEL_DESC: Record<string, string> = {
  "gemma3-1b": msg("Léger · PC modeste (8 Go de RAM)"),
  "gemma3-4b": msg("Équilibré · 16 Go de RAM ou petite carte graphique"),
  "phi4-mini": msg("Alternative à Gemma 3 4B · licence MIT"),
  "mistral-7b": msg("Puissant · carte graphique de 6 Go ou plus"),
  "gemma3-12b": msg("Très puissant · carte graphique de 10 Go ou plus"),
};

export default function LocalAiPanel({ form, set }: Pick<SettingsFormProps, "form" | "set">) {
  const t = useT();
  const loc = useLocale();
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = () => invoke<LlmStatus>("llm_status").then((s) => { setStatus(s); return s; });

  useEffect(() => {
    refresh().catch((e) => setError(trError(e)));
    // Le téléchargement continue côté Rust si le panneau est fermé puis rouvert :
    // la progression reprend à l'événement suivant, et la liste se met à jour à la fin.
    const un = listen<Progress>("llm-download", (e) => {
      setProgress(e.payload);
      if (e.payload.received >= e.payload.total) setTimeout(() => refresh().catch(() => {}), 500);
    });
    return () => { un.then((f) => f()); };
  }, []);

  const gb = (bytes: number) => t("{n} Go", { n: (bytes / 1e9).toLocaleString(loc, { maximumFractionDigits: 1 }) });
  /** Mémoire affichée comme sur la fiche du PC : « 16 Go », « 4 Go ». */
  const memory = (gib: number) => t("{n} Go", { n: Math.max(1, Math.round(gib)) });

  /** Active le modèle : enregistré tout de suite, et reporté dans le formulaire ouvert. */
  const useModel = async (id: string) => {
    set("local_model", id);
    set("ai_provider", "local");
    const st = useStore.getState();
    await st.saveSettings({ ...st.settings, local_model: id, ai_provider: "local" });
  };

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label); setError(""); setDone(false); setProgress(null);
    try { await job(); }
    catch (e) { setError(trError(e)); }
    finally { setBusy(null); setProgress(null); refresh().catch(() => {}); }
  };

  const installAll = () => run("all", async () => {
    await invoke("llm_install_engine");
    const s = await refresh();
    const id = s.recommended;
    await invoke("llm_download_model", { id });
    await useModel(id);
    setDone(true);
  });

  const downloadModel = (id: string) => run(id, async () => {
    await invoke("llm_download_model", { id });
    if (!form.local_model) await useModel(id);
  });

  const deleteModel = (id: string) => run(id, async () => {
    await invoke("llm_delete_model", { id });
    setConfirmDelete(null);
    if (form.local_model === id) set("local_model", "");
  });

  const cancel = () => { invoke("llm_cancel_download").catch(() => {}); };

  if (!status) {
    return <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" />{t("Chargement…")}</p>;
  }

  const recommended = status.models.find((m) => m.id === status.recommended);
  /** Un téléchargement tourne : lancé ici, ou avant que le panneau soit rouvert. */
  const locked = !!busy || status.downloading;
  const progressBar = progress && progress.total > 0 && (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 rounded-full bg-hover overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${Math.round((progress.received / progress.total) * 100)}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {progress.kind === "engine" ? t("Moteur") : status.models.find((m) => m.id === progress.id)?.name}
          {" · "}{gb(progress.received)} / {gb(progress.total)}
        </span>
        <button onClick={cancel} className="flex items-center gap-1 hover:text-red-400 transition-colors"><X size={10} />{t("Annuler")}</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
        <ShieldCheck size={13} className="text-green-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-secondary leading-relaxed">
          {t("L'IA tourne entièrement sur ce PC : rien n'est envoyé sur internet. Seul le téléchargement du moteur et du modèle, une seule fois, utilise la connexion.")}
        </p>
      </div>

      {!status.engine_installed ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-secondary">
            {t("Installation automatique : moteur llama.cpp ({engine}) puis le modèle adapté à ton PC (environ {model}).", {
              engine: gb(status.engine_size), model: gb(recommended?.size ?? 0),
            })}
          </p>
          <button onClick={installAll} disabled={locked}
            className="self-start flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">
            {busy === "all" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {busy === "all" ? t("Installation…") : t("Installer l'IA intégrée")}
          </button>
          {busy === "all" && progressBar}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <Cpu size={11} className="shrink-0" />
            {status.gpu
              ? t("Ton PC : {ram} de RAM · {gpu} ({vram})", { ram: memory(status.ram_gb), gpu: status.gpu.name, vram: memory(status.gpu.vram_mib / 1024) })
              : t("Ton PC : {ram} de RAM · pas de carte graphique dédiée", { ram: memory(status.ram_gb) })}
          </p>
          <div className="flex flex-col gap-1.5">
            {status.models.map((m) => {
              const active = form.ai_provider === "local" && form.local_model === m.id;
              const loading = busy === m.id || (progress?.kind === "model" && progress.id === m.id && progress.received < progress.total);
              return (
                <div key={m.id} className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg border transition-colors ${active ? "bg-accent/10 border-accent/30" : "bg-hover border-border"}`}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-primary flex items-center gap-1.5 flex-wrap">
                        {m.name}
                        {m.id === status.recommended && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/25">{t("Recommandé pour ce PC")}</span>}
                        {active && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 border border-green-500/25">{t("Utilisé")}</span>}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {t(MODEL_DESC[m.id] ?? "")} · {gb(m.size)} ·{" "}
                        <button onClick={() => openUrl(m.license_url).catch(() => {})} className="inline-flex items-center gap-0.5 hover:text-accent transition-colors">
                          {t("licence {name}", { name: m.license })}<ExternalLink size={8} />
                        </button>
                      </p>
                    </div>
                    {loading ? (
                      <Loader2 size={13} className="animate-spin text-accent shrink-0" />
                    ) : m.installed ? (
                      <div className="flex items-center gap-1 shrink-0">
                        {!active && (
                          <button onClick={() => useModel(m.id)} disabled={locked}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 border border-accent/30 text-[11px] text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
                            <Check size={10} />{t("Utiliser")}
                          </button>
                        )}
                        <button
                          onClick={() => (confirmDelete === m.id ? deleteModel(m.id) : setConfirmDelete(m.id))}
                          disabled={locked}
                          title={t("Supprimer le modèle")}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors disabled:opacity-50 ${confirmDelete === m.id ? "bg-red-400/15 text-red-400 border border-red-400/30" : "text-muted hover:text-red-400"}`}
                        >
                          <Trash2 size={10} />{confirmDelete === m.id && t("Confirmer")}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => downloadModel(m.id)} disabled={locked}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-hover border border-border text-[11px] text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0">
                        <Download size={10} />{t("Télécharger")}
                      </button>
                    )}
                  </div>
                  {loading && progressBar}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted">
            {t("Moteur llama.cpp {v} (licence MIT). Le premier message charge le modèle en mémoire : quelques secondes avec une carte graphique, jusqu'à une minute sans.", { v: status.engine_version })}
          </p>
        </>
      )}

      {done && <p className="text-xs text-green-500">{t("✓ L'IA intégrée est prête. Ouvre le panneau IA pour l'essayer.")}</p>}
      {error && <p className="text-xs text-red-400 whitespace-pre-wrap">{error}</p>}
    </div>
  );
}
