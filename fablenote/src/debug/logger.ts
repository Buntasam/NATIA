export type LogLevel = "log" | "info" | "warn" | "error" | "ai" | "sys";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  source: string;
  msg: string;
  loopFlag: boolean;
}

const MAX = 1000;
const LOOP_N = 5;
const LOOP_MS = 2000;

type Listener = (e: LogEntry) => void;

let _idSeq = 0;
const _buf: LogEntry[] = [];
const _listeners: Listener[] = [];
const _recent = new Map<string, { n: number; t: number }>();

function _add(level: LogLevel, source: string, raw: string) {
  const ts = Date.now();
  const msg = raw.slice(0, 1500);
  const key = `${level}:${source}:${msg.slice(0, 80)}`;

  const r = _recent.get(key);
  let loopFlag = false;
  if (r && ts - r.t < LOOP_MS) {
    r.n++;
    if (r.n >= LOOP_N) loopFlag = true;
  } else {
    _recent.set(key, { n: 1, t: ts });
  }

  const entry: LogEntry = { id: _idSeq++, ts, level, source, msg, loopFlag };
  _buf.push(entry);
  if (_buf.length > MAX) _buf.shift();
  for (const fn of _listeners) fn(entry);
}

export function subscribe(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

export function getBuffer(): LogEntry[] {
  return [..._buf];
}

export function clearBuffer(): void {
  _buf.length = 0;
  _recent.clear();
}

export function addAiLog(source: string, msg: string): void {
  _add("ai", source, msg);
}

export function addSysLog(source: string, msg: string): void {
  _add("sys", source, msg);
}

function fmtArg(a: unknown): string {
  if (typeof a === "string") return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}

// Auto-install interceptors on module load
const _origLog   = console.log.bind(console);
const _origInfo  = console.info.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

console.log   = (...a) => { _origLog(...a);   _add("log",   "console", a.map(fmtArg).join(" ")); };
console.info  = (...a) => { _origInfo(...a);  _add("info",  "console", a.map(fmtArg).join(" ")); };
console.warn  = (...a) => { _origWarn(...a);  _add("warn",  "console", a.map(fmtArg).join(" ")); };
console.error = (...a) => { _origError(...a); _add("error", "console", a.map(fmtArg).join(" ")); };

window.addEventListener("error", (e) => {
  const file = e.filename ? e.filename.split("/").pop() : "";
  _add("error", "window", `${e.message}${file ? ` (${file}:${e.lineno})` : ""}`);
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : String(e.reason);
  _add("error", "promise", msg);
});

_add("sys", "app", "Logger NATIA initialisé");
