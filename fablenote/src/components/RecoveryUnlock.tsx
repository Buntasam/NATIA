import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useStore } from "../store";
import { SecInput } from "./settings/SettingsWidgets";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import { trError, useT } from "../i18n";

// Écran de verrouillage → « Mot de passe oublié » : la clé de récupération
// déverrouille les notes et remplace le mot de passe (aussi sur un nouveau PC).
export default function RecoveryUnlock({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const recoverWithCode = useStore((s) => s.recoverWithCode);
  const t = useT();
  const [code, setCode] = useState("");
  const [pwType, setPwType] = useState<"pin" | "alpha">("alpha");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (pwType === "pin" && !/^\d{4,8}$/.test(pw)) { setError(t("PIN : 4 à 8 chiffres requis")); return; }
    if (pwType === "alpha" && pw.length < 6) { setError(t("Minimum 6 caractères")); return; }
    if (pw !== confirm) { setError(t("Les mots de passe ne correspondent pas")); return; }
    setLoading(true); setError("");
    try {
      if (await recoverWithCode(code, pw, pwType)) onDone();
      else setError(t("Clé de récupération incorrecte"));
    } catch (e) {
      setError(trError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-3">
        <div className="flex items-start gap-3 mb-1">
          <KeyRound size={20} className="text-accent mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-primary">{t("Utiliser la clé de récupération")}</h2>
            <p className="text-sm text-muted mt-1">
              {t("Saisissez la clé reçue à l'activation du mot de passe, puis choisissez un nouveau mot de passe.")}
            </p>
          </div>
        </div>

        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-wider text-primary outline-none focus:border-accent/50 transition-colors"
        />

        <div className="flex gap-2">
          {(["alpha", "pin"] as const).map((ty) => (
            <button key={ty} onClick={() => setPwType(ty)} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${pwType === ty ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary hover:text-primary"}`}>
              {ty === "pin" ? t("Code PIN") : t("Mot de passe")}
            </button>
          ))}
        </div>
        <SecInput label={pwType === "pin" ? t("Nouveau PIN (4–8 chiffres)") : t("Nouveau mot de passe")} value={pw} onChange={setPw} show={show} onToggleShow={() => setShow((s) => !s)} />
        <PasswordStrengthMeter value={pw} type={pwType} />
        <SecInput label={t("Confirmer")} value={confirm} onChange={setConfirm} show={show} onToggleShow={() => setShow((s) => !s)} />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-hover border border-border text-sm text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
          <button onClick={submit} disabled={loading || !code || !pw || !confirm} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? t("Vérification…") : t("Déverrouiller")}
          </button>
        </div>
      </div>
    </div>
  );
}
