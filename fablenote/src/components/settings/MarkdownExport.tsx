import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileDown, FolderOpen, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { exportAllMarkdown } from "../../lib/markdownExport";
import { trError, useT } from "../../i18n";

/** Paramètres → Données : toutes les notes en fichiers Markdown, lisibles sans NATIA. */
export default function MarkdownExport() {
  const t = useT();
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; dir?: string } | null>(null);

  const run = async () => {
    setResult(null);
    const dir = await openDialog({ directory: true, multiple: false, title: t("Où créer le dossier d'export ?") });
    if (typeof dir !== "string") return;
    const notes = useStore.getState().notes;
    setProgress([0, notes.length]);
    try {
      const target = await exportAllMarkdown(dir, notes, t("Sans titre"), (d, n) => setProgress([d, n]));
      setResult({ ok: true, text: t("{n} notes exportées dans :", { n: notes.length }), dir: target });
    } catch (e) {
      setResult({ ok: false, text: trError(e) });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
      <p className="text-xs text-secondary">{t("Exporter en Markdown")}</p>
      <p className="text-[10px] text-muted leading-relaxed">
        {t("Un fichier .md par note, dans les mêmes dossiers, avec les images et les fichiers joints. Lisible par Obsidian ou n'importe quel éditeur de texte. Attention : ces fichiers ne sont pas chiffrés.")}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={progress !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {progress ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          {progress ? t("Export… {d}/{n}", { d: progress[0], n: progress[1] }) : t("Exporter toutes les notes (.md)")}
        </button>
      </div>
      {result && (
        <div className={`text-xs ${result.ok ? "text-accent" : "text-red-400"}`}>
          {result.ok ? "✓ " : ""}{result.text}
          {result.dir && (
            <button
              onClick={() => invoke("open_markdown_export").catch(() => {})}
              className="flex items-center gap-1 mt-0.5 text-[11px] text-muted hover:text-primary break-all text-left"
            >
              <FolderOpen size={11} className="shrink-0" />{result.dir}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
