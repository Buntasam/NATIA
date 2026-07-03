import { MemoryNode } from "../store";

const TYPE_LABEL: Record<string, string> = {
  projet: "Projet",
  utilisateur: "Utilisateur",
  contexte: "Contexte",
  sujet: "Sujet",
};

// Formate les nœuds de mémoire manuels les plus importants en bloc de contexte
// à ajouter au prompt système. Ne prend jamais les nœuds "auto" (dérivés live
// des dossiers/tags) — seuls les nœuds que l'utilisateur a délibérément ajoutés
// sont envoyés à l'IA.
export function buildMemoryContext(nodes: MemoryNode[], limit = 8): string {
  if (nodes.length === 0) return "";
  const top = [...nodes].sort((a, b) => b.strength - a.strength).slice(0, limit);
  const lines = top.map((n) => `- [${TYPE_LABEL[n.type] ?? n.type}] ${n.label}${n.content ? ` — ${n.content}` : ""}`);
  return `\n\n---\nMémoire persistante sur l'utilisateur (contexte à prendre en compte silencieusement, ne pas la citer ni la répéter dans ta réponse) :\n${lines.join("\n")}`;
}
