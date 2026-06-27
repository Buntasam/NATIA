import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCheck, ChevronRight, FileText, Loader2,
  MessagesSquare, Search, Send, Sparkles, Tag, X,
} from "lucide-react";
import { useStore } from "../store";
import { aiStream } from "../lib/aiInvoke";
import AiPanel from "./AiPanel";
import D20Roller from "./D20Roller";
import Editor from "./Editor";
import ReminderDaemon from "./ReminderDaemon";
import Settings from "./Settings";
import Sidebar from "./Sidebar";
import TrashPanel from "./TrashPanel";
import VersionTree from "./VersionTree";

type ConvMessage = { role: "user" | "ai"; content: string };

export default function Layout() {
  const {
    showAiPanel, showVersionPanel, showSettings, showTrash,
    createNote, toggleSettings, toggleAiPanel, toggleVersionPanel,
    focusMode, toggleFocusMode, toggleGraph, notes, selectNote, recentNoteIds,
    settings, isLocked, lock,
  } = useStore();

  // Auto-lock on inactivity
  useEffect(() => {
    const minutes = settings.auto_lock_minutes ?? 0;
    if (!minutes || isLocked) return;
    const ms = minutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => lock(), ms); };
    window.addEventListener("mousemove", reset, { passive: true });
    window.addEventListener("keydown", reset, { passive: true });
    window.addEventListener("pointerdown", reset, { passive: true });
    reset();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointerdown", reset);
    };
  }, [settings.auto_lock_minutes, isLocked]);

  const [convOpen, setConvOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const convHistoryRef = useRef(new Map<string, ConvMessage[]>());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Escape: close open panels in priority order
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (st.showSettings) { e.preventDefault(); toggleSettings(); return; }
        if (st.showAiPanel) { e.preventDefault(); toggleAiPanel(); return; }
        if (st.showVersionPanel) { e.preventDefault(); toggleVersionPanel(); return; }
        if (st.focusMode) { e.preventDefault(); toggleFocusMode(); return; }
        return;
      }

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
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setQuickOpen((s) => !s);
      }
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        toggleGraph();
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
  }, [createNote, toggleSettings, toggleAiPanel, toggleVersionPanel, toggleGraph, toggleFocusMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* Sidebar hidden in focus mode */}
      {!focusMode && <Sidebar />}

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
            <ConvPanel
              onClose={() => setConvOpen(false)}
              historyRef={convHistoryRef}
            />
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
      <D20Roller />
      <ReminderDaemon />

      {/* Quick open modal */}
      {quickOpen && (
        <QuickOpen
          notes={notes}
          recentIds={recentNoteIds}
          onSelect={(id) => { selectNote(id); setQuickOpen(false); }}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Quick open modal ─────────────────────────────────────────────────────────

import React from "react";
import { NoteMetadata } from "../types";

function QuickOpen({
  notes,
  recentIds,
  onSelect,
  onClose,
}: {
  notes: NoteMetadata[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = query.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        (n.folder ?? "").toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : (() => {
        // Show recent notes first when no query
        const recentNotes = recentIds
          .map((id) => notes.find((n) => n.id === id))
          .filter(Boolean) as NoteMetadata[];
        const recentSet = new Set(recentIds);
        const others = notes.filter((n) => !recentSet.has(n.id));
        return [...recentNotes, ...others].slice(0, 8);
      })();

  useEffect(() => { setIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && filtered[idx]) { onSelect(filtered[idx].id); }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[520px] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={15} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ouvrir une note…"
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted hover:text-primary transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto">
          {!query.trim() && recentIds.length > 0 && (
            <div className="flex items-center gap-2 px-4 pt-2 pb-1">
              <span className="text-[10px] text-muted uppercase tracking-wider">Récentes</span>
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">Aucune note trouvée</p>
          ) : (
            filtered.map((note, i) => (
              <button
                key={note.id}
                onClick={() => onSelect(note.id)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                  i === idx ? "bg-accent/10 text-accent" : "text-secondary hover:bg-hover hover:text-primary"
                }`}
              >
                <FileText size={13} className={i === idx ? "text-accent shrink-0" : "text-muted shrink-0"} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{note.title || "Sans titre"}</p>
                  {note.folder && (
                    <p className="text-[10px] text-muted truncate">{note.folder}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-hover/30">
          <span className="text-[10px] text-muted">↑↓ naviguer · Entrée ouvrir · Échap fermer</span>
          <span className="ml-auto text-[10px] text-muted">Ctrl+P</span>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation panel ───────────────────────────────────────────────────────

function ConvPanel({
  onClose,
  historyRef,
}: {
  onClose: () => void;
  historyRef: React.MutableRefObject<Map<string, ConvMessage[]>>;
}) {
  const { settings, activeNote } = useStore();
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<(() => void) | null>(null);
  const doneRef = useRef<(() => void) | null>(null);

  // Load & save conversation history per note
  useEffect(() => {
    if (!activeNote) { setMessages([]); return; }
    const saved = historyRef.current.get(activeNote.id) ?? [];
    setMessages(saved);
  }, [activeNote?.id]);

  useEffect(() => {
    if (activeNote && messages.length > 0) {
      historyRef.current.set(activeNote.id, messages);
    }
  }, [messages]);

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
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              if (activeNote) historyRef.current.delete(activeNote.id);
            }}
            className="text-[10px] text-muted hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-hover"
            title="Effacer la conversation"
          >
            Réinitialiser
          </button>
        )}
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
