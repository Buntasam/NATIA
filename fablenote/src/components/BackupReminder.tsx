import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useStore } from "../store";
import { formatLastBackup, isBackupDue, snoozeBackupReminder } from "../lib/backupReminder";
import { useT } from "../i18n";

const CHECK_EVERY_MS = 60 * 60 * 1000;

export default function BackupReminder() {
  const notesCount = useStore((s) => s.notes.length);
  const showSettings = useStore((s) => s.showSettings);
  const [due, setDue] = useState(false);
  const t = useT();

  useEffect(() => {
    const check = () => setDue(isBackupDue());
    check();
    const id = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Rien à sauvegarder, ou l'utilisateur est déjà dans les paramètres.
  if (!due || notesCount === 0 || showSettings) return null;

  const later = () => { snoozeBackupReminder(); setDue(false); };
  const openExport = () => {
    setDue(false);
    localStorage.setItem("natia_settings_cat", "data");
    useStore.getState().toggleSettings();
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 w-80 rounded-xl border border-border bg-panel shadow-2xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
          <Download size={15} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary">{t("C'est le moment de sauvegarder")}</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            {t("Dernière sauvegarde : {date}. Un export protégé permet de retrouver vos notes si vous changez de PC ou réinstallez Windows.", { date: formatLastBackup() })}
          </p>
        </div>
        <button onClick={later} aria-label={t("Fermer")} className="text-muted hover:text-primary transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={later} className="flex-1 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">
          {t("Plus tard")}
        </button>
        <button onClick={openExport} className="flex-1 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors">
          {t("Sauvegarder maintenant")}
        </button>
      </div>
    </div>
  );
}
