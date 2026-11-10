import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Sparkles, X } from "lucide-react";
import { RELEASES, Release, UPDATED_FROM_KEY, releasesBetween } from "../lib/whatsNew";
import { useT } from "../i18n";

const SEEN_KEY = "natia_whatsnew_seen";
/** Événement de la palette : « Nouveautés ». */
export const WHATS_NEW_EVENT = "natia:whats-new";

/**
 * Après une mise à jour, montre une fois les nouveautés des versions installées depuis
 * la dernière ouverture. Rien au premier lancement : le guide de démarrage s'en charge.
 */
export default function WhatsNew() {
  const t = useT();
  const [shown, setShown] = useState<Release[] | null>(null);

  useEffect(() => {
    getVersion().then((v) => {
      let seen: string | null = null;
      try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, v); } catch { /* stockage indisponible */ }
      // Première ouverture avec cet écran : la version d'avant la mise à jour (notée par UpdatePrompt).
      if (!seen) { try { seen = localStorage.getItem(UPDATED_FROM_KEY); } catch { /* stockage indisponible */ } }
      if (!seen) return;
      const list = releasesBetween(seen, v);
      if (list.length) setShown(list);
    }).catch(() => {});

    const open = () => setShown(RELEASES.slice(0, 2));
    window.addEventListener(WHATS_NEW_EVENT, open);
    return () => window.removeEventListener(WHATS_NEW_EVENT, open);
  }, []);

  if (!shown) return null;

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Nouveautés")}>
      <div className="fixed inset-0 bg-black/40" onClick={() => setShown(null)} />
      <div className="relative z-10 w-[460px] max-w-[92vw] max-h-[80vh] overflow-y-auto bg-panel border border-border rounded-xl shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm font-semibold text-primary flex-1">{t("Nouveautés de NATIA")}</span>
          <button onClick={() => setShown(null)} aria-label={t("Fermer")} className="p-1 text-muted hover:text-primary"><X size={14} /></button>
        </div>
        {shown.map((r) => (
          <section key={r.version} className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted uppercase tracking-wider">{t("Version {v}", { v: r.version })}</p>
            <ul className="flex flex-col gap-1.5">
              {r.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-secondary leading-snug">
                  <span className="text-accent shrink-0">•</span>
                  <span>{t(item)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <button onClick={() => setShown(null)} className="self-end px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover">
          {t("C'est parti")}
        </button>
      </div>
    </div>
  );
}
