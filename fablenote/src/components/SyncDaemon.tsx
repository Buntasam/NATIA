import { useEffect } from "react";
import { syncNow } from "../lib/sync";

const INTERVAL_MS = 5 * 60 * 1000;

/** Monté avec l'app déverrouillée : synchronise à l'ouverture, toutes les 5 min et en revenant sur la fenêtre. */
export default function SyncDaemon() {
  useEffect(() => {
    const tick = () => { syncNow().catch(() => {}); };
    const first = setTimeout(tick, 5000);
    const id = setInterval(tick, INTERVAL_MS);
    let lastFocus = 0;
    const onFocus = () => {
      // Pas plus d'une fois par minute en passant d'une fenêtre à l'autre.
      if (Date.now() - lastFocus > 60_000) { lastFocus = Date.now(); tick(); }
    };
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(first); clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);
  return null;
}
