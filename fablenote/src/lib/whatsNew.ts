import { msg } from "../i18n";

// Nouveautés montrées une fois après une mise à jour (WhatsNew.tsx), et depuis la palette.
// Ajouter une entrée à chaque version, en tête de liste. Textes en français, traduits
// à l'affichage (src/i18n/en.ts).

export interface Release { version: string; items: string[] }

/** Version installée avant la dernière mise à jour (écrite par UpdatePrompt). */
export const UPDATED_FROM_KEY = "natia_updated_from";

export const RELEASES: Release[] = [
  {
    version: "6.4.0",
    items: [
      msg("Note du jour (Ctrl+D) : une note datée, rangée dans le dossier « Journal »."),
      msg("Vue Tâches : toutes les cases à cocher de toutes vos notes ; créez une tâche directement depuis la vue."),
      msg("« Demander à mes notes » lit aussi le texte des PDF joints."),
      msg("Conflits de synchronisation : liste des copies, comparaison côte à côte, garder l'une ou l'autre."),
      msg("Démarrage plus rapide : les panneaux lourds se chargent à l'ouverture."),
    ],
  },
  {
    version: "6.3.0",
    items: [
      msg("Onglets des notes ouvertes : Ctrl+Tab, Ctrl+W, glisser pour réordonner."),
      msg("Notes liées et tags suggérés."),
      msg("Glisser-déposer de fichiers dans une note, recherche dans les PDF joints."),
      msg("Partage d'une note protégée par mot de passe."),
      msg("Indicateur de synchronisation, palette de commandes enrichie, mode focus plein écran (F11)."),
    ],
  },
];

/** -1, 0 ou 1 : compare deux versions « 6.3.0 ». */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Versions publiées après `seen` et jusqu'à `current` (incluse), la plus récente d'abord. */
export function releasesBetween(seen: string, current: string, releases = RELEASES): Release[] {
  return releases.filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}
