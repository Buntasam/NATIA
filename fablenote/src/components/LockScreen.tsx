import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Delete, Lock, Plus, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useStore } from "../store";
import D20Roller from "./D20Roller";
import ResetConfirmDialog from "./ResetConfirmDialog";
import RecoveryUnlock from "./RecoveryUnlock";
import { LockPostIt, POSTIT_COLORS, arePostItsHidden, loadPostIts, newPostIt, savePostIts, setPostItsHidden } from "../lib/lockPostIts";
import { trError, useT } from "../i18n";

const PIN_DOTS = 8;
// Ancien compteur côté navigateur, contournable : le blocage est désormais géré en Rust.
const LEGACY_ATTEMPTS_KEY = "natia_failed_attempts";

interface LockStatus {
  failed_attempts: number;
  locked_for_secs: number;
  attempts_before_lock: number;
}

function formatWait(secs: number): string {
  if (secs < 60) return `${Math.max(1, secs)} s`;
  if (secs < 3600) return `${Math.ceil(secs / 60)} min`;
  return `${Math.floor(secs / 3600)} h ${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")} min`;
}

// ─── Lock-screen post-its ─────────────────────────────────────────────────────

const POSTIT_DEFAULT_W = 180;
const POSTIT_DEFAULT_H = 130;
const POSTIT_MIN_W = 120;
const POSTIT_MIN_H = 80;


// ─── LockScreen ──────────────────────────────────────────────────────────────

