import { check, type Update } from "@tauri-apps/plugin-updater";

const AUTO_KEY = "natia_auto_update";

export const isAutoUpdateEnabled = () => localStorage.getItem(AUTO_KEY) !== "0";
export const setAutoUpdateEnabled = (v: boolean) => localStorage.setItem(AUTO_KEY, v ? "1" : "0");

// Gardée entre la vérification au démarrage et l'installation depuis les paramètres.
let pending: Update | null = null;

export async function checkForUpdate(): Promise<Update | null> {
  pending = await check();
  return pending;
}

export const getPendingUpdate = () => pending;
