import React, { useState, useRef, useCallback, useEffect, useId } from "react";
import { GripVertical } from "lucide-react";

const POS_KEY   = "natia_dice_pos";
const ENABLED_KEY = "natia_dice_enabled";

// Delays between number changes (ms) — fast then slow (slot-machine feel)
const STEPS = [50, 55, 60, 68, 78, 92, 110, 135, 168, 210, 265, 330, 400, 475, 550];

function savedPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}");
    if (typeof p.x === "number" && typeof p.y === "number") return p as { x: number; y: number };
  } catch { /* empty */ }
  return null;
}

// ─── D20 SVG face ────────────────────────────────────────────────────────────
//
// 10 triangular faces visible (front-facing icosahedron view):
//   Outer hexagon: (50,2)-(93,26)-(93,74)-(50,98)-(7,74)-(7,26)
//   Main face triangle: (50,13)-(84,70)-(16,70)
//   9 connectors from inner vertices to outer hexagon vertices
//   → produces 9 triangular side-faces + 1 central face = 10 faces total
//
function D20Face({
  value, rolling, landed, result, uid,
}: { value: number; rolling: boolean; landed: boolean; result: number | null; uid: string }) {
  const isCrit = !rolling && result === 20;
  const isFail = !rolling && result === 1;

  const stroke  = isCrit ? "#fbbf24" : isFail ? "#f87171" : "#d97757";
  const numFill = isCrit ? "#fbbf24" : isFail ? "#f87171" : "#f0ede8";
  const glow    = isCrit ? "#fbbf2480" : isFail ? "#f8717180" : "#d9775760";

  const bodyA = isCrit ? "#2d1800" : isFail ? "#2d0000" : "#1c0f06";
  const bodyB = isCrit ? "#0f0800" : isFail ? "#0f0000" : "#0b0602";

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full select-none"
      style={{
        filter: (!rolling && result !== null)
          ? `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 4px ${glow})`
          : "none",
        transition: "filter 0.35s ease",
      }}
    >
      <defs>
        <linearGradient id={`body-${uid}`} x1="25%" y1="5%" x2="75%" y2="95%">
          <stop offset="0%" stopColor={bodyA} />
          <stop offset="100%" stopColor={bodyB} />
        </linearGradient>
        <linearGradient id={`face-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={`shine-${uid}`} cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="0.07" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Die body ── */}
      <polygon
        points="50,2 93,26 93,74 50,98 7,74 7,26"
        fill={`url(#body-${uid})`}
        stroke={stroke}
        strokeWidth="1.6"
        strokeOpacity="0.5"
        strokeLinejoin="round"
      />

      {/* ── Shine overlay ── */}
      <polygon
        points="50,2 93,26 93,74 50,98 7,74 7,26"
        fill={`url(#shine-${uid})`}
      />

      {/* ── Main 20-face (central upward triangle) ── */}
      <polygon
        points="50,13 84,70 16,70"
        fill={`url(#face-${uid})`}
        stroke={stroke}
        strokeWidth="1"
        strokeOpacity="0.45"
        strokeLinejoin="round"
      />

      {/* ── Face dividers (9 connectors) ── */}
      {[
        // From inner top (50,13):
        "M50,2  L50,13",
        "M93,26 L50,13",
        "M7,26  L50,13",
        // From inner right (84,70):
        "M93,26 L84,70",
        "M93,74 L84,70",
        "M50,98 L84,70",
        // From inner left (16,70):
        "M7,26  L16,70",
        "M7,74  L16,70",
        "M50,98 L16,70",
      ].map((d, i) => (
        <path key={i} d={d} stroke={stroke} strokeWidth="0.55" strokeOpacity="0.28" />
      ))}

      {/* ── Number ── */}
      <text
        x="50"
        y="47"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={value >= 10 ? "22" : "26"}
        fontWeight="800"
        fill={numFill}
        fontFamily="'SF Pro Display', -apple-system, system-ui, sans-serif"
        letterSpacing="-0.5"
      >
        {value}
      </text>

      {/* ── Underline for 6/9 disambiguation ── */}
      {!rolling && (value === 6 || value === 9) && (
        <line x1="43" y1="58" x2="57" y2="58" stroke={numFill} strokeWidth="1.5" strokeOpacity="0.65" />
      )}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function D20Roller() {
  // Only render if feature is enabled
  if (localStorage.getItem(ENABLED_KEY) !== "1") return null;

  return <D20RollerInner />;
}

function D20RollerInner() {
  const uid = useId().replace(/:/g, "");
  const defaultPos = { x: Math.max(window.innerWidth - 176 - 20, 20), y: Math.max(window.innerHeight - 260 - 80, 20) };
  const [pos, setPos]         = useState(() => savedPos() ?? defaultPos);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded]   = useState(false);
  const [display, setDisplay] = useState(20);
  const [result, setResult]   = useState<number | null>(20);
  const [history, setHistory] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dragRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.ox + e.clientX - dragRef.current.mx,
      y: dragRef.current.oy + e.clientY - dragRef.current.my,
    });
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const next = {
      x: dragRef.current.ox + e.clientX - dragRef.current.mx,
      y: dragRef.current.oy + e.clientY - dragRef.current.my,
    };
    dragRef.current = null;
    setPos(next);
    localStorage.setItem(POS_KEY, JSON.stringify(next));
  }, []);

  const roll = useCallback(() => {
    if (rolling) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRolling(true);
    setLanded(false);
    setResult(null);
    const final = Math.floor(Math.random() * 20) + 1;

    let acc = 0;
    STEPS.forEach((delay, i) => {
      acc += delay;
      const t = setTimeout(() => {
        if (i === STEPS.length - 1) {
          setDisplay(final);
          setResult(final);
          setRolling(false);
          setLanded(true);
          setHistory(prev => [final, ...prev].slice(0, 7));
          setTimeout(() => setLanded(false), 350);
        } else {
          setDisplay(Math.floor(Math.random() * 20) + 1);
        }
      }, acc);
      timers.current.push(t);
    });
  }, [rolling]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const isCrit = result === 20 && !rolling;
  const isFail = result === 1 && !rolling;

  return (
    <div style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 310, width: 168, userSelect: "none" }}>

      {/* ── Drag handle / title bar ── */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        style={{ touchAction: "none" }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-xl bg-panel border border-border border-b-0 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={12} className="text-muted shrink-0" />
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider flex-1">Dé à 20 faces</span>
      </div>

      {/* ── Panel body ── */}
      <div className="bg-panel border border-border rounded-b-xl px-3 pt-2.5 pb-3 flex flex-col items-center gap-2.5">

        {/* Die */}
        <div
          onClick={roll}
          className={`w-32 h-32 cursor-pointer ${rolling ? "d20-rolling" : landed ? "d20-land" : "hover:scale-[1.03] transition-transform duration-150"}`}
          title={rolling ? "Lancer en cours…" : "Cliquer pour lancer"}
        >
          <D20Face value={display} rolling={rolling} landed={landed} result={result} uid={uid} />
        </div>

        {/* Result label */}
        <div className="h-[18px] flex items-center justify-center">
          {rolling ? (
            <span className="text-[10px] text-muted animate-pulse">Lancer en cours…</span>
          ) : result !== null ? (
            <span key={result} className={`text-[11px] font-semibold d20-fade-in ${
              isCrit ? "text-amber-400" : isFail ? "text-red-400" : "text-secondary"
            }`}>
              {isCrit ? "✦ Coup critique !" : isFail ? "✕ Échec critique" : `Résultat : ${result}`}
            </span>
          ) : (
            <span className="text-[10px] text-muted">Cliquer pour lancer</span>
          )}
        </div>

        {/* Roll button */}
        <button
          onClick={roll}
          disabled={rolling}
          className="w-full py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent"
        >
          {rolling ? "Lancer…" : "Lancer le dé"}
        </button>

        {/* History */}
        {history.length > 0 && (
          <div className="w-full">
            <p className="text-[9px] text-muted uppercase tracking-wider mb-1">Historique</p>
            <div className="flex gap-1 flex-wrap">
              {history.map((n, i) => (
                <span key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  n === 20 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
                : n === 1  ? "text-red-400  border-red-400/30  bg-red-400/10"
                :            "text-muted    border-border       bg-hover"
                }`}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
