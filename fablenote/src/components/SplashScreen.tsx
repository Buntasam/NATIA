import { useEffect, useState } from "react";
import { NatiaAnimated, NatiaWordmark } from "./Brand";

/** Durée de l'animation d'intro avant le fondu (l'anneau finit vers 1,5 s). */
const SHOW_MS = 1700;
const FADE_MS = 350;

/** Animation du logo au démarrage de NATIA, par-dessus l'app qui se charge derrière. */
export default function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "fade" | "done">("show");

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fade = setTimeout(() => setPhase("fade"), reduced ? 400 : SHOW_MS);
    const done = setTimeout(() => setPhase("done"), (reduced ? 400 : SHOW_MS) + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, []);

  if (phase === "done") return null;
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[400] flex flex-col items-center justify-center gap-5 bg-base text-primary select-none ${phase === "fade" ? "natia-splash-out" : ""}`}
    >
      <NatiaAnimated size={112} mode="intro" />
      <NatiaWordmark height={18} className="natia-splash-name" />
    </div>
  );
}
