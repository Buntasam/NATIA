import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Search, Trash2, X } from "lucide-react";
import { type LogEntry, type LogLevel, subscribe, getBuffer, clearBuffer } from "../debug/logger";

type Filter = LogLevel | "all";

interface LevelStyle { badge: string; row: string; label: string; }

const STYLES: Record<LogLevel, LevelStyle> = {
  error: { badge: "bg-red-500 text-white",       row: "border-red-400/25 bg-red-400/5",    label: "ERR"  },
  warn:  { badge: "bg-yellow-400 text-black",     row: "border-yellow-400/25 bg-yellow-400/5", label: "WARN" },
  log:   { badge: "bg-muted/30 text-muted",       row: "border-transparent",                label: "LOG"  },
  info:  { badge: "bg-blue-400/80 text-white",    row: "border-blue-400/20 bg-blue-400/5",  label: "INFO" },
  ai:    { badge: "bg-accent/90 text-white",      row: "border-accent/20 bg-accent/5",      label: "IA"   },
  sys:   { badge: "bg-border text-muted",         row: "border-transparent",                label: "SYS"  },
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",   label: "TOUT" },
  { key: "error", label: "ERR"  },
  { key: "warn",  label: "WARN" },
  { key: "log",   label: "LOG"  },
  { key: "ai",    label: "IA"   },
  { key: "sys",   label: "SYS"  },
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0") + "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

export default function DebugConsole() {
  const [entries, setEntries] = useState<LogEntry[]>(getBuffer);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribe((entry) => {
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    });
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  };

  const counts: Partial<Record<LogLevel, number>> = {};
  for (const e of entries) counts[e.level] = (counts[e.level] ?? 0) + 1;

  const visible = entries.filter((e) => {
    if (filter !== "all" && e.level !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.msg.toLowerCase().includes(q) && !e.source.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hasLoop = entries.some((e) => e.loopFlag);

  const exportLog = () => {
    const text = entries
      .map((e) => `[${fmtTime(e.ts)}] [${e.level.toUpperCase().padEnd(5)}] ${e.source.padEnd(12)} › ${e.msg}${e.loopFlag ? " ⟳LOOP" : ""}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `natia-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={11} className={counts.error ? "text-red-400" : "text-muted"} />
        <span className="text-xs text-muted">Console debug</span>
        {!!counts.error && (
          <span className="text-[10px] px-1 rounded bg-red-400/15 text-red-400 border border-red-400/20">
            {counts.error}
          </span>
        )}
        {hasLoop && (
          <span className="text-[10px] px-1 rounded bg-amber-400/15 text-amber-400 border border-amber-400/20" title="Boucle détectée">
            ⟳ loop
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={exportLog}
            title="Exporter le log (.txt)"
            className="p-0.5 rounded text-muted hover:text-primary transition-colors"
          >
            <Download size={10} />
          </button>
          <button
            onClick={() => { clearBuffer(); setEntries([]); }}
            title="Effacer tous les logs"
            className="p-0.5 rounded text-muted hover:text-primary transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === "all" ? entries.length : (counts[key as LogLevel] ?? 0);
          const style = key !== "all" ? STYLES[key as LogLevel] : null;
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors shrink-0 ${
                active
                  ? key === "all"
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : style!.badge + " opacity-100"
                  : "text-muted hover:text-primary bg-hover border border-transparent"
              }`}
            >
              {label}{count > 0 ? <span className="opacity-60 ml-0.5">({count})</span> : null}
            </button>
          );
        })}

        {/* Search */}
        <div className="flex items-center gap-1 ml-auto bg-hover rounded-lg px-1.5 py-0.5 border border-border/60">
          <Search size={9} className="text-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filtrer…"
            className="bg-transparent text-[10px] text-primary outline-none w-16 placeholder-muted"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X size={9} className="text-muted hover:text-primary" />
            </button>
          )}
        </div>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex flex-col gap-px max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-base p-1 font-mono text-[10px] leading-relaxed"
      >
        {visible.length === 0 ? (
          <p className="text-muted/40 italic text-center py-5">
            {entries.length === 0 ? "Aucun log cette session" : "Aucun résultat"}
          </p>
        ) : (
          visible.map((e) => (
            <div
              key={e.id}
              className={`flex items-start gap-1.5 px-1.5 py-[2px] rounded border ${STYLES[e.level].row} ${
                e.loopFlag ? "!border-amber-400/40 !bg-amber-400/10" : ""
              }`}
            >
              <span className="text-muted/50 shrink-0 tabular-nums select-none">{fmtTime(e.ts)}</span>
              <span className={`shrink-0 rounded px-0.5 py-px text-[8px] font-bold leading-none ${STYLES[e.level].badge}`}>
                {STYLES[e.level].label}
              </span>
              <span className="text-muted/70 shrink-0 w-[52px] truncate select-none">{e.source}</span>
              <span className="text-secondary/80 min-w-0 break-all">{e.msg}</span>
              {e.loopFlag && (
                <span className="shrink-0 text-amber-400 text-[9px] font-bold ml-auto" title="Même message répété ≥5× en 2s">
                  ⟳
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Jump to bottom */}
      {!autoScroll && entries.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          className="text-[10px] text-accent bg-accent/10 border border-accent/20 rounded px-2 py-0.5 self-end hover:bg-accent/20 transition-colors"
        >
          ↓ sauter en bas
        </button>
      )}
    </div>
  );
}
