import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import DOMPurify from "dompurify";
import { useStore } from "../store";

function htmlToSlides(html: string): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;

  const slides: string[] = [];
  let current: HTMLElement[] = [];

  const flush = () => {
    if (current.length > 0) {
      const tmp = document.createElement("div");
      current.forEach((el) => tmp.appendChild(el.cloneNode(true)));
      slides.push(tmp.innerHTML);
      current = [];
    }
  };

  Array.from(div.children).forEach((child) => {
    const tag = child.tagName;
    if (tag === "H1" || tag === "H2") {
      flush();
      current.push(child as HTMLElement);
    } else if (tag === "HR") {
      flush();
    } else {
      current.push(child as HTMLElement);
    }
  });
  flush();

  return slides.filter((s) => s.trim() !== "");
}

interface Props {
  onClose: () => void;
}

export default function PresentationMode({ onClose }: Props) {
  const { activeNote } = useStore();
  const slides = activeNote ? htmlToSlides(activeNote.content) : [];
  const [idx, setIdx] = useState(0);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(slides.length - 1, i + 1)), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prev(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white/60 text-center">
          <p className="text-lg mb-2">Aucun contenu à présenter</p>
          <p className="text-sm">Utilise des titres H1/H2 ou des séparateurs — pour diviser en slides</p>
          <button onClick={onClose} className="mt-6 px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col select-none">
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span className="text-white/40 text-sm">{idx + 1} / {slides.length}</span>
        <button onClick={onClose} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-16 py-12 overflow-hidden">
        <div
          className="slide-content max-w-4xl w-full"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slides[idx]) }}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-8 py-6 shrink-0">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Dots */}
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${
                i === idx ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={idx === slides.length - 1}
          className="p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <p className="text-white/20 text-xs text-center pb-3">← → pour naviguer · Échap pour quitter</p>
    </div>
  );
}
