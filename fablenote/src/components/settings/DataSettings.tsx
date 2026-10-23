import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Download, FolderOpen, Trash2 as TrashIcon, Upload } from "lucide-react";
import { useStore } from "../../store";
import ResetConfirmDialog from "../ResetConfirmDialog";
import AutoBackupSettings from "./AutoBackupSettings";
import ExternalImport from "./ExternalImport";
import { formatLastBackup, isBackupReminderEnabled, recordBackup, setBackupReminderEnabled } from "../../lib/backupReminder";
import { Section, SecInput } from "./SettingsWidgets";
import { msg, trError, useT } from "../../i18n";

export default function DataSettings() {
  const { hasPassword } = useStore();
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportMode, setExportMode] = useState<"plain" | "aes" | "windows">(hasPassword ? "aes" : "plain");
  const [exportPw, setExportPw] = useState("");
  const [exportPw2, setExportPw2] = useState("");
  const [exportShowPw, setExportShowPw] = useState(false);
  const [exportError, setExportError] = useState("");
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importPw, setImportPw] = useState("");
  const [importShowPw, setImportShowPw] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const uninstallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRevealData = async () => {
    await invoke("reveal_data_dir");
  };
  // window.confirm() ne s'affiche pas dans Tauri : on passe par la boîte de confirmation de l'app.
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [reminderOn, setReminderOn] = useState(isBackupReminderEnabled);
  const [lastBackup, setLastBackup] = useState(() => formatLastBackup());

  const handleExport = async () => {
    const isProtected = exportMode !== "plain";
    if (isProtected) {
      if (exportPw.length < 8) { setExportError(t("Mot de passe d'export : 8 caractères minimum")); return; }
      if (exportMode === "windows" && !/^[ -~]+$/.test(exportPw)) { setExportError(t("Mode compatible Windows : lettres sans accent, chiffres et symboles uniquement")); return; }
      if (exportPw !== exportPw2) { setExportError(t("Les mots de passe ne correspondent pas")); return; }
    }
    setExportError("");
    const date = new Date().toISOString().slice(0, 10);
    const filePath = await save({
      defaultPath: `natia-export-${date}${isProtected ? "-protege" : ""}.zip`,
      filters: [{ name: t("Archive ZIP"), extensions: ["zip"] }],
    });
    if (!filePath) return;
    setExporting(true);
    setExportDone(false);
    try {
      await invoke("save_zip_to_path", { path: filePath, password: isProtected ? exportPw : null, mode: isProtected ? exportMode : null });
      setExportPw(""); setExportPw2("");
      recordBackup();
      setLastBackup(formatLastBackup());
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (e) { setExportError(trError(e)); }
    finally { setExporting(false); }
  };

  const runImport = async (path: string, password: string | null) => {
    setImporting(true); setImportMsg(null);
    try {
      const r = await invoke<{ imported: number; skipped: number }>("import_zip", { path, password });
      setImportPath(null); setImportPw("");
      const parts = [r.imported === 1 ? t("{n} note importée", { n: r.imported }) : t("{n} notes importées", { n: r.imported })];
      if (r.skipped) parts.push(r.skipped === 1 ? t("{n} déjà présente, ignorée", { n: r.skipped }) : t("{n} déjà présentes, ignorées", { n: r.skipped }));
      setImportMsg({ ok: true, text: parts.join(" · ") });
      const st = useStore.getState();
      await Promise.all([st.loadNotes(), st.loadFolders()]);
    } catch (e) { setImportMsg({ ok: false, text: trError(e) }); }
    finally { setImporting(false); }
  };

  const handleImport = async () => {
    setImportMsg(null); setImportPath(null); setImportPw("");
    const picked = await openDialog({ multiple: false, filters: [{ name: t("Sauvegarde NATIA"), extensions: ["zip"] }] });
    if (typeof picked !== "string") return;
    try {
      const info = await invoke<{ protected: boolean }>("inspect_import", { path: picked });
      if (info.protected) setImportPath(picked);
      else await runImport(picked, null);
    } catch (e) { setImportMsg({ ok: false, text: trError(e) }); }
  };
  return (
    <>
      <Section title={t("Sauvegarde")}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-secondary">{t("Exporter toutes les notes")}</p>
            <p className="text-[10px] text-muted mt-0.5">{t("Archive ZIP · dossiers, sous-dossiers et fichiers HTML inclus · dernière sauvegarde : {date}", { date: lastBackup })}</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-secondary">{t("Me rappeler de sauvegarder chaque semaine")}</p>
              <p className="text-[10px] text-muted mt-0.5">{t("Une petite fenêtre le propose si aucun export n'a été fait depuis 7 jours")}</p>
            </div>
            <button
              role="switch"
              aria-checked={reminderOn}
              onClick={() => { setBackupReminderEnabled(!reminderOn); setReminderOn(!reminderOn); }}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${reminderOn ? "bg-accent" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${reminderOn ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          <div className="flex gap-2">
            {([
              ["plain", msg("Classique (en clair)")],
              ["aes", msg("Protégé (AES-256)")],
              ["windows", msg("Compatible Windows")],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setExportMode(m); setExportError(""); }}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${exportMode === m ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary hover:text-primary"}`}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {exportMode === "plain" && (
            <p className="text-[10px] text-amber-500/90 leading-relaxed">
              {t("Les notes seront lisibles par toute personne qui accède au fichier.")}
            </p>
          )}
          {exportMode === "aes" && (
            <p className="text-[10px] text-muted leading-relaxed">
              {t("Chiffrement solide : sans le mot de passe, rien n'est récupérable, pas même les titres.")} <strong className="text-secondary">{t("L'Explorateur Windows ne sait pas l'ouvrir")}</strong> {t(": installez 7-Zip (gratuit), puis clic droit sur le fichier → 7-Zip → Extraire. Ne dépend pas de ce PC : c'est la sauvegarde pour changer d'ordinateur.")}
            </p>
          )}
          {exportMode === "windows" && (
            <p className="text-[10px] text-amber-500/90 leading-relaxed">
              {t("S'ouvre par double-clic dans Windows, qui demande le mot de passe à l'extraction.")} <strong>{t("Chiffrement faible")}</strong> {t(": il arrête un curieux, mais quelqu'un qui sait chercher le casse en quelques minutes sans le mot de passe. À éviter pour des notes sensibles.")}
            </p>
          )}
          {exportMode !== "plain" && (
            <>
              <p className="text-[10px] text-muted leading-relaxed">
                {t("L'archive contient un seul fichier,")} <code className="text-accent">NATIA-notes.zip</code>{t(", qui renferme les notes : il faut l'extraire puis l'ouvrir à son tour.")}
              </p>
              <SecInput label={t("Mot de passe d'export (min. 8 car.)")} value={exportPw} onChange={setExportPw} show={exportShowPw} onToggleShow={() => setExportShowPw(s => !s)} />
              <SecInput label={t("Confirmer")} value={exportPw2} onChange={setExportPw2} show={exportShowPw} onToggleShow={() => setExportShowPw(s => !s)} />
            </>
          )}
          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
          <button onClick={handleExport} disabled={exporting || (exportMode !== "plain" && (!exportPw || !exportPw2))} className="self-end flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50">
            <Download size={11} className={exporting ? "animate-bounce" : exportDone ? "text-accent" : ""} />
            {exporting ? t("Export…") : exportDone ? t("Exporté ✓") : t("Exporter (.zip)")}
          </button>

          <div className="border-t border-border/50 pt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-secondary">{t("Importer une sauvegarde")}</p>
                <p className="text-[10px] text-muted mt-0.5">{t("Les trois formats d'export · les notes déjà présentes sont ignorées")}</p>
              </div>
              <button onClick={handleImport} disabled={importing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0">
                <Upload size={11} className={importing ? "animate-bounce" : ""} />
                {importing ? t("Import…") : t("Importer (.zip)")}
              </button>
            </div>
            {importPath && (
              <>
                <p className="text-[10px] text-muted leading-relaxed">{t("Sauvegarde protégée : saisissez le mot de passe choisi lors de l'export.")}</p>
                <SecInput label={t("Mot de passe de la sauvegarde")} value={importPw} onChange={setImportPw} show={importShowPw} onToggleShow={() => setImportShowPw(s => !s)} />
                <div className="flex gap-2">
                  <button onClick={() => { setImportPath(null); setImportPw(""); }} className="flex-1 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
                  <button onClick={() => runImport(importPath, importPw)} disabled={importing || !importPw} className="flex-1 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{importing ? t("Import…") : t("Importer")}</button>
                </div>
              </>
            )}
            {importMsg && <p className={`text-xs ${importMsg.ok ? "text-accent" : "text-red-400"}`}>{importMsg.ok ? "✓ " : ""}{importMsg.text}</p>}
          </div>

          <ExternalImport />
        </div>
      </Section>

      <AutoBackupSettings />

      <Section title={t("Désinstallation")}>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted leading-relaxed">
            {t("Pour désinstaller NATIA, ouvre le dossier de données et supprime-le manuellement. Toutes tes notes et paramètres seront effacés.")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRevealData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors"
            >
              <FolderOpen size={11} />
              {t("Ouvrir le dossier de données")}
            </button>
            <button
              onClick={() => setShowResetDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 hover:bg-red-400/15 hover:border-red-400/30 transition-colors"
            >
              <AlertTriangle size={11} />
              {t("Réinitialiser l'app")}
            </button>
            <button
              onClick={() => {
                if (uninstallConfirm) {
                  if (uninstallTimer.current) clearTimeout(uninstallTimer.current);
                  setUninstallConfirm(false);
                } else {
                  setUninstallConfirm(true);
                  uninstallTimer.current = setTimeout(() => setUninstallConfirm(false), 5000);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                uninstallConfirm
                  ? "bg-red-400/10 border-red-400/30 text-red-400"
                  : "bg-hover border-border text-muted hover:text-red-400 hover:border-red-400/30"
              }`}
            >
              <TrashIcon size={11} />
              {uninstallConfirm ? t("Ouvre le dossier ci-dessus et supprime-le ↑") : t("Désinstaller…")}
            </button>
          </div>
        </div>
      </Section>
      <ResetConfirmDialog isOpen={showResetDialog} onClose={() => setShowResetDialog(false)} />
    </>
  );
}
