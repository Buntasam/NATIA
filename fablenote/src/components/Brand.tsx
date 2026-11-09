import { useId } from "react";

// Logos NATIA, en couleur du texte (currentColor) : noirs en thème clair, blancs en
// thème sombre, sans fichier à choisir. Sources : fablenote/brand/*.svg.
// Chaque logo a son propre id de masque (useId) : plusieurs peuvent cohabiter dans la page.

type Props = { size?: number; className?: string; title?: string };

/** Anneau ouvert + « Ai » + satellite : le symbole seul. */
export function NatiaSymbol({ size = 32, className, title = "NATIA" }: Props) {
  const m = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label={title}>
      <defs>
        <mask id={m} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#fff" />
          <circle cx="91.1" cy="28.9" r="13" fill="#000" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="6" mask={`url(#${m})`} />
      <path d="M40,80 V40 L66,80" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82,40 V80" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="91.1" cy="28.9" r="7" fill="currentColor" />
    </svg>
  );
}

/** Le nom « NATIA » seul. `height` fixe la taille, la largeur suit. */
export function NatiaWordmark({ height = 16, className, title = "NATIA" }: Omit<Props, "size"> & { height?: number }) {
  return (
    <svg height={height} width={(height * 198) / 52} viewBox="0 0 198 52" className={className} role="img" aria-label={title}>
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6,46 V6 L36,46 V6" />
        <path d="M51,46 L68,6 L85,46" />
        <circle cx="68" cy="33" r="4.2" fill="currentColor" stroke="none" />
        <path d="M98,6 H128 M113,6 V46" />
        <path d="M143,6 V46" />
        <path d="M158,46 L175,6 L192,46" />
        <circle cx="175" cy="33" r="4.2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** Symbole + nom, côte à côte. */
export function NatiaLockup({ height = 28, className, title = "NATIA" }: Omit<Props, "size"> & { height?: number }) {
  const m = useId();
  return (
    <svg height={height} width={(height * 334) / 120} viewBox="0 0 334 120" className={className} role="img" aria-label={title}>
      <defs>
        <mask id={m} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#fff" />
          <circle cx="91.1" cy="28.9" r="13" fill="#000" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="6" mask={`url(#${m})`} />
      <path d="M40,80 V40 L66,80" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82,40 V80" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="91.1" cy="28.9" r="7" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M140,80 V40 L170,80 V40" />
        <path d="M185,80 L202,40 L219,80" />
        <circle cx="202" cy="67" r="4.2" fill="currentColor" stroke="none" />
        <path d="M232,40 H262 M247,40 V80" />
        <path d="M277,40 V80" />
        <path d="M292,80 L309,40 L326,80" />
        <circle cx="309" cy="67" r="4.2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/**
 * Symbole animé : l'anneau se trace, le satellite fait le tour et vient se poser
 * (`intro`, joué une fois au démarrage) ou tourne en continu (`loader`).
 * Animations dans index.css (classes natia-*), coupées si « réduire les animations » est actif.
 */
export function NatiaAnimated({ size = 96, mode = "intro", className, title = "NATIA" }: Props & { mode?: "intro" | "loader" }) {
  const m = useId();
  const intro = mode === "intro";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={`${intro ? "natia-intro" : "natia-loader"} ${className ?? ""}`} role="img" aria-label={title}>
      <defs>
        <mask id={m} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#fff" />
          <g className="natia-sat"><circle cx="104" cy="60" r="13" fill="#000" /></g>
        </mask>
      </defs>
      <g mask={`url(#${m})`}>
        <circle className="natia-orbit" cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="6" pathLength={100} transform="rotate(-45 60 60)" />
      </g>
      <path className="natia-a" d="M40,80 V40 L66,80" pathLength={100} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path className="natia-i" d="M82,40 V80" pathLength={100} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <g className="natia-sat"><circle className="natia-dot" cx="104" cy="60" r="7" fill="currentColor" /></g>
    </svg>
  );
}
