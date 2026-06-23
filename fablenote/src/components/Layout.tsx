import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCheck, ChevronRight, FileText, Loader2,
  MessagesSquare, Send, Sparkles, Tag, X,
} from "lucide-react";
import { useStore } from "../store";
import { aiStream } from "../lib/aiInvoke";
import AiPanel from "./AiPanel";
import Editor from "./Editor";
import Settings from "./Settings";
import Sidebar from "./Sidebar";
import TrashPanel from "./TrashPanel";
import VersionTree from "./VersionTree";

export default function Layout() {
  const {
    showAiPanel, showVersionPanel, showSettings, showTrash,
    createNote, toggleSettings, toggleAiPanel, toggleVersionPanel,
  } = useStore();

  const [convOpen, setConvOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "n") {
        e.preventDefault();
        createNote();
      }
      if (e.key === "f") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Rechercher…"]')?.focus();
      }
      if (e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
      if (e.shiftKey && e.key === "A") {
        e.preventDefault();
        toggleAiPanel();
      }
      if (e.shiftKey && e.key === "H") {
        e.preventDefault();
        toggleVersionPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNote, toggleSettings, toggleAiPanel, toggleVersionPanel]);

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <Sidebar />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-col flex-1 overflow-hidden bg-base">
          <Editor />
        </main>

        {showAiPanel && !convOpen && (
          <aside className="w-80 shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel">
            <AiPanel onOpenConv={() => setConvOpen(true)} />
          </aside>
        )}

        {showAiPanel && convOpen && (
          <>
            <ConvPanel onClose={() => setConvOpen(false)} />
            <NarrowOpsStrip onExpand={() => setConvOpen(false)} />
          </>
        )}

        {showVersionPanel && (
          <aside className="w-72 shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel">
            <VersionTree />
          </aside>
        )}
      </div>

      {showSettings && <Settings />}
      {showTrash && <TrashPanel />}
    </div>
  );
}

// ─── Conversation panel ───────────────────────────────────────────────────────

function ConvPanel({ onClose }: { onClose: () => void }) {
  const { settings, activeNote } = useStore();
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<(() => void) | null>(null);
  const doneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  useEffect(() => {
    return () => {
      tokenRef.current?.();
      doneRef.current?.();
    };
  }, []);

  const buildSystem = () => {
    let sys = settings.global_shadow_prompt;
    if (activeNote) {
      const div = document.createElement("div");
      div.innerHTML = activeNote.content;
      const text = (div.textContent ?? "").trim();
      if (text) {
        sys += `\n\n---\nNote active (titre : "${activeNote.title}") :\n${text.slice(0, 3000)}`;
      }
    }
    return sys;
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    const history = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setIsStreaming(true);
    setStreamText("");

    tokenRef.current?.();
    doneRef.current?.();

    const acc = { value: "" };

    tokenRef.current = await listen<string>("ollama-token", (ev) => {
      acc.value += ev.payload;
      setStreamText(acc.value);
    });

    doneRef.current = await listen<string>("ollama-done", () => {
      setMessages((prev) => [...prev, { role: "ai", content: acc.value }]);
      setStreamText("");
      setIsStreaming(false);
      tokenRef.current?.();
      doneRef.current?.();
      tokenRef.current = null;
      doneRef.current = null;
    });

    try {
      await aiStream(settings, buildSystem(), msg, history);
    } catch (e: unknown) {
      setMessages((prev) => [...prev, { role: "ai", content: `Erreur : ${e instanceof Error ? e.message : String(e)}` }]);
      setStreamText("");
      setIsStreaming(false);
    }
  };

  return (
    <aside className="w-80 shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel">
      <div className="shrink-0 border-b border-border px-3 py-2.5 flex items-center gap-2">
        <MessagesSquare size={14} className="text-accent" />
        <span className="text-xs font-medium text-primary flex-1">Conversation IA</span>
        <button onClick={onClose} className="text-muted hover:text-primary transition-colors p-1">
          <X size={14} />
        </button>
      </div>
      {activeNote && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-accent/5 border-b border-border/50 text-[10px] text-muted">
          <FileText size={9} className="text-accent shrink-0" />
          <span className="truncate text-secondary">{activeNote.title}</span>
          <span className="text-accent shrink-0">· en contexte</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessagesSquare size={24} className="text-muted mb-2" />
            <p className="text-xs text-muted">Commence une conversation avec l'IA</p>
            {activeNote && (
              <p className="text-[10px] text-muted/70 mt-1">L'IA a accès au contenu de ta note</p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-accent text-white rounded-br-sm"
                : "bg-hover text-secondary rounded-bl-sm border border-border"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className={`max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm text-xs leading-relaxed whitespace-pre-wrap bg-hover text-secondary border border-border ${streamText ? "" : "flex items-center gap-1.5"}`}>
              {streamText
                ? <>{streamText}<span className="animate-pulse text-accent ml-0.5">▋</span></>
                : <><Loader2 size={11} className="text-accent animate-spin" /><span className="text-muted">Réflexion…</span></>
              }
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="shrink-0 border-t border-border p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message… (Entrée pour envoyer)"
          disabled={isStreaming}
          rows={2}
          className="flex-1 bg-hover border border-border rounded-lg px-3 py-2 text-xs text-primary outline-none resize-none focus:border-accent/50 transition-colors placeholder-muted disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={isStreaming || !input.trim()}
          className="flex items-end justify-center w-8 pb-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white transition-colors shrink-0"
        >
          {isStreaming ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
        </button>
      </div>
    </aside>
  );
}

// ─── Narrow ops strip ─────────────────────────────────────────────────────────

function NarrowOpsStrip({ onExpand }: { onExpand: () => void }) {
  return (
    <aside className="w-12 shrink-0 border-l border-border flex flex-col items-center py-3 gap-2 bg-panel">
      <button
        onClick={onExpand}
        title="Afficher les opérations"
        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-hover transition-colors"
      >
        <ChevronRight size={14} />
      </button>
      <div className="w-6 h-px bg-border my-1" />
      <button onClick={onExpand} title="Corriger" className="p-2 rounded-lg text-muted hover:text-accent hover:bg-hover transition-colors">
        <CheckCheck size={14} />
      </button>
      <button onClick={onExpand} title="Résumer" className="p-2 rounded-lg text-muted hover:text-accent hover:bg-hover transition-colors">
        <FileText size={14} />
      </button>
      <button onClick={onExpand} title="Renommer" className="p-2 rounded-lg text-muted hover:text-accent hover:bg-hover transition-colors">
        <Tag size={14} />
      </button>
      <button onClick={onExpand} title="Trier" className="p-2 rounded-lg text-muted hover:text-accent hover:bg-hover transition-colors">
        <Sparkles size={14} />
      </button>
    </aside>
  );
}
