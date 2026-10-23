import { useEffect } from "react";
import { runBackup } from "../lib/autoBackup";

const CHECK_MS = 30 * 60 * 1000;

/** Monté avec l'app déverrouillée : sauvegarde à l'ouverture si c'est le moment, puis vérifie toutes les 30 min. */
export default function AutoBackupDaemon() {
  useEffect(() => {
    const tick = () => { runBackup(false).catch(() => {}); };
    // Laisse l'app finir de démarrer avant d'écrire l'archive.
    const first = setTimeout(tick, 15_000);
    const id = setInterval(tick, CHECK_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return null;
}
