import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { Activity, Bug, Clipboard, Loader2, RefreshCw, Send, Zap } from "lucide-react";
import DebugConsole from "../DebugConsole";
import { TraceRow } from "./TraceRow";
import { TraceEntry } from "./shared";
import { trError, useT } from "../../i18n";
import { useStore } from "../../store";

/** Début de la session : la durée affichée court depuis l'ouverture de l'application. */
const sessionStart = Date.now();

interface Props {
  /** Fournisseur et modèle de la session (connexion par clé API ou fournisseur classique). */
  providerLabel: string;
  sessionModel: string;
  /** Modèle du fournisseur classique. */
  model: string;
  localProvider: string;
  errorCount: number;
  models: string[];
  isRefreshing: boolean;
  refreshModels: () => void;
  lastTrace: TraceEntry | null;
  traceHistory: TraceEntry[];
  clearHistory: () => void;
  opLabel: (op: string) => string;
  /** Envoie un message en streaming (réponse sur les événements ollama-token / ollama-done). */
  stream: (msg: string) => Promise<void>;
  logError: (op: string, msg: string) => void;
}

/** Onglet « Debug » du panneau IA (mode debug activé dans les paramètres). */
export function AiDebugTab({
  providerLabel, sessionModel, model, localProvider, errorCount, models, isRefreshing, refreshModels,
  lastTrace, traceHistory, clearHistory, opLabel, stream, logError,
}: Props) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  // Chat direct en streaming
  const [traceInput, setTraceInput] = useState("");
  const [traceResponse, setTraceResponse] = useState("");
  const [isTracing, setIsTracing] = useState(false);
  const traceResponseRef = useRef<HTMLDivElement>(null);
  const traceTokenRef = useRef<(() => void) | null>(null);
  const traceDoneRef = useRef<(() => void) | null>(null);

  const unlisten = () => {
    if (traceTokenRef.current) { traceTokenRef.current(); traceTokenRef.current = null; }
    if (traceDoneRef.current) { traceDoneRef.current(); traceDoneRef.current = null; }
  };
  useEffect(() => unlisten, []);

  useEffect(() => {
    if (traceResponseRef.current) traceResponseRef.current.scrollTop = traceResponseRef.current.scrollHeight;
  }, [traceResponse]);

  const runTrace = async () => {
    const msg = traceInput.trim();
    if (!msg || isTracing) return;
    setTraceResponse("");
    setIsTracing(true);
    unlisten();

    const acc = { value: "" };
    traceTokenRef.current = await listen<string>("ollama-token", (ev) => {
      acc.value += ev.payload;
      setTraceResponse(acc.value);
    });
    traceDoneRef.current = await listen<string>("ollama-done", () => {
      setIsTracing(false);
      unlisten();
    });

    try {
      await stream(msg);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : trError(e);
      setTraceResponse(t("Erreur : {e}", { e: errMsg }));
      setIsTracing(false);
      logError("Chat debug", errMsg);
    }
  };

  return (
    <>
      {/* App info */}
      <div className="bg-panel rounded-lg p-3 flex flex-col gap-1.5 border border-amber-500/20">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Bug size={11} className="text-amber-400" />
          <span className="text-xs font-medium text-amber-400">{t("Info session")}</span>
        </div>
        <TraceRow label={t("version")} value={appVersion || "…"} />
        <TraceRow label={t("durée")} value={(() => {
          const s = Math.floor((Date.now() - sessionStart) / 1000);
          if (s < 60) return `${s}s`;
          if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
          return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
        })()} />
        <TraceRow label={t("fournisseur")} value={providerLabel} />
        <TraceRow label={t("modèle")} value={sessionModel} />
        <TraceRow label={t("température")} value={String(settings.temperature)} />
        <TraceRow label={t("contexte")} value={settings.context_messages === 0 ? t("illimité") : t("{n} messages", { n: settings.context_messages })} />
        <TraceRow label={t("erreurs de la session")} value={String(errorCount)} dim={errorCount === 0} />
      </div>

      {/* Debug console — logs temps réel */}
      <DebugConsole />

      {/* Connection info */}
      <div className="bg-panel rounded-lg p-3 flex flex-col gap-1.5 border border-border">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Activity size={11} className="text-accent" />
          <span className="text-xs font-medium text-secondary">{t("Connexion")}</span>
          {localProvider === "ollama" && (
            <button
              onClick={refreshModels}
              disabled={isRefreshing}
              className="ml-auto p-0.5 rounded text-muted hover:text-primary transition-colors disabled:opacity-40"
            >
              <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
        <TraceRow label={t("fournisseur")} value={
          localProvider === "ollama" ? t("Ollama (local)")
          : localProvider === "claude" ? "Claude API"
          : localProvider === "claude_cli" ? "Claude Code CLI"
          : localProvider === "openai" ? "OpenAI"
          : localProvider === "gemini" ? "Google Gemini"
          : "Mistral"
        } />
        <TraceRow label={t("modèle")} value={model} />
        {localProvider === "ollama" && (
          <TraceRow
            label={t("modèles")}
            value={
              isRefreshing
                ? t("rafraîchissement…")
                : models.length > 0
                ? `${t("{n} disponible(s) :", { n: models.length })} ${models.slice(0, 3).join(", ")}${models.length > 3 ? "…" : ""}`
                : t("aucun — Ollama est-il lancé ?")
            }
            dim={models.length === 0 && !isRefreshing}
          />
        )}
        {localProvider === "ollama" && (
          <TraceRow label="url" value={settings.ollama_url} />
        )}
      </div>

      {/* Direct streaming chat */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted">{t("Chat direct — streaming")}</p>
        <div className="flex gap-1.5">
          <input
            value={traceInput}
            onChange={(e) => setTraceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runTrace(); } }}
            placeholder={t("Message à l'IA…")}
            disabled={isTracing}
            className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 placeholder-muted"
          />
          <button
            onClick={runTrace}
            disabled={isTracing || !traceInput.trim()}
            className="flex items-center justify-center w-8 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white transition-colors shrink-0"
          >
            {isTracing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          </button>
        </div>
        {(traceResponse || isTracing) && (
          <div
            ref={traceResponseRef}
            className="bg-hover border border-border rounded-lg px-3 py-2 text-xs text-secondary max-h-40 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed"
          >
            {traceResponse}
            {isTracing && <span className="animate-pulse text-accent ml-0.5">▋</span>}
          </div>
        )}
      </div>

      {/* Last operation log */}
      {lastTrace && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted">{t("Dernière opération")}</p>
            {lastTrace.status === "running" && (
              <Loader2 size={10} className="text-accent animate-spin" />
            )}
            {lastTrace.status === "done" && (
              <span className="text-[10px] text-accent">✓ {lastTrace.elapsed}s</span>
            )}
            {lastTrace.status === "error" && (
              <span className="text-[10px] text-red-400">✗ {t("erreur")}</span>
            )}
            <span className="text-[9px] text-muted/60 ml-auto">
              ~{Math.round((lastTrace.system.length + lastTrace.user.length) / 4)} tokens
            </span>
          </div>
          <div className="bg-panel border border-border rounded-lg p-3 font-mono text-[10px] flex flex-col gap-2 leading-relaxed">
            <div className="flex gap-2 items-center">
              <span className="text-muted w-12 shrink-0">op</span>
              <span className="text-accent font-semibold">{opLabel(lastTrace.operation)}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted w-12 shrink-0">{t("modèle")}</span>
              <span className="text-secondary">{lastTrace.model}</span>
            </div>
            {lastTrace.elapsed > 0 && (
              <div className="flex gap-2 items-center">
                <span className="text-muted w-12 shrink-0">{t("temps")}</span>
                <span className="text-accent">{lastTrace.elapsed}s</span>
              </div>
            )}
            <div className="border-t border-border/40 pt-2">
              <p className="text-muted mb-1">// {t("prompt système")}</p>
              <p className="text-secondary/70 line-clamp-2 break-words">{lastTrace.system}</p>
            </div>
            <div>
              <p className="text-muted mb-1">// {t("message envoyé")}</p>
              <p className="text-secondary/70 line-clamp-3 break-words">{lastTrace.user}</p>
            </div>
            {lastTrace.response && (
              <div>
                <p className="text-muted mb-1">// {t("réponse")}</p>
                <p className="text-secondary/80 line-clamp-4 break-words">{lastTrace.response}</p>
              </div>
            )}
            {lastTrace.error && (
              <p className="text-red-400 bg-red-400/10 rounded px-2 py-1 break-all">{lastTrace.error}</p>
            )}
          </div>
        </div>
      )}

      {!lastTrace && traceHistory.length === 0 && (
        <div className="text-center py-6">
          <Zap size={20} className="text-muted mx-auto mb-2" />
          <p className="text-xs text-muted">{t("Lance une opération pour voir la trace")}</p>
        </div>
      )}

      {/* Trace history */}
      {traceHistory.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{t("Historique")}</p>
            <button
              onClick={clearHistory}
              className="text-[10px] text-muted hover:text-primary transition-colors"
            >
              {t("Effacer")}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {traceHistory.map((entry, i) => {
              const tokens = Math.round((entry.system.length + entry.user.length) / 4);
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-panel rounded-lg border border-border/50 text-[10px] group">
                  <span className={entry.status === "done" ? "text-accent shrink-0" : "text-red-400 shrink-0"}>
                    {entry.status === "done" ? "✓" : "✗"}
                  </span>
                  <span className="text-secondary font-mono flex-1 min-w-0 truncate">
                    {opLabel(entry.operation)} · {entry.model.split(":")[0]} · {entry.elapsed}s · ~{tokens}tk
                  </span>
                  <button
                    onClick={() => {
                      const text = [
                        `op: ${opLabel(entry.operation)}`,
                        `${t("modèle")}: ${entry.model}`,
                        `${t("statut")}: ${entry.status} (${entry.elapsed}s)`,
                        `~${tokens} tokens`,
                        entry.error ? `${t("erreur")}: ${entry.error}` : null,
                        `\n--- ${t("prompt système")} ---`,
                        entry.system,
                        `\n--- ${t("message envoyé")} ---`,
                        entry.user,
                        entry.response ? `\n--- ${t("réponse")} ---\n${entry.response}` : null,
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(text).catch(() => {});
                    }}
                    className="text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title={t("Copier la trace")}
                  >
                    <Clipboard size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
