import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import { MIN_SHARE_PASSWORD, buildProtectedHtml } from "../lib/secureShare";
import { trError, useT } from "../i18n";

/** « Partager (protégé par mot de passe) » : enregistre la note en page HTML chiffrée. */
export default function ShareDialog({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedTo, setSavedTo] = useState("");

  const tooShort = pw.length < MIN_SHARE_PASSWORD;
  const mismatch = pw2.length > 0 && pw !== pw2;

  const submit = async () => {
    if (tooShort || pw !== pw2 || busy) return;
    setError("");
    const name = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "note";
    const path = await save({
      defaultPath: `${name} (${t("protégé")}).html`,
      filters: [{ name: t("Page HTML"), extensions: ["html"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const page = await buildProtectedHtml(title, html, pw, document.documentElement.lang || "fr");
      await invoke("write_export_file", { path, content: page });
      setSavedTo(path);
    } catch (e) {
      setError(trError(e));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2 rounded-lg border border-border bg-base text-sm text-primary outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Partager la note")}>
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-[420px] max-w-[92vw] bg-panel border border-border rounded-xl shadow-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent" />
          <span className="text-sm font-medium text-primary flex-1">{t("Partager la note")}</span>
          <button onClick={onClose} aria-label={t("Fermer")} className="p-1 text-muted hover:text-primary"><X size={14} /></button>
        </div>

        {savedTo ? (
          <>
            <p className="text-sm text-secondary">{t("Fichier enregistré :")}</p>
            <p className="text-xs text-muted break-all">{savedTo}</p>
            <p className="text-xs text-secondary leading-relaxed">
              {t("Envoyez le fichier par mail ou messagerie, et le mot de passe par un autre moyen (SMS, appel). Il s'ouvre dans n'importe quel navigateur, sans NATIA.")}
            </p>
            <button onClick={onClose} className="self-end px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover">{t("Terminé")}</button>
          </>
        ) : (
          <>
            <p className="text-xs text-secondary leading-relaxed">
              {t("La note devient une page HTML chiffrée. Sans le mot de passe, personne ne peut la lire, pas même son titre. Les fichiers joints ne sont pas inclus.")}
            </p>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={t("Mot de passe ({n} caractères minimum)", { n: MIN_SHARE_PASSWORD })}
                aria-label={t("Mot de passe")}
                autoFocus
                className={input}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("Masquer") : t("Afficher")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {pw && <PasswordStrengthMeter value={pw} type="alpha" />}
            <input
              type={show ? "text" : "password"}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder={t("Confirmer le mot de passe")}
              aria-label={t("Confirmer le mot de passe")}
              className={input}
            />
            {mismatch && <p className="text-xs text-red-500">{t("Les deux mots de passe ne correspondent pas")}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-secondary hover:bg-hover">{t("Annuler")}</button>
              <button
                onClick={submit}
                disabled={tooShort || pw !== pw2 || busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-40"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {t("Enregistrer le fichier")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
