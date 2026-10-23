import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import DOMPurify from "dompurify";
import {
  Brain, Check, ChevronRight, Copy, FilePlus2, FileText, Loader2, MessageSquarePlus,
  Library, MessagesSquare, Pencil, Search, Send, Trash2, X,
} from "lucide-react";
import { useStore } from "../store";
import CloudAiNotice, { onlineProviderLabel } from "./CloudAiNotice";
import ResizeHandle from "./ResizeHandle";
import { aiStream } from "../lib/aiInvoke";
import { markdownToHtml } from "../lib/markdown";
import { buildMemoryContext } from "../lib/memoryContext";
import { ConvMessage, NoteRef, conversationTitle, useConversations } from "../lib/conversations";
import { promptLang } from "../i18n/prompts";
import { tr, trError, useLocale, useT } from "../i18n";

interface RelevantNote { id: string; title: string; excerpt: string }

/** Nombre de notes données à l'IA par question en mode « Toutes mes notes ». */
const NOTES_PER_QUESTION = 4;

/** Consigne du mode « Toutes mes notes », dans la langue des prompts. */
function notesContext(notes: RelevantNote[]): string {
  const en = promptLang() === "en";
  if (notes.length === 0) {
    return en
      ? "\n\n---\nNo note from the user matches this question. Say so plainly instead of making up an answer."
      : "\n\n---\nAucune note de l'utilisateur ne correspond à cette question. Dis-le simplement au lieu d'inventer une réponse.";
  }
  const intro = en
    ? "Answer from the user's notes below. When you use a note, cite its title in square brackets, for example [Title]. If the notes don't contain the answer, say so plainly instead of making one up."
    : "Réponds à partir des notes de l'utilisateur ci-dessous. Quand tu utilises une note, cite son titre entre crochets, par exemple [Titre]. Si les notes ne contiennent pas la réponse, dis-le simplement au lieu d'en inventer une.";
  const body = notes.map((n) => (en ? `Note "${n.title}":` : `Note « ${n.title} » :`) + `\n${n.excerpt}`).join("\n\n");
  return `\n\n---\n${intro}\n\n${body}`;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ─── Conversation panel ───────────────────────────────────────────────────────

export function ConvPanel({ onClose }: { onClose: () => void }) {
  const { settings, activeNote, aiPanelWidth, setAiPanelWidth, memoryEnabled, memoryNodes, selectNote } = useStore();
  const { list, loaded, currentId, scope, load, open, save, setScope } = useConversations();
  const memoryActive = memoryEnabled && memoryNodes.length > 0;
  const t = useT();
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const messagesRef = useRef<ConvMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<(() => void) | null>(null);
  const doneRef = useRef<(() => void) | null>(null);

  const copyMessage = (content: string, i: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx((v) => (v === i ? null : v)), 1500);
    });
  };

  const insertIntoNote = (content: string) => {
    const html = DOMPurify.sanitize(markdownToHtml(content));
    window.dispatchEvent(new CustomEvent("natia:insert-from-chat", { detail: html }));
  };

  /** Toute la conversation dans la note : questions en gras, réponses telles quelles. */
  const insertConversation = () => {
    const md = messagesRef.current
      .map((m) => (m.role === "user" ? `**${tr("Question")} :** ${m.content}` : m.content))
      .join("\n\n");
    insertIntoNote(md);
  };

  useEffect(() => { load(); }, []);

  // Changement de note : reprend sa dernière conversation, sinon une nouvelle.
  // Une conversation sur toutes les notes reste affichée (ouvrir une source ne la ferme pas).
  useEffect(() => {
    if (!loaded || useConversations.getState().scope === "all") return;
    const last = activeNote
      ? useConversations.getState().list.find((c) => c.noteId === activeNote.id && c.scope !== "all")
      : undefined;
    open(last?.id ?? null);
  }, [activeNote?.id, loaded]);

  // Conversation choisie (historique, nouvelle, note changée) : ses messages s'affichent.
  useEffect(() => {
    const conv = list.find((c) => c.id === currentId);
    messagesRef.current = conv?.messages ?? [];
    setMessages(messagesRef.current);
  }, [currentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  useEffect(() => {
    return () => {
      tokenRef.current?.();
      doneRef.current?.();
    };
  }, []);

  /** Affiche et enregistre les messages dans la conversation courante (créée au premier message). */
  const commit = (next: ConvMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    const { list: all, currentId: id } = useConversations.getState();
    const existing = all.find((c) => c.id === id);
    const now = new Date().toISOString();
    const firstUser = next.find((m) => m.role === "user")?.content ?? "";
    const { scope: currentScope } = useConversations.getState();
    const onNote = currentScope === "note" && activeNote;
    save({
      id: existing?.id ?? crypto.randomUUID(),
      title: existing?.title ?? conversationTitle(firstUser),
      noteId: existing ? existing.noteId : onNote ? activeNote.id : null,
      noteTitle: existing ? existing.noteTitle : onNote ? activeNote.title : "",
      scope: currentScope,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages: next,
    });
  };

  const buildSystem = (notes: RelevantNote[] | null) => {
    let sys = settings.global_shadow_prompt;
    if (memoryActive) sys += buildMemoryContext(memoryNodes);
    if (notes) return sys + notesContext(notes);
    if (activeNote) {
      const div = document.createElement("div");
      div.innerHTML = activeNote.content;
      const text = (div.textContent ?? "").trim();
      if (text) {
        sys += `\n\n---\n${tr("Note active (titre : « {title} ») :", { title: activeNote.title })}\n${text.slice(0, 3000)}`;
      }
    }
    return sys;
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    const history = messagesRef.current.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
    commit([...messagesRef.current, { role: "user", content: msg }]);
    setInput("");
    setIsStreaming(true);
    useConversations.setState({ streaming: true });
    setStreamText("");

    tokenRef.current?.();
    doneRef.current?.();

    // Mode « Toutes mes notes » : les notes utiles à cette question, cherchées sur ce PC.
    let notes: RelevantNote[] | null = null;
    if (scope === "all") {
      try { notes = await invoke<RelevantNote[]>("relevant_notes", { question: msg, limit: NOTES_PER_QUESTION }); }
      catch { notes = []; }
    }
    const sources: NoteRef[] | undefined = notes?.length ? notes.map(({ id, title }) => ({ id, title })) : undefined;

    const acc = { value: "" };
    const finish = (answer: string) => {
      commit([...messagesRef.current, { role: "ai", content: answer, sources }]);
      setStreamText("");
      setIsStreaming(false);
      useConversations.setState({ streaming: false });
    };

    tokenRef.current = await listen<string>("ollama-token", (ev) => {
      acc.value += ev.payload;
      setStreamText(acc.value);
    });

    doneRef.current = await listen<string>("ollama-done", () => {
      finish(acc.value);
      tokenRef.current?.();
      doneRef.current?.();
      tokenRef.current = null;
      doneRef.current = null;
    });

    try {
      await aiStream(settings, buildSystem(notes), msg, history);
    } catch (e: unknown) {
      finish(tr("Erreur : {e}", { e: e instanceof Error ? e.message : trError(e) }));
    }
  };

  return (
    <aside
      className="relative shrink-0 border-l border-border overflow-hidden flex flex-col bg-panel"
      style={{ width: aiPanelWidth }}
    >
      <ResizeHandle
        edge="left"
        getWidth={() => useStore.getState().aiPanelWidth}
        setWidth={setAiPanelWidth}
        min={280}
        max={560}
      />
      <div className="shrink-0 border-b border-border px-3 py-2.5 flex items-center gap-2">
        <MessagesSquare size={14} className="text-accent" />
        <span className="text-xs font-medium text-primary flex-1">{t("Conversation IA")}</span>
        {memoryActive && (
          <span
            className="flex items-center gap-1 text-[10px] text-accent/80 shrink-0"
            title={memoryNodes.length === 1 ? t("{n} nœud de mémoire pris en compte", { n: 1 }) : t("{n} nœuds de mémoire pris en compte", { n: memoryNodes.length })}
          >
            <Brain size={10} />
          </span>
        )}
        {messages.length > 0 && activeNote && (
          <button
            onClick={insertConversation}
            disabled={isStreaming}
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors disabled:opacity-40"
            title={t("Insérer toute la conversation dans la note")}
          >
            <FilePlus2 size={12} />
          </button>
        )}
        {messages.length > 0 && (
          <button
            onClick={() => open(null)}
            disabled={isStreaming}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-hover disabled:opacity-40"
            title={t("Nouvelle conversation (la conversation actuelle reste dans l'historique)")}
          >
            <MessageSquarePlus size={11} />{t("Nouvelle")}
          </button>
        )}
        <button onClick={onClose} aria-label={t("Fermer")} className="text-muted hover:text-primary transition-colors p-1">
          <X size={14} />
        </button>
      </div>
      <CloudAiNotice service={onlineProviderLabel(settings.ai_provider)} className="shrink-0 px-3 py-1.5 border-b border-border" />
      <div role="radiogroup" aria-label={t("Contexte de la conversation")} className="shrink-0 flex items-center gap-1 px-2 py-1.5 bg-accent/5 border-b border-border/50 text-[11px]">
        <button
          role="radio"
          aria-checked={scope === "note"}
          onClick={() => setScope("note")}
          disabled={isStreaming || messages.length > 0 || !activeNote}
          title={messages.length > 0 ? t("Le contexte se choisit au début d'une conversation") : undefined}
          className={`flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-md transition-colors disabled:cursor-default ${scope === "note" ? "bg-panel text-primary shadow-sm" : "text-muted hover:text-primary disabled:hover:text-muted"}`}
        >
          <FileText size={10} className="text-accent shrink-0" />
          <span className="truncate">{activeNote ? activeNote.title : t("Aucune note ouverte")}</span>
        </button>
        <button
          role="radio"
          aria-checked={scope === "all"}
          onClick={() => setScope("all")}
          disabled={isStreaming || messages.length > 0}
          title={messages.length > 0 ? t("Le contexte se choisit au début d'une conversation") : t("L'IA cherche dans toutes vos notes celles qui répondent à la question")}
          className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md transition-colors disabled:cursor-default ${scope === "all" ? "bg-panel text-primary shadow-sm" : "text-muted hover:text-primary disabled:hover:text-muted"}`}
        >
          <Library size={10} className="text-accent shrink-0" />
          {t("Toutes mes notes")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessagesSquare size={24} className="text-muted mb-2" />
            <p className="text-xs text-muted">{t("Commence une conversation avec l'IA")}</p>
            {scope === "all" ? (
              <p className="text-[11px] text-muted/70 mt-1 px-4">{t("Posez une question : l'IA cherche la réponse dans vos notes et indique lesquelles elle a utilisées.")}</p>
            ) : activeNote && (
              <p className="text-[11px] text-muted/70 mt-1">{t("L'IA a accès au contenu de ta note")}</p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-sm text-xs leading-relaxed whitespace-pre-wrap bg-accent text-white">
                {m.content}
              </div>
            ) : (
              <>
                <div
                  className="conv-md max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm text-xs leading-relaxed bg-hover text-secondary border border-border"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdownToHtml(m.content)) }}
                />
                {m.sources && (
                  <div className="flex flex-wrap items-center gap-1 mt-1 ml-1 max-w-[85%]">
                    <span className="text-[10px] text-muted">{t("Notes utilisées :")}</span>
                    {m.sources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectNote(s.id).catch(() => {})}
                        title={t("Ouvrir la note")}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-[10px] text-accent hover:bg-accent/20 transition-colors max-w-full"
                      >
                        <FileText size={9} className="shrink-0" /><span className="truncate">{s.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Actions : copier / insérer dans la note */}
                <div className="flex items-center gap-1 mt-0.5 ml-1">
                  <button
                    onClick={() => copyMessage(m.content, i)}
                    aria-label={t("Copier la réponse")}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted hover:text-primary hover:bg-hover transition-colors"
                  >
                    {copiedIdx === i ? <Check size={10} className="text-accent" /> : <Copy size={10} />}
                    {copiedIdx === i ? t("Copié") : t("Copier")}
                  </button>
                  {activeNote && (
                    <button
                      onClick={() => insertIntoNote(m.content)}
                      aria-label={t("Insérer dans la note")}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted hover:text-primary hover:bg-hover transition-colors"
                    >
                      <FilePlus2 size={10} />
                      {t("Insérer")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className={`max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm text-xs leading-relaxed whitespace-pre-wrap bg-hover text-secondary border border-border ${streamText ? "" : "flex items-center gap-1.5"}`}>
              {streamText
                ? <>{streamText}<span className="animate-pulse text-accent ml-0.5">▋</span></>
                : <><Loader2 size={11} className="text-accent animate-spin" /><span className="text-muted">{t("Réflexion…")}</span></>
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
          placeholder={t("Message… (Entrée pour envoyer)")}
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

// ─── Historique des conversations ─────────────────────────────────────────────

export function ConvHistory({ onExpand }: { onExpand: () => void }) {
  const t = useT();
  const loc = useLocale();
  const { list, currentId, streaming, open, rename, remove } = useConversations();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const q = fold(query.trim());
  const shown = q
    ? list.filter((c) => fold(`${c.title} ${c.noteTitle} ${c.messages.map((m) => m.content).join(" ")}`).includes(q))
    : list;

  const startRename = (id: string, title: string) => { setEditingId(id); setDraft(title); };
  const finishRename = () => {
    if (editingId) rename(editingId, draft);
    setEditingId(null);
  };

  const when = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(loc, { day: "numeric", month: "short" });
  };

  return (
    <aside className="w-56 shrink-0 border-l border-border flex flex-col bg-panel">
      <div className="shrink-0 flex items-center gap-1 px-2 py-2 border-b border-border">
        <button
          onClick={onExpand}
          title={t("Afficher les opérations")}
          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-hover transition-colors"
        >
          <ChevronRight size={14} />
        </button>
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide flex-1">{t("Historique")}</span>
        <button
          onClick={() => open(null)}
          disabled={streaming}
          title={t("Nouvelle conversation")}
          className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-hover transition-colors disabled:opacity-40"
        >
          <MessageSquarePlus size={14} />
        </button>
      </div>

      {list.length > 0 && (
        <div className="shrink-0 px-2 pt-2">
          <div className="flex items-center gap-1.5 bg-hover rounded-lg px-2 py-1">
            <Search size={11} className="text-muted shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Chercher…")}
              aria-label={t("Chercher dans les conversations")}
              className="bg-transparent text-[11px] text-primary placeholder-muted outline-none w-full"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t("Effacer")} className="text-muted hover:text-primary shrink-0"><X size={10} /></button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
        {list.length === 0 && (
          <p className="text-[11px] text-muted text-center px-3 py-6 leading-relaxed">{t("Vos conversations apparaîtront ici.")}</p>
        )}
        {list.length > 0 && shown.length === 0 && (
          <p className="text-[11px] text-muted text-center px-3 py-4">{t("Aucun résultat")}</p>
        )}
        {shown.map((c) => {
          const active = c.id === currentId;
          const confirming = confirmId === c.id;
          if (editingId === c.id) {
            return (
              <input
                key={c.id}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setEditingId(null); }}
                aria-label={t("Nom de la conversation")}
                className="w-full bg-hover border border-accent/50 rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none"
              />
            );
          }
          return (
            <div
              key={c.id}
              className={`group relative rounded-lg transition-colors ${active ? "bg-accent/10" : "hover:bg-hover"}`}
              onMouseLeave={() => { if (confirming) setConfirmId(null); }}
            >
              <button
                onClick={() => open(c.id)}
                onDoubleClick={() => startRename(c.id, c.title)}
                disabled={streaming}
                className="w-full text-left px-2.5 py-1.5 pr-12 disabled:cursor-not-allowed"
              >
                <p className={`text-xs truncate ${active ? "text-accent font-medium" : "text-secondary"}`}>{c.title || t("Sans titre")}</p>
                <p className="text-[10px] text-muted truncate">
                  {when(c.updatedAt)}{c.scope === "all" ? ` · ${t("Toutes mes notes")}` : c.noteTitle && ` · ${c.noteTitle}`}
                </p>
              </button>
              <button
                onClick={() => startRename(c.id, c.title)}
                title={t("Renommer")}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition-all"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => {
                  if (!confirming) { setConfirmId(c.id); return; }
                  remove(c.id);
                  setConfirmId(null);
                }}
                disabled={streaming && active}
                title={confirming ? t("Cliquer encore pour supprimer") : t("Supprimer la conversation")}
                className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded transition-all ${
                  confirming
                    ? "opacity-100 bg-red-400/15 text-red-400"
                    : "opacity-0 group-hover:opacity-100 text-muted hover:text-red-400"
                }`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
