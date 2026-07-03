import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tooltip custom : apparition rapide, style cohérent avec l'app, badge raccourci.
// Remplace les `title` natifs (lents, non stylables).

export default function Tip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      let x = rect.left + rect.width / 2;
      let y = rect.bottom + 6;
      if (side === "top") y = rect.top - 6;
      if (side === "left") { x = rect.left - 6; y = rect.top + rect.height / 2; }
      if (side === "right") { x = rect.right + 6; y = rect.top + rect.height / 2; }
      setPos({ x, y });
    }, 350);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  };

  const transform =
    side === "bottom" ? "translate(-50%, 0)" :
    side === "top" ? "translate(-50%, -100%)" :
    side === "left" ? "translate(-100%, -50%)" :
    "translate(0, -50%)";

  return (
    <span
      ref={wrapRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
      className="inline-flex"
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="fixed z-[600] flex items-center gap-1.5 px-2 py-1 rounded-md bg-panel border border-border shadow-lg pointer-events-none whitespace-nowrap"
            style={{ left: pos.x, top: pos.y, transform }}
          >
            <span className="text-[11px] text-primary">{label}</span>
            {shortcut && (
              <span className="text-[10px] text-muted bg-hover border border-border rounded px-1 py-px font-mono">
                {shortcut}
              </span>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
