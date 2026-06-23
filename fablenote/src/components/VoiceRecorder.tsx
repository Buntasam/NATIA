import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown, ChevronUp, GripVertical, Loader2, Mic, MicOff, Pause, Play, Sparkles, X } from "lucide-react";
import { aiStream } from "../lib/aiInvoke";
import { useStore } from "../store";

// Web Speech API interfaces
interface ISpeechRecognitionResult { readonly isFinal: boolean; readonly length: number; [index: number]: { transcript: string }; }
interface ISpeechRecognitionResultList { readonly length: number; [index: number]: ISpeechRecognitionResult; }
interface ISpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: ISpeechRecognitionResultList; }
interface ISpeechRecognitionErrorEvent extends Event { readonly error: string; }
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((ev: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
interface ISpeechRecognitionConstructor { new(): ISpeechRecognition; }

interface Segment { speaker: number; text: string; }

const SPEAKER_COLORS = ["text-blue-400", "text-emerald-400", "text-violet-400", "text-amber-400"];
const SPEAKER_BG    = ["bg-blue-400/10", "bg-emerald-400/10", "bg-violet-400/10", "bg-amber-400/10"];
const PAUSE_MS = 2200;

function getSpeechRecognition(): ISpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as ISpeechRecognitionConstructor | null;
}

interface Props { onInsert: (text: string) => void; }

export default function VoiceRecorder({ onInsert }: Props) {
  const { settings } = useStore();

  const [isAvailable, setIsAvailable]       = useState(false);
  const [isRecording, setIsRecording]       = useState(false);
  const [segments, setSegments]             = useState<Segment[]>([]);
  const [interim, setInterim]               = useState("");
  const [showPanel, setShowPanel]           = useState(false);
  const [collapsed, setCollapsed]           = useState(false);
  const [error, setError]                   = useState("");
  const [audioUrl, setAudioUrl]             = useState<string | null>(null);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [aiText, setAiText]                 = useState("");
  const [isReformatting, setIsReformatting] = useState(false);
  const [showAiResult, setShowAiResult]     = useState(false);

  // Floating position (bottom-right by default)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recRef       = useRef<ISpeechRecognition | null>(null);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const segmentsRef  = useRef<Segment[]>([]);
  const lastFinalRef = useRef<number>(0);
  const speakerRef   = useRef<number>(0);
  const audioUrlRef  = useRef<string | null>(null);
  const unlistensRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    setIsAvailable(!!getSpeechRecognition());
    return () => { unlistensRef.current.forEach(fn => fn()); };
  }, []);

  useEffect(() => { audioUrlRef.current = audioUrl; }, [audioUrl]);

  // Initial position: bottom-right
  useEffect(() => {
    if (showPanel && !pos) {
      setPos({ x: window.innerWidth - 380 - 16, y: window.innerHeight - 400 - 16 });
    }
  }, [showPanel]);

  const clearState = () => {
    segmentsRef.current = [];
    setSegments([]);
    setInterim("");
    lastFinalRef.current = 0;
    speakerRef.current = 0;
    chunksRef.current = [];
    setIsPlaying(false);
    setAiText("");
    setShowAiResult(false);
    setIsReformatting(false);
    setError("");
  };

  const start = async () => {
    const Rec = getSpeechRecognition();
    if (!Rec) return;

    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); }
    setAudioUrl(null);
    clearState();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          setAudioUrl(URL.createObjectURL(blob));
        }
      };
      mr.start(500);
      mediaRecRef.current = mr;
    } catch {
      setError("Accès microphone refusé");
      return;
    }

    const rec = new Rec();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev: ISpeechRecognitionEvent) => {
      const now = Date.now();
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText.trim()) {
        const gap = lastFinalRef.current > 0 ? now - lastFinalRef.current : 0;
        if (gap > PAUSE_MS) speakerRef.current = (speakerRef.current + 1) % 4;
        lastFinalRef.current = now;
        const spk = speakerRef.current;
        const prev = segmentsRef.current[segmentsRef.current.length - 1];
        if (prev && prev.speaker === spk) {
          segmentsRef.current = [
            ...segmentsRef.current.slice(0, -1),
            { speaker: spk, text: prev.text + " " + finalText.trim() },
          ];
        } else {
          segmentsRef.current = [...segmentsRef.current, { speaker: spk, text: finalText.trim() }];
        }
        setSegments([...segmentsRef.current]);
      }
      setInterim(interimText);
    };

    rec.onerror = (ev: ISpeechRecognitionErrorEvent) => {
      if (ev.error !== "no-speech") setError(`Erreur : ${ev.error}`);
    };
    rec.onend = () => { setIsRecording(false); setInterim(""); };

    recRef.current = rec;
    rec.start();
    setIsRecording(true);
    setShowPanel(true);
    setCollapsed(false);
  };

  const stop = () => {
    recRef.current?.stop();
    if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
    setIsRecording(false);
  };

  const discard = () => {
    recRef.current?.stop();
    if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); }
    unlistensRef.current.forEach(fn => fn());
    unlistensRef.current = [];
    clearState();
    setAudioUrl(null);
    setIsRecording(false);
    setShowPanel(false);
    setPos(null);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else { a.play().catch(() => {}); setIsPlaying(true); }
  };

  const buildText = (segs: Segment[]): string => {
    const multi = new Set(segs.map(s => s.speaker)).size > 1;
    if (!multi) return segs.map(s => s.text).join(" ");
    return segs.map(s => `[Intervenant ${String.fromCharCode(65 + s.speaker)}] ${s.text}`).join("\n");
  };

  const reformatWithAi = async () => {
    if (!settings.ollama_url || !settings.default_model || segmentsRef.current.length === 0) return;
    setIsReformatting(true);
    setAiText("");
    setShowAiResult(true);
    unlistensRef.current.forEach(fn => fn());
    unlistensRef.current = [];

    const acc = { value: "" };
    const u1 = await listen<string>("ollama-token", (ev) => { acc.value += ev.payload; setAiText(acc.value); });
    const u2 = await listen<string>("ollama-done", () => {
      setIsReformatting(false);
      unlistensRef.current.forEach(fn => fn());
      unlistensRef.current = [];
    });
    unlistensRef.current = [u1, u2];

    const speakerCount = new Set(segmentsRef.current.map(s => s.speaker)).size;
    try {
      await aiStream(
        settings,
        `Tu es un expert en mise en forme de transcriptions audio. Tu reçois une transcription brute avec ${speakerCount} intervenant(s).
Tâches :
- Corrige l'orthographe et la ponctuation
- Améliore la lisibilité et la structure
${speakerCount > 1 ? "- Si tu peux déduire les prénoms ou rôles des intervenants depuis le contenu, remplace \"Intervenant A/B/…\" par ces noms. Sinon garde les lettres." : ""}
Réponds UNIQUEMENT avec la transcription mise en forme. Aucun commentaire.`,
        buildText(segmentsRef.current),
      );
    } catch (e: unknown) {
      setAiText(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
      setIsReformatting(false);
    }
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pos?.x ?? 0,
      initY: pos?.y ?? 0,
    };
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
  };

  const handleDragEnd = () => { dragRef.current = null; };

  if (!isAvailable) return null;

  const hasContent = segments.length > 0;
  const speakerSet = new Set(segments.map(s => s.speaker));
  const isMulti    = speakerSet.size > 1;
  const lastSpk    = segments.length > 0 ? segments[segments.length - 1].speaker : speakerRef.current;

  const canAi = settings.ai_provider === "ollama"
    ? !!(settings.ollama_url && settings.default_model)
    : settings.ai_provider === "claude"
      ? !!settings.claude_api_key
      : settings.ai_provider === "openai"
        ? !!settings.openai_api_key
        : settings.ai_provider === "gemini"
          ? !!settings.gemini_api_key
          : !!settings.mistral_api_key;

  return (
    <>
      {/* Toolbar button */}
      <button
        onClick={isRecording ? stop : (showPanel ? () => setShowPanel(true) : start)}
        title={isRecording ? "Arrêter l'enregistrement" : "Dictée vocale"}
        className={`p-1.5 rounded transition-colors ${
          isRecording ? "text-red-400 bg-red-400/10 animate-pulse" : "text-secondary hover:text-primary hover:bg-hover"
        }`}
      >
        {isRecording ? <MicOff size={17} /> : <Mic size={17} />}
      </button>

      {/* Floating panel */}
      {showPanel && pos && (
        <div
          ref={panelRef}
          className="fixed z-50 bg-panel border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ left: pos.x, top: pos.y, width: 360 }}
        >
          {/* ── Drag handle / header ── */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b border-border bg-sidebar shrink-0 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          >
            <GripVertical size={13} className="text-muted shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />}
              <span className="text-xs text-muted truncate">
                {isRecording
                  ? "Enregistrement en cours…"
                  : hasContent ? "Enregistrement terminé" : "Aucune parole détectée"}
              </span>
              {isMulti && !isRecording && (
                <span className="text-[10px] text-muted/50 px-1.5 py-0.5 rounded bg-hover shrink-0">
                  {speakerSet.size} intervenants
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setCollapsed(c => !c)}
                className="p-0.5 text-muted hover:text-primary transition-colors"
                title={collapsed ? "Agrandir" : "Réduire"}
              >
                {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button onClick={discard} className="p-0.5 text-muted hover:text-primary transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>

          {!collapsed && (
            <>
              {/* ── Transcript ── */}
              {(hasContent || interim) && (
                <div className="flex flex-col gap-0.5 px-4 py-3 max-h-52 overflow-y-auto">
                  {segments.map((seg, i) => (
                    <div key={i} className={`flex gap-2.5 text-sm rounded-lg px-2 py-1 ${isMulti ? SPEAKER_BG[seg.speaker % 4] : ""}`}>
                      {isMulti && (
                        <span className={`text-[11px] font-bold shrink-0 w-4 mt-0.5 ${SPEAKER_COLORS[seg.speaker % 4]}`}>
                          {String.fromCharCode(65 + seg.speaker)}
                        </span>
                      )}
                      <span className="text-primary leading-relaxed text-xs">{seg.text}</span>
                    </div>
                  ))}
                  {interim && (
                    <div className={`flex gap-2.5 text-sm rounded-lg px-2 py-1 opacity-50 ${isMulti ? SPEAKER_BG[lastSpk % 4] : ""}`}>
                      {isMulti && (
                        <span className={`text-[11px] font-bold shrink-0 w-4 mt-0.5 ${SPEAKER_COLORS[lastSpk % 4]}`}>
                          {String.fromCharCode(65 + lastSpk)}
                        </span>
                      )}
                      <span className="text-muted italic text-xs">{interim}</span>
                    </div>
                  )}
                </div>
              )}

              {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

              {/* ── Audio player ── */}
              {audioUrl && (
                <div className="flex items-center gap-2.5 px-4 py-2 border-t border-border/40 shrink-0 bg-hover/40">
                  <button
                    onClick={togglePlay}
                    className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors"
                  >
                    {isPlaying ? <Pause size={12} className="text-accent" /> : <Play size={12} className="text-accent" />}
                    <span>{isPlaying ? "Pause" : "Réécouter"}</span>
                  </button>
                  <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                </div>
              )}

              {/* ── AI result ── */}
              {showAiResult && (
                <div className="flex flex-col gap-2 px-4 py-3 border-t border-border/50 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Sparkles size={10} className="text-accent" />
                    <span>Mise en forme IA</span>
                    {isReformatting && <Loader2 size={10} className="animate-spin text-accent ml-1" />}
                  </div>
                  {aiText && (
                    <div className="text-xs text-primary leading-relaxed whitespace-pre-wrap bg-hover rounded-lg px-3 py-2.5 max-h-40 overflow-y-auto">
                      {aiText}
                      {isReformatting && <span className="animate-pulse text-accent ml-0.5">▋</span>}
                    </div>
                  )}
                  {!isReformatting && aiText && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => { onInsert(aiText); discard(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs transition-colors"
                      >
                        <Check size={11} />Insérer la version IA
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer actions ── */}
              {!isRecording && hasContent && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
                  <div>
                    {canAi && !showAiResult && (
                      <button
                        onClick={reformatWithAi}
                        disabled={isReformatting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-40"
                      >
                        <Sparkles size={11} />Reformater avec l'IA
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={discard}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary transition-colors"
                    >
                      <X size={11} />Ignorer
                    </button>
                    <button
                      onClick={() => { onInsert(buildText(segments)); discard(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs transition-colors"
                    >
                      <Check size={11} />Insérer
                    </button>
                  </div>
                </div>
              )}

              {/* ── Stop/Start button inside panel ── */}
              {isRecording && (
                <div className="flex justify-center px-4 py-3 border-t border-border shrink-0">
                  <button
                    onClick={stop}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs"
                  >
                    <MicOff size={13} />
                    Arrêter l'enregistrement
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
