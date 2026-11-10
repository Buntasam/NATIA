import { invoke } from "@tauri-apps/api/core";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useStore } from "../store";
import { useLang } from "../i18n";
import { getBuffer } from "../debug/logger";
import { useSyncState } from "./sync";

// « Copier le diagnostic » (Paramètres → Application, mode débogage) : de quoi comprendre
// un problème, sans le contenu des notes, ni mot de passe, ni clé API, ni chemin personnel.

/** Masque ce qui pourrait identifier la personne ou ouvrir un accès. */
export function redact(text: string): string {
  return text
    .replace(/\b[A-Z]:\\Users\\[^\\\s"'<>|]+/gi, (m) => m.slice(0, 9) + "…")
    .replace(/\/(?:home|Users)\/[^/\s"']+/g, (m) => m.split("/").slice(0, 2).join("/") + "/…")
    .replace(/\b(sk-(?:ant-|proj-)?|AIza|gsk_)[\w-]{6,}/g, "[clé masquée]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[e-mail masqué]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]");
}

interface LlmModel { id: string; installed: boolean }
interface LlmStatus {
  engine_installed: boolean;
  engine_version: string;
  models: LlmModel[];
  embed_model: LlmModel;
  ram_gb: number;
  gpu: { name: string } | null;
  running: string | null;
}

const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

export async function buildDiagnostics(): Promise<string> {
  const st = useStore.getState();
  const s = st.settings;
  const [version, tauri, llm, attachments, tasks, backup] = await Promise.all([
    safe(getVersion()), safe(getTauriVersion()),
    safe(invoke<LlmStatus>("llm_status")),
    safe(invoke<unknown[]>("list_attachments", { noteId: null })),
    safe(invoke<{ checked: boolean }[]>("get_all_tasks")),
    safe(invoke<[{ enabled: boolean; frequency?: string }, { last: string | null; error: string | null }]>("get_backup_config")),
  ]);
  const sync = useSyncState.getState();

  const lines: string[] = [
    "# Diagnostic NATIA",
    `Date : ${new Date().toISOString()}`,
    "",
    "## Application",
    `NATIA ${version ?? "?"} · Tauri ${tauri ?? "?"}`,
    `Système : ${navigator.userAgent}`,
    `Langue : ${useLang.getState().lang} · thème : ${st.theme} · écran : ${window.screen.width}×${window.screen.height} (×${window.devicePixelRatio})`,
    "",
    "## Données",
    `Notes : ${st.notes.length} · dossiers : ${st.folders.length} · fichiers joints : ${attachments?.length ?? "?"}`,
    `Tâches : ${tasks ? `${tasks.length} (${tasks.filter((x) => !x.checked).length} à faire)` : "?"}`,
    `Mot de passe : ${st.hasPassword ? st.passwordType : "aucun"} · verrouillage auto : ${s.auto_lock_minutes || "non"}`,
    `Enregistrement : ${st.saveMode} · versions gardées : ${st.versionLimit ?? "illimité"}`,
    "",
    "## IA",
    `Fournisseur : ${s.ai_provider} · modèle Ollama : ${s.default_model} · modèle intégré : ${s.local_model || "auto"}`,
    `Mémoire : ${st.memoryEnabled ? "activée" : "non"} · contexte : ${s.context_messages || "illimité"} · température : ${s.temperature}`,
  ];
  if (llm) {
    lines.push(
      `IA intégrée : moteur ${llm.engine_installed ? llm.engine_version : "non installé"} · en cours : ${llm.running ?? "aucun"}`,
      `Modèles installés : ${llm.models.filter((m) => m.installed).map((m) => m.id).join(", ") || "aucun"} · recherche intelligente : ${llm.embed_model.installed ? "oui" : "non"}`,
      `RAM : ${llm.ram_gb.toFixed(1)} Go · carte graphique : ${llm.gpu?.name ?? "aucune détectée"}`,
    );
  }
  lines.push(
    "",
    "## Synchronisation et sauvegarde",
    `Synchronisation : ${sync.enabled ? "activée" : "non"} · dernière : ${sync.status?.last ?? "jamais"} · erreur : ${sync.status?.error || "aucune"}`,
    `Sauvegarde auto : ${backup ? (backup[0].enabled ? `activée (${backup[0].frequency ?? "?"})` : "non") : "?"} · dernière : ${backup?.[1].last ?? "jamais"} · erreur : ${backup?.[1].error || "aucune"}`,
    "",
    "## Derniers messages (avertissements, erreurs, IA)",
  );
  const logs = getBuffer().filter((e) => e.level !== "log" && e.level !== "info").slice(-40);
  if (logs.length === 0) lines.push("(aucun)");
  for (const e of logs) {
    lines.push(`${new Date(e.ts).toISOString().slice(11, 19)} [${e.level}] ${e.source} : ${e.msg.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  return redact(lines.join("\n"));
}
