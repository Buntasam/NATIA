import { useRef } from "react";

// Poignée de redimensionnement horizontal pour les panneaux latéraux.
// `edge` : bord du panneau sur lequel la poignée est posée.

export default function ResizeHandle({
  edge,
  getWidth,
  setWidth,
  min,
  max,
}: {
  edge: "left" | "right";
  getWidth: () => number;
  setWidth: (w: number) => void;
  min: number;
  max: number;
}) {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: getWidth() };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const raw = edge === "right" ? dragRef.current.startW + dx : dragRef.current.startW - dx;
      setWidth(Math.min(max, Math.max(min, raw)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={() => setWidth(min)}
      className={`absolute top-0 bottom-0 w-1.5 cursor-col-resize z-30 hover:bg-accent/30 active:bg-accent/50 transition-colors ${
        edge === "right" ? "-right-0.5" : "-left-0.5"
      }`}
      aria-hidden="true"
    />
  );
}
