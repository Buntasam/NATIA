import { Globe } from "lucide-react";

const ONLINE_PROVIDERS: Record<string, string> = {
  claude: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google (Gemini)",
  mistral: "Mistral AI",
  claude_cli: "Anthropic (Claude CLI)",
};

/** Nom du service en ligne, ou null pour l'IA locale (Ollama). */
export function onlineProviderLabel(provider: string): string | null {
  return ONLINE_PROVIDERS[provider] ?? null;
}

// Rappel visible au moment d'utiliser l'IA : le chiffrement de NATIA ne protège
// pas le texte envoyé à un fournisseur en ligne.
export default function CloudAiNotice({ service, className = "" }: { service: string | null; className?: string }) {
  if (!service) return null;
  return (
    <p
      className={`flex items-center gap-1.5 text-[10px] text-amber-500/90 leading-snug ${className}`}
      title="Le chiffrement de NATIA protège vos notes sur ce PC, pas le texte envoyé à une IA en ligne. Utilisez Ollama pour que rien ne quitte votre machine."
    >
      <Globe size={10} className="shrink-0" />
      <span>IA en ligne : le texte envoyé (note, sélection, messages) part chez <strong>{service}</strong>.</span>
    </p>
  );
}
