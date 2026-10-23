import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderInput, Loader2 } from "lucide-react";
import { useStore } from "../../store";
import { trError, useT } from "../../i18n";

/** Import d'un coffre Obsidian (dossier) ou d'un export Notion (.zip), voir src-tauri/src/md_import.rs. */
export default function ExternalImport() {
  const t = useT();
  const [busy, setBusy] = useState<"obsidian" | "notion" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (source: "obsidian" | "notion") => {
    setMsg(null);
    const picked = source === "obsidian"
      ? await openDialog({ directory: true, multiple: false, title: t("Choisir le dossier du coffre Obsidian") })
      : await openDialog({ multiple: false, title: t("Choisir l'export Notion"), filters: [{ name: t("Export Notion (Markdown)"), extensions: ["zip"] }] });
    if (typeof picked !== "string") return;
    setBusy(source);
    try {
      const r = await invoke<{ imported: number; skipped: number }>("import_markdown", { path: picked });
      const parts = [r.imported === 1 ? t("{n} note importée", { n: 1 }) : t("{n} notes importées", { n: r.imported })];
      if (r.skipped) parts.push(r.skipped === 1 ? t("{n} déjà présente, ignorée", { n: 1 }) : t("{n} déjà présentes, ignorées", { n: r.skipped }));
      setMsg({ ok: true, text: parts.join(" · ") });
      const st = useStore.getState();
      await Promise.all([st.loadNotes(), st.loadFolders()]);
    } catch (e) {
      setMsg({ ok: false, text: trError(e) });
    } finally {
      setBusy(null);
    }
  };

  const button = (source: "obsidian" | "notion", label: string) => (
    <button
      onClick={() => run(source)}
      disabled={busy !== null}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
    >
      {busy === source ? <Loader2 size={11} className="animate-spin" /> : <FolderInput size={11} />}
      {label}
    </button>
  );

  return (
    <div className="border-t border-border/50 pt-3 flex flex-col gap-2">
      <div>
        <p className="text-sm text-secondary">{t("Importer depuis une autre application")}</p>
        <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
          {t("Obsidian : choisissez le dossier du coffre. Notion : Paramètres → Exporter → « Markdown et CSV », puis choisissez le .zip. Dossiers, tags, tâches, images et liens [[…]] sont conservés ; tout est rangé dans un dossier au nom du coffre ou « Notion ».")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {button("obsidian", t("Coffre Obsidian…"))}
        {button("notion", t("Export Notion (.zip)…"))}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-accent" : "text-red-400"}`}>{msg.ok ? "✓ " : ""}{msg.text}</p>}
    </div>
  );
}
