import { LANGUAGES, Lang, useT } from "../i18n";
import { usePromptLang, usePromptLangChoice } from "../i18n/prompts";
import flagEn from "../assets/flags/en.png";
import flagFr from "../assets/flags/fr.png";

const FLAGS: Record<Lang, string> = { fr: flagFr, en: flagEn };

/**
 * Langue des prompts envoyés à l'IA. `compact` : deux petits drapeaux (panneau IA) ;
 * sinon, avec l'option « Comme l'interface » (Paramètres → Prompts).
 */
export default function PromptLangPicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const lang = usePromptLang();
  const { choice, setChoice } = usePromptLangChoice();

  if (compact) {
    return (
      <div role="radiogroup" aria-label={t("Langue des prompts")} className="flex items-center gap-0.5">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            onClick={() => setChoice(l.code)}
            title={t("Prompts en {lang}", { lang: l.label })}
            className={`p-0.5 rounded transition-opacity ${lang === l.code ? "opacity-100 ring-1 ring-accent/60" : "opacity-40 hover:opacity-80"}`}
          >
            <img src={FLAGS[l.code]} alt={l.label} width={15} height={10} className="block rounded-[1px]" />
          </button>
        ))}
      </div>
    );
  }

  const option = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
      active ? "bg-accent/15 border-accent/40 text-accent font-medium" : "bg-hover border-border text-secondary hover:text-primary"
    }`;

  return (
    <div role="radiogroup" aria-label={t("Langue des prompts")} className="flex flex-wrap gap-1.5">
      <button role="radio" aria-checked={choice === null} onClick={() => setChoice(null)} className={option(choice === null)}>
        {t("Comme l'interface")}
      </button>
      {LANGUAGES.map((l) => (
        <button key={l.code} role="radio" aria-checked={choice === l.code} onClick={() => setChoice(l.code)} className={option(choice === l.code)}>
          <img src={FLAGS[l.code]} alt="" width={24} height={16} className="rounded-[2px] shadow-sm" />
          {l.label}
        </button>
      ))}
    </div>
  );
}
