import { invoke } from "@tauri-apps/api/core";
import { recordBackup } from "./backupReminder";

// Sauvegarde automatique (voir src-tauri/src/backup.rs) : la décision de sauvegarder
// est prise côté Rust ; l'interface demande seulement régulièrement si c'est le moment.

export interface BackupConfig {
  enabled: boolean;
  dir: string;
  frequency: "daily" | "weekly";
  keep: number;
  password: string;
}

export interface BackupStatus { last: string | null; error: string | null }
export interface BackupFile { name: string; size: number }

export const getBackupConfig = () => invoke<[BackupConfig, BackupStatus]>("get_backup_config");
export const setBackupConfig = (config: BackupConfig) => invoke<void>("set_backup_config", { config });

export const listBackups = () => invoke<BackupFile[]>("list_backups");
export const restoreBackup = (name: string, password: string | null) =>
  invoke<{ imported: number; skipped: number }>("restore_backup", { name, password });

/** Sauvegarde si elle est due (`now` : tout de suite). Une réussite compte aussi pour le rappel hebdomadaire. */
export async function runBackup(now: boolean): Promise<BackupStatus> {
  const status = await invoke<BackupStatus>("run_backup", { now });
  if (status.last && !status.error) recordBackup(Date.parse(status.last));
  return status;
}
