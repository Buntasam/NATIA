import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { callSaveNow } from "../components/CloseOverlay";

// Synchronisation par dossier partagé (voir src-tauri/src/sync.rs).

export interface SyncConfig { enabled: boolean; dir: string; password: string }
export interface SyncReport { sent: number; received: number; conflicts: number; deleted: number }
export interface SyncStatus { last: string | null; error: string | null; report: SyncReport | null }

export type CloudProvider = "onedrive" | "dropbox" | "gdrive";
export interface CloudFolder { provider: CloudProvider; root: string; label: string }

export const CLOUD_APPS: { provider: CloudProvider; name: string; download: string }[] = [
  { provider: "onedrive", name: "OneDrive", download: "https://www.microsoft.com/microsoft-365/onedrive/download" },
  { provider: "dropbox", name: "Dropbox", download: "https://www.dropbox.com/install" },
  { provider: "gdrive", name: "Google Drive", download: "https://www.google.com/drive/download/" },
];

/** Applications cloud installées sur ce PC (leur dossier local). */
export const detectCloudFolders = () => invoke<CloudFolder[]>("detect_cloud_folders");
/** Crée le dossier « NATIA-sync » dans le dossier cloud et renvoie son chemin. */
export const prepareCloudFolder = (root: string) => invoke<string>("prepare_cloud_folder", { root });

export const getSyncConfig = () => invoke<[SyncConfig, SyncStatus]>("get_sync_config");
export const setSyncConfig = (config: SyncConfig) => invoke<void>("set_sync_config", { config });

let running = false;

/** Enregistre la note ouverte, synchronise, puis recharge ce qui a changé. */
export async function syncNow(): Promise<SyncStatus | null> {
  if (running) return null;
  running = true;
  try {
    callSaveNow();
    await new Promise((r) => setTimeout(r, 600));
    const status = await invoke<SyncStatus>("run_sync");
    const r = status.report;
    if (!status.error && r && (r.received || r.conflicts || r.deleted)) {
      const st = useStore.getState();
      await Promise.all([st.loadNotes(), st.loadFolders()]);
      // La note ouverte a peut-être été modifiée sur l'autre PC : on la relit.
      const active = useStore.getState().activeNote;
      if (active && useStore.getState().notes.some((n) => n.id === active.id)) await st.selectNote(active.id);
    }
    return status;
  } finally {
    running = false;
  }
}
