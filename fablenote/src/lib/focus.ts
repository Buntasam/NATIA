import { getCurrentWindow } from "@tauri-apps/api/window";

// Mode focus : la fenêtre passe en plein écran, et en sort avec lui.

let applied = false;

export function setFocusFullscreen(on: boolean) {
  if (on === applied) return;
  applied = on;
  getCurrentWindow().setFullscreen(on).catch(() => {});
}
