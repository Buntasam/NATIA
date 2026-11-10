import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useStore } from "../store";
import { callSaveNow } from "../components/CloseOverlay";
import { indexAttachments } from "./attachments";

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

/** État affiché par l'indicateur de la barre latérale. */
export interface SyncIndicator {
  /** Synchronisation activée dans les paramètres. */
  enabled: boolean;
  running: boolean;
  status: SyncStatus | null;
}

export const useSyncState = create<SyncIndicator>(() => ({ enabled: false, running: false, status: null }));

export async function getSyncConfig(): Promise<[SyncConfig, SyncStatus]> {
  const res = await invoke<[SyncConfig, SyncStatus]>("get_sync_config");
  useSyncState.setState({ enabled: res[0].enabled, status: res[1] });
  return res;
}

export async function setSyncConfig(config: SyncConfig): Promise<void> {
  await invoke<void>("set_sync_config", { config });
  useSyncState.setState({ enabled: config.enabled });
}

/** Recharge l'état (au déverrouillage) sans synchroniser. */
export function refreshSyncState() {
  getSyncConfig().catch(() => useSyncState.setState({ enabled: false, status: null }));
}

/** Enregistre la note ouverte, synchronise, puis recharge ce qui a changé. */
export async function syncNow(): Promise<SyncStatus | null> {
  if (useSyncState.getState().running) return null;
  useSyncState.setState({ running: true });
  try {
    callSaveNow();
    await new Promise((r) => setTimeout(r, 600));
    const status = await invoke<SyncStatus>("run_sync");
    useSyncState.setState({ status });
    const r = status.report;
    if (!status.error && r && (r.received || r.conflicts || r.deleted)) {
      const st = useStore.getState();
      await Promise.all([st.loadNotes(), st.loadFolders()]);
      indexAttachments();
      // La note ouverte a peut-être été modifiée sur l'autre PC : on la relit.
      const active = useStore.getState().activeNote;
      if (active && useStore.getState().notes.some((n) => n.id === active.id)) await st.selectNote(active.id);
    }
    return status;
  } catch (e) {
    const prev = useSyncState.getState().status;
    useSyncState.setState({ status: { last: prev?.last ?? null, report: prev?.report ?? null, error: String(e) } });
    throw e;
  } finally {
    useSyncState.setState({ running: false });
  }
}
