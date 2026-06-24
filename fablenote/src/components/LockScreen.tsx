import React, { useState, useEffect, useRef } from "react";
import { Delete, Lock, Plus } from "lucide-react";
import { useStore } from "../store";
import D20Roller from "./D20Roller";

const PIN_DOTS = 8;
const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min avant réinitialisation
const ATTEMPTS_KEY = "natia_failed_attempts";

interface PersistedLockout {
  count: number;
  lockedAt?: number;
}

function loadAttempts(): PersistedLockout {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "{}"); }
  catch { return { count: 0 }; }
}

function saveAttempts(data: PersistedLockout) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data));
}

// ─── Lock-screen post-its ─────────────────────────────────────────────────────

interface LockPostIt {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

const POSTIT_COLORS = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bae6fd", "#e9d5ff"];
const POSTIT_KEY = "natia_lock_postits";

function loadPostIts(): LockPostIt[] {
  try {
    return JSON.parse(localStorage.getItem(POSTIT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// ─── LockScreen ──────────────────────────────────────────────────────────────

export default function LockScreen() {
  const { unlock, passwordType } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [postIts, setPostIts] = useState<LockPostIt[]>(loadPostIts);

  // Attempts persisted in localStorage to survive app restarts
  const [lockout, setLockout] = useState<PersistedLockout>(() => {
    const data = loadAttempts();
    // Auto-clear lockout after LOCKOUT_DURATION_MS
    if (data.lockedAt && Date.now() - data.lockedAt > LOCKOUT_DURATION_MS) {
      const reset = { count: 0 };
      saveAttempts(reset);
      return reset;
    }
    return data;
  });

  const attempts = lockout.count;
  const locked = attempts >= MAX_ATTEMPTS;

  const bumpAttempts = () => {
    const next = attempts + 1;
    const data: PersistedLockout = next >= MAX_ATTEMPTS
      ? { count: next, lockedAt: Date.now() }
      : { count: next };
    saveAttempts(data);
    setLockout(data);
    return next;
  };

  const clearAttempts = () => {
    saveAttempts({ count: 0 });
    setLockout({ count: 0 });
  };

  const addPostIt = () => {
    const note: LockPostIt = {
      id: crypto.randomUUID(),
      text: "",
      x: 40 + Math.random() * Math.max(window.innerWidth - 260, 100),
      y: 40 + Math.random() * Math.max(window.innerHeight - 260, 100),
      color: POSTIT_COLORS[Math.floor(Math.random() * POSTIT_COLORS.length)],
    };
    setPostIts((prev) => {
      const updated = [...prev, note];
      localStorage.setItem(POSTIT_KEY, JSON.stringify(updated));
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
        const next = bumpAttempts();
        if (next >= MAX_ATTEMPTS) {
          setError("Trop de tentatives — application bloquée 15 min.");
        } else {
          const remaining = MAX_ATTEMPTS - next;
          setError(`Mot de passe incorrect${remaining <= 5 ? ` — ${remaining} essai(s) restant(s)` : ""}`);
        }
        setValue("");
      } else {
        clearAttempts();
      }
    } catch (e: unknown) {
      setError(String(e));
      setValue("");
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
    if (passwordType !== "pin") return;
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
  }, [passwordType, loading, value]);

  const handleBackspace = () => setValue((v) => v.slice(0, -1));

  // ── Post-its layer (partagé entre les deux modes) ────────────────────────────

  const postItsLayer = (
    <>
      {postIts.map((p) => (
        <DraggablePostIt
          key={p.id}
          note={p}
          onMove={(x, y) =>
            setPostIts((prev) => prev.map((n) => (n.id === p.id ? { ...n, x, y } : n)))
          }
          onMoveEnd={(x, y) => {
            setPostIts((prev) => {
              const updated = prev.map((n) => (n.id === p.id ? { ...n, x, y } : n));
              localStorage.setItem(POSTIT_KEY, JSON.stringify(updated));
              return updated;
            });
          }}
          onUpdate={(updates) => {
            setPostIts((prev) => {
              const updated = prev.map((n) => (n.id === p.id ? { ...n, ...updates } : n));
              localStorage.setItem(POSTIT_KEY, JSON.stringify(updated));
              return updated;
            });
          }}
          onDelete={() => {
            setPostIts((prev) => {
              const updated = prev.filter((n) => n.id !== p.id);
              localStorage.setItem(POSTIT_KEY, JSON.stringify(updated));
              return updated;
            });
          }}
        />
      ))}
      <button
        onClick={addPostIt}
        style={{ position: "absolute", bottom: 20, right: 20, zIndex: 220 }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white/60 text-xs transition-colors"
        title="Ajouter un post-it"
      >
        <Plus size={12} />
        Post-it
      </button>
    </>
  );

  // ── PIN mode UI ──────────────────────────────────────────────────────────────

  if (passwordType === "pin") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
        <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
        <div className="flex items-center gap-2 mb-10 text-muted text-sm">
          <Lock size={13} />
          <span>Application verrouillée</span>
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

        {error && (
          <p className="text-red-400 text-xs mb-4 animate-pulse">{error}</p>
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

        {loading && <p className="text-muted text-xs">Vérification…</p>}

        {postItsLayer}
        <D20Roller />
      </div>
    );
  }

  // ── Alphanumeric mode UI ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
      <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
      <div className="flex items-center gap-2 mb-10 text-muted text-sm">
        <Lock size={13} />
        <span>Application verrouillée</span>
      </div>

      <div className="w-72 flex flex-col gap-3">
        <input
          type="password"
          value={value}
          onChange={(e) => { if (!locked) { setValue(e.target.value); setError(""); } }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Mot de passe"
          autoFocus
          disabled={locked}
          className="w-full px-4 py-3 rounded-xl bg-hover border border-border text-primary placeholder-muted outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
        />

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <button
          onClick={() => handleSubmit()}
          disabled={loading || !value || locked}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? "Vérification…" : "Déverrouiller"}
        </button>
      </div>

      {postItsLayer}
      <D20Roller />
    </div>
  );
}

// ─── DraggablePostIt ─────────────────────────────────────────────────────────

function DraggablePostIt({
  note,
  onMove,
  onMoveEnd,
  onUpdate,
  onDelete,
}: {
  note: LockPostIt;
  onMove: (x: number, y: number) => void;
  onMoveEnd: (x: number, y: number) => void;
  onUpdate: (updates: Partial<Omit<LockPostIt, "id">>) => void;
  onDelete: () => void;
}) {
  const startRef = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(null);

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
      style={{ position: "absolute", left: note.x, top: note.y, width: 180, zIndex: 210 }}
      className="rounded-lg shadow-xl overflow-hidden"
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
        rows={4}
        style={{ backgroundColor: note.color, color: "rgba(0,0,0,0.75)", resize: "none" }}
        className="w-full px-2.5 py-2 text-xs placeholder:text-black/25 outline-none border-0 leading-relaxed"
      />
    </div>
  );
}
