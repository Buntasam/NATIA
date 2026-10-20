// Fermer la fenêtre = la cacher dans la zone de notification (par défaut),
// pour que NATIA continue de tourner et que les rappels sonnent.
const CLOSE_TO_TRAY_KEY = "natia_close_to_tray";

export function isCloseToTray(): boolean {
  try { return localStorage.getItem(CLOSE_TO_TRAY_KEY) !== "0"; } catch { return true; }
}

export function setCloseToTray(enabled: boolean): void {
  try { localStorage.setItem(CLOSE_TO_TRAY_KEY, enabled ? "1" : "0"); } catch { /* préférence non conservée */ }
}
