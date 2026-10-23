import { check, type Update } from "@tauri-apps/plugin-updater";
import { callSaveNow } from "../components/CloseOverlay";

const AUTO_KEY = "natia_auto_update";

export const isAutoUpdateEnabled = () => localStorage.getItem(AUTO_KEY) !== "0";
export const setAutoUpdateEnabled = (v: boolean) => localStorage.setItem(AUTO_KEY, v ? "1" : "0");

// Gardée entre la vérification au démarrage et l'installation (fenêtre de démarrage ou paramètres).
let pending: Update | null = null;

export async function checkForUpdate(): Promise<Update | null> {
  pending = await check();
  return pending;
}

export const getPendingUpdate = () => pending;

/** Télécharge et installe la mise à jour trouvée ; l'installeur ferme puis relance l'app. */
export async function installPendingUpdate(onProgress: (percent: number) => void): Promise<void> {
  const u = pending;
  if (!u) return;
  // L'installeur ferme l'app : on enregistre la note en cours avant.
  callSaveNow();
  await new Promise((r) => setTimeout(r, 600));
  let total = 0, received = 0;
  onProgress(0);
  await u.downloadAndInstall((ev) => {
    if (ev.event === "Started") total = ev.data.contentLength ?? 0;
    if (ev.event === "Progress") {
      received += ev.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((received / total) * 100)) : 0);
    }
  });
}
