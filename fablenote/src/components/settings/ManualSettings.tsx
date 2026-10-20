import React, { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ChevronRight, ExternalLink, Lightbulb, Search, X } from "lucide-react";
import { MANUAL, ManualBlock, ManualTopic } from "./manualContent";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** `code` et **gras** dans le texte du manuel. */
function rich(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("`")) return <code key={i} className="text-[11px] font-mono bg-hover border border-border/60 rounded px-1 py-px text-primary">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={i} className="text-primary font-medium">{part.slice(2, -2)}</strong>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

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

function Block({ b }: { b: ManualBlock }) {
  const text = "text-xs text-secondary leading-relaxed";
  if ("p" in b) return <p className={text}>{rich(b.p)}</p>;
  if ("steps" in b) return (
    <ol className={`${text} list-decimal pl-5 flex flex-col gap-1`}>
      {b.steps.map((s, i) => <li key={i}>{rich(s)}</li>)}
    </ol>
  );
  if ("list" in b) return (
    <ul className={`${text} list-disc pl-5 flex flex-col gap-1`}>
      {b.list.map((s, i) => <li key={i}>{rich(s)}</li>)}
    </ul>
  );
  if ("code" in b) return (
    <pre className="text-[11px] font-mono bg-hover border border-border rounded-lg px-3 py-2 text-primary overflow-x-auto select-all">{b.code}</pre>
  );
  if ("tip" in b) return (
    <p className="flex gap-2 text-[11px] leading-relaxed text-secondary bg-accent/5 border border-accent/20 rounded-lg px-3 py-2">
      <Lightbulb size={12} className="text-accent shrink-0 mt-0.5" /><span>{rich(b.tip)}</span>
    </p>
  );
  if ("warn" in b) return (
    <p className="flex gap-2 text-[11px] leading-relaxed text-secondary bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
      <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" /><span>{rich(b.warn)}</span>
    </p>
  );
  if ("table" in b) return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border border-border rounded-lg overflow-hidden">
        <thead className="bg-hover">
          <tr>{b.table.head.map((h) => <th key={h} className="text-left font-medium text-primary px-2.5 py-1.5">{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.table.rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {r.map((c, j) => <td key={j} className={`px-2.5 py-1.5 align-top text-secondary ${j === 0 ? "text-primary" : ""}`}>{rich(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {b.links.map((l) => (
        <button
          key={l.url}
          onClick={() => openUrl(l.url).catch((err) => console.error("openUrl:", err))}
          title={l.url}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hover border border-border text-[11px] text-accent hover:bg-active transition-colors"
        >
          <ExternalLink size={10} />{l.label}
        </button>
      ))}
    </div>
  );
}

function Topic({ topic, open, onToggle }: { topic: ManualTopic; open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-hover transition-colors"
      >
        <ChevronRight size={13} className={`text-muted shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        {topic.title}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 flex flex-col gap-2.5">
          {topic.blocks.map((b, i) => <Block key={i} b={b} />)}
        </div>
      )}
    </div>
  );
}

export default function ManualSettings() {
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
          placeholder="Chercher dans le manuel (ollama, clé API, export…)"
          aria-label="Chercher dans le manuel"
          className="bg-transparent text-xs text-primary placeholder-muted outline-none w-full"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Effacer" className="text-muted hover:text-primary transition-colors shrink-0">
            <X size={11} />
          </button>
        )}
      </div>

      {searching ? (
        <div className="flex flex-col gap-2">
          {results.length === 0 && <p className="text-xs text-muted text-center py-4">Aucun résultat</p>}
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