export default function LockScreen() {
  const t = useT();
  const { unlock, passwordType } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [postIts, setPostIts] = useState<LockPostIt[]>(loadPostIts);
  const [postItsHidden, setHidden] = useState(arePostItsHidden);
  const togglePostIts = () => { setPostItsHidden(!postItsHidden); setHidden(!postItsHidden); };
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // Source de vérité : le backend (compteur persistant en base, non contournable depuis l'interface).
  const [lockedFor, setLockedFor] = useState(0);
  const locked = lockedFor > 0;

  const refreshStatus = async (): Promise<LockStatus | null> => {
    try {
      const s = await invoke<LockStatus>("get_lock_status");
      setLockedFor(s.locked_for_secs);
      return s;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    localStorage.removeItem(LEGACY_ATTEMPTS_KEY);
    refreshStatus();
  }, []);

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setLockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [locked]);

  const shownError = locked ? t("Trop de tentatives — réessayez dans {d}", { d: formatWait(lockedFor) }) : error;

  const handleReset = () => {
    setShowResetDialog(true);
  };

  const addPostIt = () => {
    if (postItsHidden) { setPostItsHidden(false); setHidden(false); }
    setPostIts((prev) => {
      const updated = [...prev, newPostIt()];
      savePostIts(updated);
      return updated;
    });
  };

  const handleSubmit = async (pw?: string) => {
    const password = pw ?? value;
    if (!password || locked) return;
    setLoading(true);
    setError("");
    try {
      const ok = await unlock(password);
      if (!ok) {
        const s = await refreshStatus();
        const left = s?.attempts_before_lock ?? 0;
        setError(s && s.locked_for_secs === 0 && left > 0 && left <= 3
          ? t("Mot de passe incorrect — {n} essai(s) avant blocage", { n: left })
          : t("Mot de passe incorrect"));
        setValue("");
      }
    } catch (e: unknown) {
      setError(trError(e));
      setValue("");
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  // ── PIN mode ────────────────────────────────────────────────────────────────

  const handlePin = (digit: string) => {
    if (value.length >= PIN_DOTS || locked) return;
    setValue((v) => v + digit);
  };

  const handleConfirm = () => {
    if (value.length >= 4) handleSubmit(value);
  };

  useEffect(() => {
    // Pas de pavé numérique clavier pendant la saisie d'une clé de récupération.
    if (passwordType !== "pin" || recovering || showResetDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handlePin(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [passwordType, loading, value, recovering, showResetDialog]);

  const handleBackspace = () => setValue((v) => v.slice(0, -1));

  // ── Éléments partagés entre les deux modes ────────────────────────────────────

  const forgotLink = (
    <button
      onClick={() => setRecovering(true)}
      className="mt-4 text-xs text-muted hover:text-accent underline-offset-2 hover:underline transition-colors"
    >
      {t("Mot de passe oublié ou nouveau PC ?")}
    </button>
  );

  const dialogs = (
    <>
      <ResetConfirmDialog isOpen={showResetDialog} onClose={() => setShowResetDialog(false)} />
      {recovering && <RecoveryUnlock onClose={() => setRecovering(false)} onDone={() => setRecovering(false)} />}
    </>
  );

  const postItsLayer = (
    <>
      {!postItsHidden && postIts.map((p) => (
        <DraggablePostIt
          key={p.id}
          note={p}
          onMove={(x, y) =>
            setPostIts((prev) => prev.map((n) => (n.id === p.id ? { ...n, x, y } : n)))
          }
          onMoveEnd={(x, y) => {
            setPostIts((prev) => {
              const updated = prev.map((n) => (n.id === p.id ? { ...n, x, y } : n));
              savePostIts(updated);
              return updated;
            });
          }}
          onUpdate={(updates) => {
            setPostIts((prev) => {
              const updated = prev.map((n) => (n.id === p.id ? { ...n, ...updates } : n));
              savePostIts(updated);
              return updated;
            });
          }}
          onResize={(width, height) =>
            setPostIts((prev) => prev.map((n) => (n.id === p.id ? { ...n, width, height } : n)))
          }
          onDelete={() => {
            setPostIts((prev) => {
              const updated = prev.filter((n) => n.id !== p.id);
              savePostIts(updated);
              return updated;
            });
          }}
        />
      ))}
      <div style={{ position: "absolute", bottom: 20, right: 20, zIndex: 220 }} className="flex items-center gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/15 border border-red-400/20 hover:border-red-400/30 text-red-400 text-xs transition-colors"
          title={t("Effacer toutes les données et repartir de zéro")}
        >
          <AlertTriangle size={12} />
          {t("Réinitialiser l'app")}
        </button>
        {postIts.length > 0 && (
          <button
            onClick={togglePostIts}
            aria-label={postItsHidden ? t("Afficher les post-its") : t("Masquer les post-its")}
            title={postItsHidden ? t("Afficher les post-its ({n})", { n: postIts.length }) : t("Masquer les post-its")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white/60 text-xs transition-colors"
          >
            {postItsHidden ? <Eye size={12} /> : <EyeOff size={12} />}
            {postItsHidden && <span>{postIts.length}</span>}
          </button>
        )}
        <button
          onClick={addPostIt}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white/60 text-xs transition-colors"
          title={t("Ajouter un post-it")}
        >
          <Plus size={12} />
          {t("Post-it")}
        </button>
      </div>
    </>
  );

  // ── PIN mode UI ──────────────────────────────────────────────────────────────

  if (passwordType === "pin") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
        <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
        <div className="flex items-center gap-2 mb-10 text-muted text-sm">
          <Lock size={13} />
          <span>{t("Application verrouillée")}</span>
        </div>

        {/* Un dot par chiffre saisi */}
        <div className="flex gap-3 mb-8">
          {Array.from({ length: PIN_DOTS }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border-2 transition-colors ${
                i < value.length
                  ? "bg-accent border-accent"
                  : "border-border bg-transparent"
              }`}
            />
          ))}
        </div>

        {shownError && (
          <p className="text-red-400 text-xs mb-4 animate-pulse">{shownError}</p>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePin(d)}
              disabled={loading || locked}
              className="w-16 h-16 rounded-xl text-xl font-semibold text-primary bg-hover hover:bg-active border border-border transition-colors disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleConfirm}
            disabled={loading || value.length < 4 || locked}
            className="w-16 h-16 rounded-xl text-xl font-semibold text-accent bg-hover hover:bg-active border border-accent transition-colors disabled:opacity-30"
          >
            ✓
          </button>
          <button
            onClick={() => handlePin("0")}
            disabled={loading || locked}
            className="w-16 h-16 rounded-xl text-xl font-semibold text-primary bg-hover hover:bg-active border border-border transition-colors disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={loading || value.length === 0 || locked}
            className="w-16 h-16 rounded-xl flex items-center justify-center text-muted hover:text-primary bg-hover hover:bg-active border border-border transition-colors disabled:opacity-30"
          >
            <Delete size={18} />
          </button>
        </div>

        {loading && <p className="text-muted text-xs">{t("Vérification…")}</p>}
        {forgotLink}

        {postItsLayer}
        <D20Roller />
        {dialogs}
      </div>
    );
  }

  // ── Alphanumeric mode UI ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
      <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
      <div className="flex items-center gap-2 mb-10 text-muted text-sm">
        <Lock size={13} />
        <span>{t("Application verrouillée")}</span>
      </div>

      <div className="w-72 flex flex-col gap-3">
        <input
          type="password"
          value={value}
          onChange={(e) => { if (!locked) { setValue(e.target.value); setError(""); } }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder={t("Mot de passe")}
          autoFocus
          disabled={locked}
          className="w-full px-4 py-3 rounded-xl bg-hover border border-border text-primary placeholder-muted outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
        />

        {shownError && <p className="text-red-400 text-xs text-center">{shownError}</p>}

        <button
          onClick={() => handleSubmit()}
          disabled={loading || !value || locked}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? t("Vérification…") : t("Déverrouiller")}
        </button>
      </div>
      {forgotLink}

      {postItsLayer}
      <D20Roller />
      {dialogs}
    </div>
  );
}

// ─── DraggablePostIt ─────────────────────────────────────────────────────────

function DraggablePostIt({
  note,
  onMove,
  onMoveEnd,
  onUpdate,
  onResize,
  onDelete,
}: {
  note: LockPostIt;
  onMove: (x: number, y: number) => void;
  onMoveEnd: (x: number, y: number) => void;
  onUpdate: (updates: Partial<Omit<LockPostIt, "id">>) => void;
  onResize: (width: number, height: number) => void;
  onDelete: () => void;
}) {
  const startRef = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(null);
  const t = useT();
  const width = note.width ?? POSTIT_DEFAULT_W;
  const height = note.height ?? POSTIT_DEFAULT_H;

  // Redimensionnement live via onResize, puis sauvegarde au relâchement via onUpdate.
  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { mx: e.clientX, my: e.clientY, w: width, h: height };
    const size = (ev: MouseEvent) => ({
      width: Math.min(Math.max(start.w + ev.clientX - start.mx, POSTIT_MIN_W), window.innerWidth - note.x),
      height: Math.min(Math.max(start.h + ev.clientY - start.my, POSTIT_MIN_H), window.innerHeight - note.y),
    });
    const onMM = (ev: MouseEvent) => { const s = size(ev); onResize(s.width, s.height); };
    const onMU = (ev: MouseEvent) => {
      onUpdate(size(ev));
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", onMU);
    };
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    startRef.current = { mx: e.clientX, my: e.clientY, nx: note.x, ny: note.y };

    const onMM = (ev: MouseEvent) => {
      if (!startRef.current) return;
      onMove(
        startRef.current.nx + ev.clientX - startRef.current.mx,
        startRef.current.ny + ev.clientY - startRef.current.my,
      );
    };

    const onMU = (ev: MouseEvent) => {
      if (!startRef.current) return;
      onMoveEnd(
        startRef.current.nx + ev.clientX - startRef.current.mx,
        startRef.current.ny + ev.clientY - startRef.current.my,
      );
      startRef.current = null;
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", onMU);
    };

    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: "absolute", left: note.x, top: note.y, width, height, zIndex: 210 }}
      className="rounded-lg shadow-xl overflow-hidden flex flex-col"
    >
      {/* Barre de titre / drag handle */}
      <div
        style={{ backgroundColor: note.color }}
        className="flex items-center justify-between px-2 py-1.5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex gap-1.5 items-center">
          {POSTIT_COLORS.map((c) => (
            <button
              key={c}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onUpdate({ color: c })}
              style={{
                backgroundColor: c,
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: note.color === c ? "2px solid rgba(0,0,0,0.45)" : "1px solid rgba(0,0,0,0.15)",
                flexShrink: 0,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          style={{
            fontSize: 16,
            lineHeight: 1,
            color: "rgba(0,0,0,0.35)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* Corps texte */}
      <textarea
        value={note.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="..."
        style={{ backgroundColor: note.color, color: "rgba(0,0,0,0.75)", resize: "none" }}
        className="w-full flex-1 min-h-0 px-2.5 py-2 text-xs placeholder:text-black/25 outline-none border-0 leading-relaxed"
      />

      {/* Poignée de redimensionnement */}
      <div
        onMouseDown={onResizeStart}
        title={t("Redimensionner")}
        style={{ position: "absolute", right: 0, bottom: 0, width: 14, height: 14, cursor: "nwse-resize" }}
        className="flex items-end justify-end p-0.5"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M9 1L1 9M9 5L5 9" stroke="rgba(0,0,0,0.35)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
