import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { CheckSquare, FileText, Loader2 } from "lucide-react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { NatiaSymbol } from "./Brand";
import { CAPTURE_DONE_EVENT, CAPTURE_EVENT, CaptureKind, CaptureReply } from "../lib/quickCapture";

const KIND_KEY = "natia_capture_kind";

/**
 * Petite fenêtre de la capture rapide (Ctrl+Alt+N, src-tauri/src/capture.rs).
 * Elle envoie le texte à la fenêtre principale, qui l'enregistre.
 */
export default function CaptureWindow() {
  const t = useT();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CaptureKind>(() => {
    try { return localStorage.getItem(KIND_KEY) === "task" ? "task" : "note"; } catch { return "note"; }
  });
  const [state, setState] = useState<"idle" | "sending" | "done" | "locked" | "error">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<string | null>(null);

  // Même thème que la fenêtre principale.
  useEffect(() => {
    try { useStore.getState().setTheme(localStorage.getItem("natia_theme") ?? "light"); } catch { /* */ }
  }, []);

  const hide = () => { getCurrentWindow().hide().catch(() => {}); };

  // Remise à zéro à chaque ouverture de la fenêtre.
  useEffect(() => {
    const win = getCurrentWindow();
    const un = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (state === "done") { setText(""); setState("idle"); }
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    });
    return () => { un.then((f) => f()); };
  }, [state]);

  useEffect(() => {
    const un = listen<CaptureReply>(CAPTURE_DONE_EVENT, ({ payload }) => {
      if (payload.id !== pending.current) return;
      pending.current = null;
      if (payload.ok) {
        setState("done");
        setText("");
        setTimeout(() => { setState("idle"); hide(); }, 700);
      } else if (payload.error === "locked") {
        setState("locked");
      } else {
        setState("error");
        setError(payload.error ?? "");
      }
    });
    return () => { un.then((f) => f()); };
  }, []);

  const chooseKind = (k: CaptureKind) => {
    setKind(k);
    try { localStorage.setItem(KIND_KEY, k); } catch { /* stockage indisponible */ }
    inputRef.current?.focus();
  };

  const send = async () => {
    const value = text.trim();
    if (!value || state === "sending") return;
    const id = crypto.randomUUID();
    pending.current = id;
    setState("sending"); setError("");
    await emitTo("main", CAPTURE_EVENT, { id, kind, text: value });
    // Pas de réponse (fenêtre principale pas encore prête) : on le dit plutôt que d'attendre.
    setTimeout(() => {
      if (pending.current === id) { pending.current = null; setState("error"); setError(t("NATIA ne répond pas. Réessayez dans un instant.")); }
    }, 8000);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); return; }
    if (e.key === "Tab") { e.preventDefault(); chooseKind(kind === "note" ? "task" : "note"); return; }
    // Entrée enregistre ; Maj+Entrée va à la ligne (pour une note).
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const tab = (k: CaptureKind, label: string, Icon: typeof FileText) => (
    <button
      onClick={() => chooseKind(k)}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${kind === k ? "bg-accent/15 text-accent" : "text-muted hover:text-primary"}`}
    >
      <Icon size={11} />{label}
    </button>
  );

  return (
    <div className="h-screen w-screen p-3 flex flex-col gap-2 bg-panel border border-border rounded-lg select-none" data-tauri-drag-region>
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <NatiaSymbol size={16} className="text-primary" />
        <span className="text-xs font-medium text-secondary" data-tauri-drag-region>{t("Capture rapide")}</span>
        <div className="flex items-center gap-1 ml-2">
          {tab("note", t("Note"), FileText)}
          {tab("task", t("Tâche"), CheckSquare)}
        </div>
        <span className="ml-auto text-[10px] text-muted">{t("Entrée : enregistrer · Tab : note/tâche · Échap : fermer")}</span>
      </div>
      <textarea
        ref={inputRef}
        autoFocus
        value={text}
        onChange={(e) => { setText(e.target.value); if (state !== "sending") setState("idle"); }}
        onKeyDown={onKey}
        placeholder={kind === "note"
          ? t("Une idée ? La première ligne devient le titre (Maj+Entrée pour aller à la ligne)")
          : t("Une tâche ? (@demain, @vendredi, @15/11 pour une échéance)")}
        className="flex-1 resize-none bg-base border border-border rounded-md px-3 py-2 text-sm text-primary placeholder-muted outline-none focus:border-accent select-text"
      />
      <div className="h-5 flex items-center text-xs">
        {state === "sending" && <span className="flex items-center gap-1 text-muted"><Loader2 size={11} className="animate-spin" />{t("Enregistrement…")}</span>}
        {state === "done" && <span className="text-emerald-500">{kind === "note" ? t("✓ Note enregistrée") : t("✓ Tâche ajoutée")}</span>}
        {state === "error" && <span className="text-red-500 truncate">{error || t("Échec de l'enregistrement")}</span>}
        {state === "locked" && (
          <span className="flex items-center gap-2 text-amber-600">
            {t("NATIA est verrouillée : déverrouillez-la d'abord.")}
            <button
              onClick={() => { invoke("open_main_window").catch(() => {}); hide(); }}
              className="underline hover:text-primary"
            >
              {t("Ouvrir NATIA")}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
