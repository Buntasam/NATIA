import { useState, useEffect } from "react";
import { Lock, Delete } from "lucide-react";
import { useStore } from "../store";

const PIN_DOTS = 8;
const MAX_ATTEMPTS = 10;

export default function LockScreen() {
  const { unlock, passwordType } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const locked = attempts >= MAX_ATTEMPTS;

  const handleSubmit = async (pw?: string) => {
    const password = pw ?? value;
    if (!password || locked) return;
    setLoading(true);
    setError("");
    try {
      const ok = await unlock(password);
      if (!ok) {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          setError("Trop de tentatives — application bloquée.");
        } else {
          const remaining = MAX_ATTEMPTS - next;
          setError(`Mot de passe incorrect${remaining <= 5 ? ` — ${remaining} essai(s) restant(s)` : ""}`);
        }
        setValue("");
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

  // Keyboard support for PIN mode (numpad + top-row digits)
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

  if (passwordType === "pin") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
        {/* Logo */}
        <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
        <div className="flex items-center gap-2 mb-10 text-muted text-sm">
          <Lock size={13} />
          <span>Application verrouillée</span>
        </div>

        {/* Entry indicator — uniform dots, ne révèle pas le nombre saisi */}
        <div className="flex gap-3 mb-8">
          {Array.from({ length: PIN_DOTS }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border-2 transition-colors ${
                value.length > 0
                  ? "bg-accent border-accent"
                  : "border-border bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-xs mb-4 animate-pulse">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePin(d)}
              disabled={loading || locked}
              className="w-16 h-16 rounded-xl text-xl font-semibold text-primary bg-hover hover:bg-active border border-border transition-colors disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          {/* Bottom row */}
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
      </div>
    );
  }

  // ── Alphanumeric mode ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-panel">
      {/* Logo */}
      <span className="text-accent font-bold text-3xl tracking-tight mb-2 select-none">NATIA</span>
      <div className="flex items-center gap-2 mb-10 text-muted text-sm">
        <Lock size={13} />
        <span>Application verrouillée</span>
      </div>

      {/* Input */}
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
    </div>
  );
}
