import { useEffect, useState } from "react";
import { Cloud, CloudAlert, RefreshCw } from "lucide-react";
import Tip from "./Tooltip";
import { syncNow, useSyncState } from "../lib/sync";
import { useLocale, useT } from "../i18n";

/**
 * Nuage de la barre latérale, visible quand la synchronisation est activée :
 * vert = à jour, flèches qui tournent = en cours, rouge = erreur. Un clic synchronise.
 */
export default function SyncIndicator() {
  const t = useT();
  const loc = useLocale();
  const { enabled, running, status } = useSyncState();
  // Relit l'heure de la dernière synchro toutes les 30 s (« il y a 2 min »).
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!enabled) return null;

  const error = status?.error || "";
  const last = status?.last ? new Date(status.last) : null;
  const ago = last ? relative(last, loc, t) : "";

  const label = running
    ? t("Synchronisation en cours…")
    : error
      ? t("Échec de la synchronisation : {error}", { error })
      : last
        ? t("Synchronisé {ago} — cliquer pour synchroniser", { ago })
        : t("Pas encore synchronisé — cliquer pour synchroniser");

  const Icon = running ? RefreshCw : error ? CloudAlert : Cloud;
  const color = running ? "text-accent" : error ? "text-red-500" : last ? "text-emerald-500" : "text-muted";

  return (
    <Tip label={label}>
      <button
        onClick={() => { syncNow().catch(() => {}); }}
        disabled={running}
        aria-label={label}
        data-sync-state={running ? "running" : error ? "error" : last ? "ok" : "never"}
        className={`p-1 rounded transition-colors hover:bg-hover ${color}`}
      >
        <Icon size={14} className={running ? "animate-spin" : ""} />
      </button>
    </Tip>
  );
}

function relative(date: Date, loc: string, t: ReturnType<typeof useT>): string {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return t("à l'instant");
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  if (sec < 3600) return rtf.format(-Math.round(sec / 60), "minute");
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), "hour");
  return rtf.format(-Math.round(sec / 86400), "day");
}
