import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Database, Download } from "lucide-react";
import { useLocale, useT } from "../../i18n";
import { Section } from "./SettingsWidgets";
import LegalDocs from "../legal/LegalDocs";

interface TermsAcceptance { version: string; accepted_at: string }

/** Paramètres → Confidentialité : textes acceptés, date d'acceptation, exercice des droits RGPD. */
export default function LegalSettings({ goTo }: { goTo: (cat: "data") => void }) {
  const t = useT();
  const loc = useLocale();
  const [acceptance, setAcceptance] = useState<TermsAcceptance | null>(null);

  useEffect(() => {
    invoke<TermsAcceptance | null>("get_terms_acceptance").then(setAcceptance).catch(() => {});
  }, []);

  return (
    <>
      <Section title={t("Vos données, vos droits")}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-secondary leading-relaxed">
            {t("NATIA ne collecte aucune donnée : tout reste sur ce PC, sauf ce que vous envoyez vous-même à une IA en ligne. Vous pouvez à tout moment exporter ou effacer l'ensemble de vos données.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => goTo("data")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors">
              <Download size={11} />{t("Exporter mes données")}
            </button>
            <button onClick={() => goTo("data")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-red-400 hover:border-red-400/40 transition-colors">
              <Database size={11} />{t("Tout effacer (réinitialiser)")}
            </button>
          </div>
          {acceptance && (
            <p className="text-[11px] text-muted flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-green-500 shrink-0" />
              {t("Conditions acceptées le {date} (version du {v})", {
                date: new Date(acceptance.accepted_at).toLocaleString(loc, { dateStyle: "long", timeStyle: "short" }),
                v: new Date(`${acceptance.version}T12:00:00`).toLocaleDateString(loc, { dateStyle: "long" }),
              })}
            </p>
          )}
        </div>
      </Section>

      <Section title={t("Textes")}>
        <LegalDocs initial="privacy" />
      </Section>
    </>
  );
}
