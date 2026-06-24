import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  BrainCircuit,
  CheckCheck,
  ChevronDown,
  Circle,
  Download,
  Eye,
  FileText,
  Languages,
  Loader2,
  Mail,
  MessagesSquare,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Tag,
  X,
  Zap,
} from "lucide-react";
import * as Diff from "diff";
import { fetchModels } from "../hooks/useOllama";
import { aiChat, aiStream, activeModel } from "../lib/aiInvoke";
import { useStore } from "../store";

interface PullProgress {
  status: string;
  total: number;
  completed: number;
  percent: number;
}

interface TraceEntry {
  operation: string;
  model: string;
  system: string;
  user: string;
  response: string;
  elapsed: number;
  status: "running" | "done" | "error";
  error: string;
}

type Tab = "ops" | "trace";

interface SortProposal {
  id: string;
  title: string;
  currentFolder: string | null;
  suggestedFolder: string | null;
  accepted: boolean;
}

export default function AiPanel({ onOpenConv }: { onOpenConv: () => void }) {
  const { activeNote, settings, folders, toggleAiPanel, updateNote, renameNote, moveNote, createFolder, loadNotes, loadFolders } = useStore();

  const [activeTab, setActiveTab] = useState<Tab>("ops");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.default_model);
  const [shadowPrompt, setShadowPrompt] = useState(settings.global_shadow_prompt);
  const [localProvider, setLocalProvider] = useState(settings.ai_provider);
  const effectiveSettings = { ...settings, ai_provider: localProvider };
  const [showShadow, setShowShadow] = useState(false);
  const [response, setResponse] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState("");
  const [sortProposals, setSortProposals] = useState<SortProposal[]>([]);

  // Correction / Formalize modals
  const [pendingCorrection, setPendingCorrection] = useState<{
    original: string;
    proposed: string;
    html: string;
  } | null>(null);
  const [pendingFormalize, setPendingFormalize] = useState<{
    original: string;
    proposed: string;
    html: string;
  } | null>(null);

  // Translate lang & continue tracking
  const [translateLang, setTranslateLang] = useState("anglais");
  const [responseOp, setResponseOp] = useState<string | null>(null);

  // Quick message
  const [quickInput, setQuickInput] = useState("");
  const [quickResponse, setQuickResponse] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);

  const runQuick = async () => {
    const msg = quickInput.trim();
    if (!msg || quickLoading) return;
    setQuickLoading(true);
    setQuickResponse("");
    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, msg, selectedModel);
      setQuickResponse(result);
      setQuickInput("");
    } catch (e: unknown) {
      setQuickResponse(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setQuickLoading(false);
    }
  };

  // Model download
  const [showPullInput, setShowPullInput] = useState(false);
  const [pullModel, setPullModel] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [pullError, setPullError] = useState("");

  // Model refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Trace tab state
  const [traceInput, setTraceInput] = useState("");
  const [traceResponse, setTraceResponse] = useState("");
  const [isTracing, setIsTracing] = useState(false);
  const [lastTrace, setLastTrace] = useState<TraceEntry | null>(null);

  const responseRef = useRef<HTMLDivElement>(null);
  const traceResponseRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pullUnlistenRef = useRef<(() => void) | null>(null);
  const traceTokenRef = useRef<(() => void) | null>(null);
  const traceDoneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (settings.ai_provider === "ollama") refreshModels();
  }, [settings.ollama_url, settings.ai_provider]);

  useEffect(() => {
    setSelectedModel(settings.default_model);
    setShadowPrompt(settings.global_shadow_prompt);
  }, [settings]);

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  useEffect(() => {
    if (traceResponseRef.current) {
      traceResponseRef.current.scrollTop = traceResponseRef.current.scrollHeight;
    }
  }, [traceResponse]);

  const refreshModels = async () => {
    setIsRefreshing(true);
    try {
      const ms = await fetchModels(settings.ollama_url);
      const names = ms.map((m) => m.name);
      setModels(names);
      if (names.length > 0 && !names.includes(selectedModel)) {
        setSelectedModel(names[0]);
      }
    } catch {
      // silently fail
    } finally {
      setIsRefreshing(false);
    }
  };

  const startTimer = () => {
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setLastTrace((t) => t ? { ...t, elapsed: Math.round((Date.now() - startTimeRef.current) / 100) / 10 } : t);
    }, 200);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const runOperation = async (
    operationKey: keyof typeof settings,
    userContent: string,
    opLabel: string,
    onSuccess?: (result: string) => Promise<void>
  ) => {
    if (!activeNote || isRunning) return;
    setError("");
    setResponse("");
    setAppliedMsg("");
    setIsRunning(true);
    setActiveOp(opLabel);

    const prompt = settings[operationKey] as string;
    const fullMessage = `${prompt}\n\n${userContent}`;
    const truncatedUser = fullMessage.length > 600 ? fullMessage.substring(0, 600) + "…" : fullMessage;

    const traceBase: TraceEntry = {
      operation: opLabel,
      model: activeModel(effectiveSettings, selectedModel),
      system: shadowPrompt,
      user: truncatedUser,
      response: "",
      elapsed: 0,
      status: "running",
      error: "",
    };
    setLastTrace(traceBase);
    startTimeRef.current = Date.now();
    startTimer();

    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      const truncatedResp = result.length > 600 ? result.substring(0, 600) + "…" : result;
      setLastTrace({ ...traceBase, response: truncatedResp, elapsed, status: "done" });

      if (onSuccess) {
        await onSuccess(result);
        setAppliedMsg("✓ Appliqué");
        setTimeout(() => setAppliedMsg(""), 2500);
      } else {
        setResponse(result);
      }
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, error: msg, elapsed, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally {
      setIsRunning(false);
      setActiveOp(null);
    }
  };

  const getPlainText = () => {
    const div = document.createElement("div");
    div.innerHTML = activeNote?.content ?? "";
    return div.textContent ?? "";
  };

  const handleCorrect = async () => {
    if (!activeNote || isRunning) return;
    setError("");
    setResponse("");
    setAppliedMsg("");
    setIsRunning(true);
    setActiveOp("Corriger");

    const prompt = settings.correct_prompt as string;
    const plainText = getPlainText();
    const fullMessage = `${prompt}\n\n${plainText}`;
    const truncatedUser = fullMessage.length > 600 ? fullMessage.substring(0, 600) + "…" : fullMessage;

    const traceBase: TraceEntry = {
      operation: "Corriger",
      model: activeModel(effectiveSettings, selectedModel),
      system: shadowPrompt,
      user: truncatedUser,
      response: "",
      elapsed: 0,
      status: "running",
      error: "",
    };
    setLastTrace(traceBase);
    startTimeRef.current = Date.now();
    startTimer();

    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      const truncatedResp = result.length > 600 ? result.substring(0, 600) + "…" : result;
      setLastTrace({ ...traceBase, response: truncatedResp, elapsed, status: "done" });

      const html = result
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      setPendingCorrection({ original: plainText, proposed: result, html });
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, error: msg, elapsed, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally {
      setIsRunning(false);
      setActiveOp(null);
    }
  };

  const handleRename = () =>
    runOperation("rename_prompt", getPlainText(), "Renommer", async (result) => {
      if (!activeNote) return;
      const title = result.trim().replace(/^["'«»]+|["'«»]+$/g, "");
      await renameNote(activeNote.id, title);
    });

  const extractJson = (raw: string): string => {
    let s = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const start = s.indexOf("[");
    if (start === -1) throw new Error("Pas de tableau JSON trouvé. Réponse reçue : " + s.slice(0, 300));
    let depth = 0;
    let end = -1;
    for (let i = start; i < s.length; i++) {
      if (s[i] === "[") depth++;
      else if (s[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error("Tableau JSON non fermé");
    return s.slice(start, end + 1);
  };

  const resolveFolder = (suggested: string | null, existingFolders: string[]): string | null => {
    if (!suggested) return null;
    const match = existingFolders.find((f) => f.toLowerCase() === suggested.toLowerCase());
    return match ?? suggested;
  };

  const applyProposals = async () => {
    const toApply = sortProposals.filter((p) => p.accepted);
    if (toApply.length === 0) { setSortProposals([]); return; }
    setIsRunning(true);
    try {
      const existingFolders = useStore.getState().folders;
      const toCreate = new Set<string>();
      for (const { suggestedFolder } of toApply) {
        if (suggestedFolder && !existingFolders.find((f) => f.toLowerCase() === suggestedFolder.toLowerCase())) {
          toCreate.add(suggestedFolder);
        }
      }
      for (const f of toCreate) await createFolder(f);
      for (const { id, suggestedFolder } of toApply) {
        const allFolders = useStore.getState().folders;
        await moveNote(id, resolveFolder(suggestedFolder, allFolders));
      }
      await loadNotes();
      await loadFolders();
      setSortProposals([]);
      setAppliedMsg(`✓ ${toApply.length} note(s) déplacée(s)`);
      setTimeout(() => setAppliedMsg(""), 3000);
    } catch (e: unknown) {
      setError(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const stripHtml = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent ?? "").replace(/\s+/g, " ").trim();
  };

  const handleSort = async () => {
    if (isRunning) return;
    const { notes } = useStore.getState();
    if (notes.length === 0) return;

    setError("");
    setResponse("");
    setAppliedMsg("");
    setIsRunning(true);
    setActiveOp("Trier");

    // Fetch full content for each note
    let fullNotes: { id: string; title: string; content: string; tags: string[]; folder: string | null }[] = [];
    try {
      fullNotes = await Promise.all(
        notes.map((n) =>
          invoke<{ id: string; title: string; content: string; tags: string[]; folder: string | null }>(
            "get_note", { id: n.id }
          )
        )
      );
    } catch {
      fullNotes = notes.map((n) => ({ ...n, content: "" }));
    }

    const folderList = folders.length > 0
      ? folders.map((f, i) => `  ${i + 1}. "${f}"`).join("\n")
      : "  (aucun dossier existant)";

    const notesList = fullNotes
      .map((n, i) => {
        const snippet = stripHtml(n.content ?? "").slice(0, 250);
        let block = `NOTE ${i + 1}\nid: ${n.id}\ntitre: "${n.title}"`;
        if (snippet) block += `\ncontenu: ${snippet}`;
        return block;
      })
      .join("\n\n");

    const sortSystem = `Tu es un assistant de classement de notes scolaires ou personnelles. Tu dois associer chaque note au dossier thématique le plus approprié, en te basant sur le titre et le contenu. Ne te trompe pas : une note sur les mathématiques va dans le dossier mathématiques, une note sur l'histoire va dans le dossier histoire, etc. Réponds uniquement en JSON valide, sans aucun autre texte.`;

    const instruction = `DOSSIERS DISPONIBLES (utilise exactement ces noms si le sujet correspond) :
${folderList}

NOTES À CLASSER :
${notesList}

CONSIGNE : Pour chaque note, identifie le sujet principal (maths, histoire, physique, etc.) et choisis le dossier correspondant dans la liste ci-dessus. Si aucun dossier ne correspond, propose un nom court et descriptif. Ne mets jamais une note dans un mauvais dossier : une note sur les maths va dans le dossier maths, pas ailleurs.

Réponds UNIQUEMENT avec ce JSON (rien d'autre, pas de texte, pas de \`\`\`) :
[{"id":"ID_EXACT_DE_LA_NOTE","folder":"NomDuDossier"},...]`;

    const fullMessage = instruction;
    const truncatedUser = fullMessage.length > 1500 ? fullMessage.substring(0, 1500) + "…" : fullMessage;

    const traceBase: TraceEntry = {
      operation: "Trier",
      model: activeModel(effectiveSettings, selectedModel),
      system: sortSystem,
      user: truncatedUser,
      response: "",
      elapsed: 0,
      status: "running",
      error: "",
    };
    setLastTrace(traceBase);
    startTimeRef.current = Date.now();
    startTimer();

    try {
      const result = await aiChat(effectiveSettings,sortSystem, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      const truncatedResp = result.length > 600 ? result.substring(0, 600) + "…" : result;
      setLastTrace({ ...traceBase, response: truncatedResp, elapsed, status: "done" });

      try {
        const jsonStr = extractJson(result);
        const assignments: { id: string; folder: string | null }[] = JSON.parse(jsonStr);
        const existingFolders = useStore.getState().folders;
        const proposals: SortProposal[] = [];
        for (const { id, folder } of assignments) {
          const note = fullNotes.find((n) => n.id === id);
          if (!note) continue;
          const resolved = resolveFolder(folder, existingFolders);
          const current = note.folder ?? null;
          if (resolved !== current) {
            proposals.push({ id, title: note.title, currentFolder: current, suggestedFolder: resolved, accepted: true });
          }
        }
        if (proposals.length === 0) {
          setAppliedMsg("✓ Toutes les notes sont déjà bien placées");
          setTimeout(() => setAppliedMsg(""), 3000);
        } else {
          setSortProposals(proposals);
        }
      } catch (parseErr: unknown) {
        const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
        setError(`L'IA n'a pas retourné du JSON valide — ${detail}`);
      }
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, error: msg, elapsed, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally {
      setIsRunning(false);
      setActiveOp(null);
    }
  };

  const handleFormalize = async () => {
    if (!activeNote || isRunning) return;
    setError(""); setResponse(""); setAppliedMsg("");
    setIsRunning(true); setActiveOp("Formaliser");
    const plainText = getPlainText();
    const fullMessage = `${settings.formalize_prompt}\n\n${plainText}`;
    const traceBase: TraceEntry = {
      operation: "Formaliser", model: activeModel(effectiveSettings, selectedModel), system: shadowPrompt,
      user: fullMessage.slice(0, 600), response: "", elapsed: 0, status: "running", error: "",
    };
    setLastTrace(traceBase); startTimeRef.current = Date.now(); startTimer();
    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, response: result.slice(0, 600), elapsed, status: "done" });
      const html = result.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
      setPendingFormalize({ original: plainText, proposed: result, html });
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      setLastTrace({ ...traceBase, error: msg, elapsed: Math.round((Date.now() - startTimeRef.current) / 100) / 10, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally { setIsRunning(false); setActiveOp(null); }
  };

  const handleTranslate = async () => {
    if (!activeNote || isRunning) return;
    setError(""); setResponse(""); setAppliedMsg(""); setResponseOp(null);
    setIsRunning(true); setActiveOp("Traduire");
    const plainText = getPlainText();
    const fullMessage = `Traduis le texte suivant en ${translateLang}. ${settings.translate_prompt}\n\n${plainText}`;
    const traceBase: TraceEntry = {
      operation: "Traduire", model: activeModel(effectiveSettings, selectedModel), system: shadowPrompt,
      user: fullMessage.slice(0, 600), response: "", elapsed: 0, status: "running", error: "",
    };
    setLastTrace(traceBase); startTimeRef.current = Date.now(); startTimer();
    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, response: result.slice(0, 600), elapsed, status: "done" });
      setResponse(result);
      setResponseOp("translate");
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      setLastTrace({ ...traceBase, error: msg, elapsed: Math.round((Date.now() - startTimeRef.current) / 100) / 10, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally { setIsRunning(false); setActiveOp(null); }
  };

  const handleContinue = async () => {
    if (!activeNote || isRunning) return;
    setError(""); setResponse(""); setAppliedMsg(""); setResponseOp(null);
    setIsRunning(true); setActiveOp("Continuer");
    const plainText = getPlainText();
    const fullMessage = `${settings.continue_prompt}\n\n${plainText}`;
    const traceBase: TraceEntry = {
      operation: "Continuer", model: activeModel(effectiveSettings, selectedModel), system: shadowPrompt,
      user: fullMessage.slice(0, 600), response: "", elapsed: 0, status: "running", error: "",
    };
    setLastTrace(traceBase); startTimeRef.current = Date.now(); startTimer();
    try {
      const result = await aiChat(effectiveSettings,shadowPrompt, fullMessage, selectedModel);
      stopTimer();
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 100) / 10;
      setLastTrace({ ...traceBase, response: result.slice(0, 600), elapsed, status: "done" });
      setResponse(result);
      setResponseOp("continue");
    } catch (e: unknown) {
      stopTimer();
      const msg = e instanceof Error ? e.message : String(e);
      setLastTrace({ ...traceBase, error: msg, elapsed: Math.round((Date.now() - startTimeRef.current) / 100) / 10, status: "error" });
      setError(`Erreur : ${msg}`);
    } finally { setIsRunning(false); setActiveOp(null); }
  };

  const insertContinuation = async () => {
    if (!activeNote || !response) return;
    const added = response.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
    const newContent = activeNote.content + added;
    await updateNote(activeNote.id, activeNote.title, newContent, activeNote.tags, activeNote.folder, "Continuation IA");
    setResponse(""); setResponseOp(null);
    setAppliedMsg("✓ Texte inséré à la fin");
    setTimeout(() => setAppliedMsg(""), 2500);
  };

  const startPull = async () => {
    const name = pullModel.trim();
    if (!name || isPulling) return;
    setPullError("");
    setPullProgress(null);
    setIsPulling(true);

    if (pullUnlistenRef.current) pullUnlistenRef.current();
    pullUnlistenRef.current = await listen<PullProgress>("ollama-pull-progress", (event) => {
      setPullProgress(event.payload);
    });

    try {
      await invoke("ollama_pull", { baseUrl: settings.ollama_url, model: name });
      await refreshModels();
      setSelectedModel(name);
      setPullModel("");
      setShowPullInput(false);
    } catch (e: unknown) {
      setPullError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPulling(false);
      setPullProgress(null);
      if (pullUnlistenRef.current) { pullUnlistenRef.current(); pullUnlistenRef.current = null; }
    }
  };

  // ─── Trace tab: direct streaming chat ────────────────────────────────────────

  const runTrace = async () => {
    const msg = traceInput.trim();
    if (!msg || isTracing) return;
    setTraceResponse("");
    setIsTracing(true);

    if (traceTokenRef.current) { traceTokenRef.current(); traceTokenRef.current = null; }
    if (traceDoneRef.current) { traceDoneRef.current(); traceDoneRef.current = null; }

    const acc = { value: "" };

    traceTokenRef.current = await listen<string>("ollama-token", (ev) => {
      acc.value += ev.payload;
      setTraceResponse(acc.value);
    });

    traceDoneRef.current = await listen<string>("ollama-done", () => {
      setIsTracing(false);
      if (traceTokenRef.current) { traceTokenRef.current(); traceTokenRef.current = null; }
      if (traceDoneRef.current) { traceDoneRef.current(); traceDoneRef.current = null; }
    });

    try {
      await aiStream(effectiveSettings,shadowPrompt, msg, [], selectedModel);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setTraceResponse(`Erreur : ${errMsg}`);
      setIsTracing(false);
    }
  };

  return (
    <>
    {pendingCorrection && (
      <CorrectionModal
        title="Correction proposée par l'IA"
        subtitle="Modifications surlignées — vert : ajouts · rouge barré : suppressions"
        original={pendingCorrection.original}
        proposed={pendingCorrection.proposed}
        html={pendingCorrection.html}
        applyLabel="Appliquer la correction"
        onApply={async (html) => {
          if (!activeNote) return;
          await updateNote(activeNote.id, activeNote.title, html, activeNote.tags, activeNote.folder, "Correction IA");
          setPendingCorrection(null);
          setAppliedMsg("✓ Correction appliquée");
          setTimeout(() => setAppliedMsg(""), 2500);
        }}
        onCancel={() => setPendingCorrection(null)}
      />
    )}
    {pendingFormalize && (
      <CorrectionModal
        title="Email formalisé par l'IA"
        subtitle="Aperçu de la version formelle — cliquez Appliquer pour remplacer la note"
        original={pendingFormalize.original}
        proposed={pendingFormalize.proposed}
        html={pendingFormalize.html}
        applyLabel="Remplacer la note"
        onApply={async (html) => {
          if (!activeNote) return;
          await updateNote(activeNote.id, activeNote.title, html, activeNote.tags, activeNote.folder, "Formalisation IA");
          setPendingFormalize(null);
          setAppliedMsg("✓ Note formalisée");
          setTimeout(() => setAppliedMsg(""), 2500);
        }}
        onCancel={() => setPendingFormalize(null)}
      />
    )}
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <BrainCircuit size={14} className="text-accent" />
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => setActiveTab("ops")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "ops"
                    ? "text-primary bg-hover"
                    : "text-muted hover:text-primary"
                }`}
              >
                Opérations
              </button>
              <button
                onClick={() => setActiveTab("trace")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "trace"
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-primary"
                }`}
              >
                <Eye size={10} />
                Activité
              </button>
            </div>
          </div>
          <button onClick={toggleAiPanel} className="text-muted hover:text-primary transition-colors p-1">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* ── OPERATIONS TAB ──────────────────────────────────────────────────── */}
        {activeTab === "ops" && (
          <>
            {/* ── Provider switcher ── */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-muted uppercase tracking-wider">Fournisseur</p>
              <div className="flex flex-wrap gap-1">
                {([
                  { id: "ollama",     label: "Local" },
                  { id: "claude_cli", label: "CLI" },
                  { id: "claude",     label: "Anthropic" },
                  { id: "openai",     label: "OpenAI" },
                  { id: "gemini",     label: "Gemini" },
                  { id: "mistral",    label: "Mistral" },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setLocalProvider(id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      localProvider === id
                        ? "bg-accent/15 border-accent/40 text-accent"
                        : "bg-hover border-border text-muted hover:text-secondary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector */}
            <div>
              {localProvider === "ollama" ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted">Modèle Ollama</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={refreshModels}
                        disabled={isRefreshing}
                        title="Rafraîchir la liste"
                        className="p-0.5 rounded text-muted hover:text-primary transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
                      </button>
                      <button
                        onClick={() => { setShowPullInput((s) => !s); setPullError(""); }}
                        title="Télécharger un modèle"
                        className={`p-0.5 rounded transition-colors ${showPullInput ? "text-accent" : "text-muted hover:text-primary"}`}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none appearance-none cursor-pointer"
                    >
                      {models.length === 0 && (
                        <option value={selectedModel}>{selectedModel || "Aucun modèle"}</option>
                      )}
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  </div>

                  {showPullInput && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <input
                          value={pullModel}
                          onChange={(e) => setPullModel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") startPull(); if (e.key === "Escape") setShowPullInput(false); }}
                          placeholder="ex : llama3.2:3b"
                          disabled={isPulling}
                          className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors placeholder-muted"
                        />
                        <button
                          onClick={startPull}
                          disabled={isPulling || !pullModel.trim()}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs transition-colors shrink-0"
                        >
                          {isPulling ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                          {isPulling ? "…" : "Télécharger"}
                        </button>
                      </div>
                      {isPulling && pullProgress && (
                        <div className="flex flex-col gap-1">
                          <div className="h-1 rounded-full bg-hover overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${pullProgress.total > 0 ? pullProgress.percent : 5}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted truncate">
                            {pullProgress.status}{pullProgress.total > 0 && ` — ${pullProgress.percent}%`}
                          </p>
                        </div>
                      )}
                      {pullError && (
                        <p className="text-[10px] text-red-400 bg-red-400/10 rounded px-2 py-1">{pullError}</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-hover rounded-lg border border-border">
                  <Zap size={12} className="text-accent shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-muted uppercase tracking-wide">
                      {localProvider === "claude" ? "Anthropic Claude" : localProvider === "openai" ? "OpenAI" : localProvider === "gemini" ? "Google Gemini" : localProvider === "claude_cli" ? "Claude Code CLI" : "Mistral AI"}
                    </span>
                    <span className="text-xs text-primary truncate">{activeModel(effectiveSettings)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Shadow prompt */}
            <div>
              <button
                onClick={() => setShowShadow((s) => !s)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors w-full"
              >
                {showShadow ? "▲" : "▼"}
                <span className="ml-0.5">Prompt système</span>
              </button>
              {showShadow && (
                <textarea
                  value={shadowPrompt}
                  onChange={(e) => setShadowPrompt(e.target.value)}
                  rows={4}
                  className="mt-1.5 w-full bg-hover border border-border rounded-lg px-3 py-2 text-xs text-primary outline-none resize-none focus:border-accent/50 transition-colors"
                />
              )}
            </div>

            {/* Quick message */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted uppercase tracking-wider">Message rapide</p>
                <button
                  onClick={onOpenConv}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                  title="Ouvrir une conversation complète"
                >
                  <MessagesSquare size={11} />
                  Conversation
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runQuick(); } }}
                  placeholder="Pose une question…"
                  disabled={quickLoading}
                  className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors placeholder-muted disabled:opacity-50"
                />
                <button
                  onClick={runQuick}
                  disabled={quickLoading || !quickInput.trim()}
                  className="w-8 flex items-center justify-center rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white transition-colors shrink-0"
                >
                  {quickLoading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                </button>
              </div>
              {quickResponse && (
                <div className="bg-hover rounded-lg px-3 py-2 text-xs text-secondary max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-border/50">
                  {quickResponse}
                  <button
                    onClick={() => setQuickResponse("")}
                    className="block mt-1.5 text-[10px] text-muted hover:text-primary transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              )}
            </div>

            {/* Operations */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted uppercase tracking-wider">Opérations</p>
              <OpButton
                icon={<CheckCheck size={14} />}
                label="Corriger"
                description="Applique directement dans l'éditeur"
                active={activeOp === "Corriger"}
                loading={isRunning && activeOp === "Corriger"}
                onClick={handleCorrect}
              />
              <OpButton
                icon={<FileText size={14} />}
                label="Résumer"
                description="Résumé en 2-3 phrases"
                active={activeOp === "Résumer"}
                loading={isRunning && activeOp === "Résumer"}
                onClick={() => runOperation("summary_prompt", getPlainText(), "Résumer")}
              />
              <OpButton
                icon={<Tag size={14} />}
                label="Renommer"
                description="Applique le titre automatiquement"
                active={activeOp === "Renommer"}
                loading={isRunning && activeOp === "Renommer"}
                onClick={handleRename}
              />
              <OpButton
                icon={<Sparkles size={14} />}
                label="Trier toutes les notes"
                description="En développement · Organisation par IA"
                active={activeOp === "Trier"}
                loading={isRunning && activeOp === "Trier"}
                onClick={handleSort}
                badge="bêta"
              />
              <OpButton
                icon={<Mail size={14} />}
                label="Formaliser"
                description="Reformule en email professionnel"
                active={activeOp === "Formaliser"}
                loading={isRunning && activeOp === "Formaliser"}
                onClick={handleFormalize}
              />
              <div className="flex flex-col gap-1">
                <OpButton
                  icon={<Languages size={14} />}
                  label="Traduire"
                  description={`Traduit la note en ${translateLang}`}
                  active={activeOp === "Traduire"}
                  loading={isRunning && activeOp === "Traduire"}
                  onClick={handleTranslate}
                />
                <div className="flex gap-1 px-1 flex-wrap">
                  {(["anglais", "espagnol", "allemand", "italien", "portugais", "japonais"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setTranslateLang(lang)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        translateLang === lang
                          ? "bg-accent/15 border-accent/40 text-accent"
                          : "bg-hover border-border text-muted hover:text-primary"
                      }`}
                    >
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <OpButton
                icon={<PenLine size={14} />}
                label="Continuer"
                description="L'IA prolonge le texte de la note"
                active={activeOp === "Continuer"}
                loading={isRunning && activeOp === "Continuer"}
                onClick={handleContinue}
              />
            </div>

            {/* Applied feedback */}
            {appliedMsg && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                <span className="text-xs text-accent font-medium">{appliedMsg}</span>
              </div>
            )}

            {/* Sort proposals */}
            {sortProposals.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">{sortProposals.length} déplacement(s) proposé(s)</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSortProposals((p) => p.map((x) => ({ ...x, accepted: true })))}
                      className="text-[10px] text-accent hover:underline"
                    >Tout accepter</button>
                    <span className="text-muted text-[10px]">/</span>
                    <button
                      onClick={() => setSortProposals((p) => p.map((x) => ({ ...x, accepted: false })))}
                      className="text-[10px] text-muted hover:text-primary hover:underline"
                    >Tout refuser</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                  {sortProposals.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSortProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, accepted: !x.accepted } : x))}
                      className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors border ${
                        p.accepted ? "bg-accent/10 border-accent/30" : "bg-hover border-transparent opacity-40"
                      }`}
                    >
                      <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        p.accepted ? "bg-accent border-accent" : "border-muted"
                      }`}>
                        {p.accepted && <span className="text-white text-[8px] leading-none">✓</span>}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-primary block truncate">{p.title}</span>
                        <span className="text-muted text-[10px]">
                          {p.currentFolder ?? "Racine"} → <span className="text-accent">{p.suggestedFolder ?? "Racine"}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={applyProposals}
                    disabled={isRunning || sortProposals.every((p) => !p.accepted)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white transition-colors"
                  >
                    Appliquer ({sortProposals.filter((p) => p.accepted).length}/{sortProposals.length})
                  </button>
                  <button
                    onClick={() => setSortProposals([])}
                    className="px-3 text-xs py-1.5 rounded-lg bg-hover hover:bg-active text-muted hover:text-primary transition-colors"
                  >✕</button>
                </div>
              </div>
            )}

            {/* Other operation response */}
            {(response || error) && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">Réponse</p>
                  {isRunning && (
                    <span className="flex items-center gap-1 text-xs text-accent">
                      <Loader2 size={10} className="animate-spin" />
                      en cours…
                    </span>
                  )}
                </div>
                {error && (
                  <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
                )}
                {response && (
                  <div
                    ref={responseRef}
                    className="bg-hover rounded-lg px-3 py-2 text-xs text-secondary max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed"
                  >
                    {response}
                  </div>
                )}
                {!isRunning && response && (
                  <div className="flex gap-2">
                    {responseOp === "continue" && (
                      <button
                        onClick={insertContinuation}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
                      >
                        Insérer à la fin
                      </button>
                    )}
                    <button
                      onClick={() => { setResponse(""); setError(""); setResponseOp(null); }}
                      className={`text-xs py-1.5 rounded-lg bg-hover hover:bg-active text-muted hover:text-primary transition-colors ${responseOp === "continue" ? "px-4" : "w-full"}`}
                    >
                      Fermer
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── TRACE / ACTIVITÉ TAB ────────────────────────────────────────────── */}
        {activeTab === "trace" && (
          <>
            {/* Connection info */}
            <div className="bg-panel rounded-lg p-3 flex flex-col gap-1.5 border border-border">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Activity size={11} className="text-accent" />
                <span className="text-xs font-medium text-secondary">Connexion</span>
                {localProvider === "ollama" && (
                  <button
                    onClick={refreshModels}
                    disabled={isRefreshing}
                    className="ml-auto p-0.5 rounded text-muted hover:text-primary transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                  </button>
                )}
              </div>
              <TraceRow label="fournisseur" value={
                localProvider === "ollama" ? "Ollama (local)"
                : localProvider === "claude" ? "Claude API"
                : localProvider === "claude_cli" ? "Claude Code CLI"
                : localProvider === "openai" ? "OpenAI"
                : localProvider === "gemini" ? "Google Gemini"
                : "Mistral"
              } />
              <TraceRow label="modèle" value={activeModel(effectiveSettings, selectedModel)} />
              {localProvider === "ollama" && (
                <TraceRow
                  label="modèles"
                  value={
                    isRefreshing
                      ? "rafraîchissement…"
                      : models.length > 0
                      ? `${models.length} disponible(s) : ${models.slice(0, 3).join(", ")}${models.length > 3 ? "…" : ""}`
                      : "aucun — ollama serve ?"
                  }
                  dim={models.length === 0 && !isRefreshing}
                />
              )}
              {localProvider === "ollama" && (
                <TraceRow label="url" value={settings.ollama_url} />
              )}
            </div>

            {/* Direct streaming chat */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted">Chat direct — streaming</p>
              <div className="flex gap-1.5">
                <input
                  value={traceInput}
                  onChange={(e) => setTraceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runTrace(); } }}
                  placeholder="Message à l'IA…"
                  disabled={isTracing}
                  className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 placeholder-muted"
                />
                <button
                  onClick={runTrace}
                  disabled={isTracing || !traceInput.trim()}
                  className="flex items-center justify-center w-8 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white transition-colors shrink-0"
                >
                  {isTracing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                </button>
              </div>
              {(traceResponse || isTracing) && (
                <div
                  ref={traceResponseRef}
                  className="bg-hover border border-border rounded-lg px-3 py-2 text-xs text-secondary max-h-40 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed"
                >
                  {traceResponse}
                  {isTracing && <span className="animate-pulse text-accent ml-0.5">▋</span>}
                </div>
              )}
            </div>

            {/* Last operation log */}
            {lastTrace && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted">Dernière opération</p>
                  {lastTrace.status === "running" && (
                    <Loader2 size={10} className="text-accent animate-spin" />
                  )}
                  {lastTrace.status === "done" && (
                    <span className="text-[10px] text-accent">✓ {lastTrace.elapsed}s</span>
                  )}
                  {lastTrace.status === "error" && (
                    <span className="text-[10px] text-red-400">✗ erreur</span>
                  )}
                </div>
                <div className="bg-panel border border-border rounded-lg p-3 font-mono text-[10px] flex flex-col gap-2 leading-relaxed">
                  <div className="flex gap-2 items-center">
                    <span className="text-muted w-12 shrink-0">op</span>
                    <span className="text-accent font-semibold">{lastTrace.operation}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted w-12 shrink-0">modèle</span>
                    <span className="text-secondary">{lastTrace.model}</span>
                  </div>
                  {lastTrace.elapsed > 0 && (
                    <div className="flex gap-2 items-center">
                      <span className="text-muted w-12 shrink-0">temps</span>
                      <span className="text-accent">{lastTrace.elapsed}s</span>
                    </div>
                  )}
                  <div className="border-t border-border/40 pt-2">
                    <p className="text-muted mb-1">// prompt système</p>
                    <p className="text-secondary/70 line-clamp-2 break-words">{lastTrace.system}</p>
                  </div>
                  <div>
                    <p className="text-muted mb-1">// message envoyé</p>
                    <p className="text-secondary/70 line-clamp-3 break-words">{lastTrace.user}</p>
                  </div>
                  {lastTrace.response && (
                    <div>
                      <p className="text-muted mb-1">// réponse</p>
                      <p className="text-secondary/80 line-clamp-4 break-words">{lastTrace.response}</p>
                    </div>
                  )}
                  {lastTrace.error && (
                    <p className="text-red-400 bg-red-400/10 rounded px-2 py-1 break-all">{lastTrace.error}</p>
                  )}
                </div>
              </div>
            )}

            {!lastTrace && (
              <div className="text-center py-6">
                <Zap size={20} className="text-muted mx-auto mb-2" />
                <p className="text-xs text-muted">Lance une opération pour voir la trace</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

import React from "react";

function TraceRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-start gap-2 font-mono text-[10px]">
      <span className="text-muted shrink-0 w-12">{label}</span>
      <span className={dim ? "text-muted" : "text-secondary break-all"}>{value}</span>
    </div>
  );
}

function OpButton({
  icon, label, description, onClick, loading, active, badge,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  active: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full ${
        active
          ? "bg-accent/10 border border-accent/30"
          : "bg-hover hover:bg-active border border-transparent"
      }`}
    >
      <span className={active ? "text-accent" : "text-secondary"}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-medium text-primary leading-none">{label}</p>
          {badge && (
            <span className="px-1 py-0.5 rounded text-[9px] font-semibold leading-none bg-amber-400/20 text-amber-600 border border-amber-400/30">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted truncate">{description}</p>
      </div>
      {loading && <Loader2 size={13} className="text-accent animate-spin shrink-0" />}
    </button>
  );
}

// ─── Correction modal ─────────────────────────────────────────────────────────

function CorrectionModal({
  title, subtitle, applyLabel, original, proposed, html, onApply, onCancel,
}: {
  title: string;
  subtitle: string;
  applyLabel: string;
  original: string;
  proposed: string;
  html: string;
  onApply: (html: string) => void;
  onCancel: () => void;
}) {
  const diffParts = Diff.diffWordsWithSpace(original, proposed);
  const hasChanges = diffParts.some((p) => p.added || p.removed);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[680px] max-h-[80vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <CheckCheck size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <p className="text-xs text-muted mt-0.5">
              {hasChanges ? subtitle : "Aucune modification détectée dans le texte"}
            </p>
          </div>
        </div>

        {/* Diff */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {diffParts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? "bg-green-500/20 text-green-400 rounded"
                    : part.removed
                    ? "bg-red-500/15 text-red-400 line-through rounded"
                    : "text-secondary"
                }
              >
                {part.value}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between shrink-0">
          <p className="text-xs text-muted">
            {hasChanges
              ? `${diffParts.filter((p) => p.added).length} ajout(s) · ${diffParts.filter((p) => p.removed).length} suppression(s)`
              : "Le texte est identique"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-hover hover:bg-active text-secondary hover:text-primary text-sm transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => onApply(html)}
              disabled={!hasChanges}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {applyLabel}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
