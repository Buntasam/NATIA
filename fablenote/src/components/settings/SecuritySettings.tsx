import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Clock, KeyRound, Lock, LogOut, Shield, ShieldOff } from "lucide-react";
import { useStore } from "../../store";
import { lockSafely } from "../../lib/lockSafely";
import { Section, SecInput } from "./SettingsWidgets";
import { SettingsFormProps } from "./types";
import PasswordStrengthMeter from "../PasswordStrengthMeter";
import RecoveryCodeDialog from "../RecoveryCodeDialog";
import { trError, useT } from "../../i18n";

export default function SecuritySettings({ form, set }: Pick<SettingsFormProps, "form" | "set">) {
  const { hasPassword, passwordType, setupPassword, changePassword, removePassword, toggleSettings } = useStore();
  const t = useT();
  type SecMode = "idle" | "setup" | "change" | "remove" | "recovery";
  const [secMode, setSecMode] = useState<SecMode>("idle");
  const [secPwType, setSecPwType] = useState<"pin" | "alpha">("alpha");
  const [secA, setSecA] = useState("");
  const [secB, setSecB] = useState("");
  const [secC, setSecC] = useState("");
  const [secError, setSecError] = useState("");
  const [secLoading, setSecLoading] = useState(false);
  const [secShowA, setSecShowA] = useState(false);
  const [secShowB, setSecShowB] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [hasRecovery, setHasRecovery] = useState(true);

  useEffect(() => {
    if (!hasPassword) return;
    invoke<boolean>("has_recovery_code").then(setHasRecovery).catch(() => {});
  }, [hasPassword]);

  const cancelSec = () => { setSecMode("idle"); setSecA(""); setSecB(""); setSecC(""); setSecError(""); };

  const doSetup = async () => {
    if (secPwType === "pin" && !/^\d{6,8}$/.test(secA)) { setSecError(t("PIN : 6 à 8 chiffres requis")); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError(t("Minimum 6 caractères")); return; }
    if (secA !== secB) { setSecError(t("Les mots de passe ne correspondent pas")); return; }
    setSecLoading(true); setSecError("");
    try {
      const code = await setupPassword(secA, secPwType);
      cancelSec();
      setHasRecovery(true);
      setShownCode(code);
    }
    catch (e) { setSecError(trError(e)); }
    finally { setSecLoading(false); }
  };

  const doCreateRecovery = async () => {
    setSecLoading(true); setSecError("");
    try {
      const code = await invoke<string>("create_recovery_code", { password: secA });
      cancelSec();
      setHasRecovery(true);
      setShownCode(code);
    }
    catch (e) { setSecError(trError(e)); }
    finally { setSecLoading(false); }
  };

  const doChange = async () => {
    if (secA !== secB) { setSecError(t("Les nouveaux mots de passe ne correspondent pas")); return; }
    if (secPwType === "pin" && !/^\d{6,8}$/.test(secA)) { setSecError(t("PIN : 6 à 8 chiffres requis")); return; }
    if (secPwType === "alpha" && secA.length < 6) { setSecError(t("Minimum 6 caractères")); return; }
    setSecLoading(true); setSecError("");
    try { await changePassword(secC, secA, secPwType); cancelSec(); }
    catch (e) { setSecError(trError(e)); }
    finally { setSecLoading(false); }
  };

  const doRemove = async () => {
    setSecLoading(true); setSecError("");
    try { await removePassword(secA); cancelSec(); }
    catch (e) { setSecError(trError(e)); }
    finally { setSecLoading(false); }
  };
  return (
    <Section title={t("Sécurité")}>
      {!hasPassword && secMode === "idle" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-secondary">{t("Protection par mot de passe")}</p>
              <p className="text-[10px] text-muted mt-0.5">{t("Notes non chiffrées · Clés API protégées par le coffre Windows · AES-256-GCM disponible")}</p>
            </div>
            <button onClick={() => setSecMode("setup")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">
              <Shield size={11} />{t("Activer")}
            </button>
          </div>
        </div>
      )}

      {hasPassword && secMode === "idle" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Shield size={13} className="text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-green-400 font-medium">{t("Données chiffrées — AES-256-GCM")}</p>
              <p className="text-[10px] text-muted">{t("Type : {type} · dérivation de clé Argon2id", { type: passwordType === "pin" ? t("Code PIN") : t("Alphanumérique") })}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={async () => { await lockSafely(); toggleSettings(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">
              <Lock size={11} />{t("Verrouiller maintenant")}
            </button>
            <button onClick={() => { setSecMode("change"); setSecPwType(passwordType); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">
              <LogOut size={11} />{t("Changer le mot de passe")}
            </button>
            <button onClick={() => setSecMode("remove")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 hover:bg-red-400/15 transition-colors">
              <ShieldOff size={11} />{t("Désactiver")}
            </button>
          </div>
          {hasRecovery ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <KeyRound size={12} className="text-muted shrink-0" />
                <div>
                  <p className="text-xs text-secondary">{t("Clé de récupération active")}</p>
                  <p className="text-[10px] text-muted">{t("En cas d'oubli du mot de passe ou de changement de PC")}</p>
                </div>
              </div>
              <button onClick={() => setSecMode("recovery")} className="px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors shrink-0">
                {t("Nouvelle clé")}
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-500 font-medium">{t("Aucune clé de récupération")}</p>
                <p className="text-[10px] text-muted leading-relaxed">{t("Sans elle, un oubli du mot de passe ou une réinstallation de Windows rend vos notes illisibles.")}</p>
              </div>
              <button onClick={() => setSecMode("recovery")} className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">
                {t("Créer")}
              </button>
            </div>
          )}
        </div>
      )}

      {secMode === "recovery" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted leading-relaxed">
            {hasRecovery ? `${t("Une nouvelle clé remplace l'ancienne, qui ne fonctionnera plus.")} ` : ""}
            {t("Confirmez votre mot de passe pour afficher la clé.")}
          </p>
          <SecInput label={t("Mot de passe actuel")} value={secA} onChange={setSecA} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
            <button onClick={doCreateRecovery} disabled={secLoading || !secA} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? t("Vérification…") : t("Afficher la clé")}</button>
          </div>
        </div>
      )}

      {shownCode && <RecoveryCodeDialog code={shownCode} onClose={() => setShownCode(null)} />}

      {secMode === "setup" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-secondary">{t("Type de mot de passe")}</p>
          <div className="flex gap-2">
            {(["alpha", "pin"] as const).map((ty) => (
              <button key={ty} onClick={() => setSecPwType(ty)} className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${secPwType === ty ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary hover:text-primary"}`}>
                {ty === "pin" ? t("Code PIN (0-9)") : t("Alphanumérique")}
              </button>
            ))}
          </div>
          {secPwType === "pin" && (
            <p className="text-[10px] text-amber-500/90 leading-relaxed">
              {t("Un PIN se devine plus facilement qu'un mot de passe. Pour des notes sensibles, préférez un mot de passe long.")}
            </p>
          )}
          <SecInput label={secPwType === "pin" ? t("Code PIN (6–8 chiffres)") : t("Mot de passe (min. 6 car.)")} value={secA} onChange={setSecA} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          <PasswordStrengthMeter value={secA} type={secPwType} />
          <SecInput label={t("Confirmer")} value={secB} onChange={setSecB} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          <p className="text-[10px] text-muted leading-relaxed">
            {t("Le mot de passe est lié à ce PC et à votre session Windows : une copie de vos données ne s'ouvre pas ailleurs avec lui. Une clé de récupération vous sera donnée : elle seule permet de rouvrir vos notes sur un autre PC ou en cas d'oubli.")}
          </p>
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
            <button onClick={doSetup} disabled={secLoading || !secA || !secB} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? t("Chiffrement…") : t("Activer")}</button>
          </div>
        </div>
      )}

      {secMode === "change" && (
        <div className="flex flex-col gap-3">
          <SecInput label={t("Ancien mot de passe")} value={secC} onChange={setSecC} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          <div className="flex gap-2">
            {(["alpha", "pin"] as const).map((ty) => (
              <button key={ty} onClick={() => setSecPwType(ty)} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${secPwType === ty ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-secondary"}`}>
                {ty === "pin" ? t("PIN") : t("Alphanumérique")}
              </button>
            ))}
          </div>
          {secPwType === "pin" && (
            <p className="text-[10px] text-amber-500/90 leading-relaxed">
              {t("Un PIN se devine plus facilement qu'un mot de passe. Pour des notes sensibles, préférez un mot de passe long.")}
            </p>
          )}
          <SecInput label={secPwType === "pin" ? t("Nouveau PIN (6–8 chiffres)") : t("Nouveau mot de passe")} value={secA} onChange={setSecA} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          <PasswordStrengthMeter value={secA} type={secPwType} />
          <SecInput label={t("Confirmer le nouveau")} value={secB} onChange={setSecB} show={secShowB} onToggleShow={() => setSecShowB(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
            <button onClick={doChange} disabled={secLoading || !secA || !secB || !secC} className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? t("Rechiffrement…") : t("Changer")}</button>
          </div>
        </div>
      )}

      {secMode === "remove" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">{t("Confirme ton mot de passe pour désactiver le chiffrement. Toutes les données seront déchiffrées.")}</p>
          <SecInput label={t("Mot de passe actuel")} value={secA} onChange={setSecA} show={secShowA} onToggleShow={() => setSecShowA(s => !s)} />
          {secError && <p className="text-xs text-red-400">{secError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelSec} className="flex-1 py-2 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors">{t("Annuler")}</button>
            <button onClick={doRemove} disabled={secLoading || !secA} className="flex-1 py-2 rounded-lg bg-red-400/80 hover:bg-red-400 text-white text-xs font-medium transition-colors disabled:opacity-50">{secLoading ? t("Déchiffrement…") : t("Désactiver")}</button>
          </div>
        </div>
      )}
      {secMode === "idle" && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-muted" />
            <div>
              <p className="text-xs text-secondary">{t("Verrouillage automatique")}</p>
              <p className="text-[10px] text-muted">{t("après inactivité")}</p>
            </div>
          </div>
          <select
            value={form.auto_lock_minutes}
            onChange={(e) => set("auto_lock_minutes", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50"
          >
            <option value={0}>{t("Désactivé")}</option>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>{t("1 heure")}</option>
          </select>
        </div>
      )}
    </Section>
  );
}
