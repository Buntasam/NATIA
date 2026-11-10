import React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ChevronRight, ExternalLink, Lightbulb } from "lucide-react";
import type { ManualBlock, ManualTopic } from "./manualContent";

// Affichage d'un sujet du manuel ou des documents légaux. Séparé du contenu du manuel :
// l'écran des conditions d'utilisation n'a pas à charger tout le manuel.

/** `code` et **gras** dans le texte du manuel. */
function rich(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("`")) return <code key={i} className="text-[11px] font-mono bg-hover border border-border/60 rounded px-1 py-px text-primary">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={i} className="text-primary font-medium">{part.slice(2, -2)}</strong>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
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

export function Topic({ topic, open, onToggle }: { topic: ManualTopic; open: boolean; onToggle: () => void }) {
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

