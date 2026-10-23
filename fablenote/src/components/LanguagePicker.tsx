import { LANGUAGES, Lang, useLang, useT } from "../i18n";
import flagEn from "../assets/flags/en.png";
import flagFr from "../assets/flags/fr.png";

const FLAGS: Record<Lang, string> = { fr: flagFr, en: flagEn };

/** Choix de la langue par drapeaux (Paramètres → Apparence, écran des conditions). */
export default function LanguagePicker() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div role="radiogroup" aria-label={t("Langue de l'application")} className="flex gap-1.5 shrink-0">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
            lang === l.code ? "bg-accent/15 border-accent/40 text-accent font-medium" : "bg-hover border-border text-secondary hover:text-primary"
          }`}
        >
          <img src={FLAGS[l.code]} alt="" width={24} height={16} className="rounded-[2px] shadow-sm" />
          {l.label}
        </button>
      ))}
    </div>
  );
}
