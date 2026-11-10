import { useState } from "react";
import { Search, X } from "lucide-react";
import { Topic } from "./ManualBlocks";
import { MANUAL as MANUAL_FR, ManualBlock, ManualTopic } from "./manualContent";
import { MANUAL_EN } from "./manualContent.en";
import { useLang, useT } from "../../i18n";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function blockText(b: ManualBlock): string {
  if ("p" in b) return b.p;
  if ("steps" in b) return b.steps.join(" ");
  if ("list" in b) return b.list.join(" ");
  if ("code" in b) return b.code;
  if ("tip" in b) return b.tip;
  if ("warn" in b) return b.warn;
  if ("table" in b) return [...b.table.head, ...b.table.rows.flat()].join(" ");
  return b.links.map((l) => l.label).join(" ");
}

export default function ManualSettings() {
  const t = useT();
  // Mêmes identifiants de chapitres dans les deux langues : le chapitre ouvert est conservé.
  const MANUAL = useLang((s) => s.lang) === "en" ? MANUAL_EN : MANUAL_FR;
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState(MANUAL[0].id);
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set([`${MANUAL[0].id}/0`]));

  const q = normalize(query.trim());
  const searching = q.length > 0;
  const results = searching
    ? MANUAL.flatMap((c) => c.topics
        .map((t, i) => ({ c, t, key: `${c.id}/${i}` }))
        .filter(({ c, t }) => normalize(`${c.title} ${t.title} ${t.blocks.map(blockText).join(" ")}`).includes(q)))
    : [];
  const current = MANUAL.find((c) => c.id === chapter) ?? MANUAL[0];

  const toggle = (key: string) => setOpenTopics((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 bg-hover rounded-lg px-2.5 py-1.5">
        <Search size={13} className="text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Chercher dans le manuel (ollama, clé API, export…)")}
          aria-label={t("Chercher dans le manuel")}
          className="bg-transparent text-xs text-primary placeholder-muted outline-none w-full"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label={t("Effacer")} className="text-muted hover:text-primary transition-colors shrink-0">
            <X size={11} />
          </button>
        )}
      </div>

      {searching ? (
        <div className="flex flex-col gap-2">
          {results.length === 0 && <p className="text-xs text-muted text-center py-4">{t("Aucun résultat")}</p>}
          {results.map(({ c, t, key }) => (
            <div key={key} className="flex flex-col gap-1">
              <p className="text-[10px] text-muted uppercase tracking-wider">{c.title}</p>
              <Topic topic={t} open onToggle={() => {}} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {MANUAL.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setChapter(c.id)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                  c.id === current.id ? "bg-accent/10 border-accent/40 text-accent font-medium" : "bg-hover border-border text-secondary hover:text-primary"
                }`}
              >
                {i + 1}. {c.title}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {current.topics.map((t, i) => {
              const key = `${current.id}/${i}`;
              return <Topic key={key} topic={t} open={openTopics.has(key)} onToggle={() => toggle(key)} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}
