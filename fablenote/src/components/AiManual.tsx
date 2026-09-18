import React from "react";
import {
  BookOpen,
  Cloud,
  ExternalLink,
  KeyRound,
  Plug,
  Server,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

// ─── Manuel de configuration IA ───────────────────────────────────────────────
// Composant de contenu réutilisable : affiché à la fois dans
// Paramètres → Manuel et dans une surcouche depuis le Disclaimer.

interface ProviderCardProps {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeClass: string;
  children: React.ReactNode;
}

function ProviderCard({ icon, title, badge, badgeClass, children }: ProviderCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-hover/40 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-accent shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-primary">{title}</span>
        <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span>
      </div>
      <div className="text-xs text-secondary/90 leading-relaxed flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-4 h-4 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="text-accent text-[11px] bg-accent/10 px-1.5 py-0.5 rounded font-mono">{children}</code>
);

const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-0.5 text-accent hover:underline underline-offset-2"
  >
    {children}
    <ExternalLink size={9} />
  </a>
);

export default function AiManual() {
  return (
    <div className="flex flex-col gap-4">
      {/* Intro */}
      <div className="flex flex-col gap-2 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-accent">Comment fonctionne l'IA dans NATIA</span>
        </div>
        <p className="text-xs text-secondary/90 leading-relaxed">
          NATIA ne contient aucune IA embarquée : elle se connecte à un moteur que
          <strong className="text-primary"> tu choisis</strong>. Trois familles au choix :
        </p>
        <ul className="text-xs text-secondary/90 leading-relaxed list-disc list-inside space-y-0.5 pl-1">
          <li><strong className="text-primary">Local (Ollama)</strong> — gratuit, 100 % hors ligne et privé, mais dépend de ton matériel.</li>
          <li><strong className="text-primary">Cloud (clé API)</strong> — Claude, OpenAI, Gemini, Mistral, Groq… rapide et puissant, payant à l'usage.</li>
          <li><strong className="text-primary">Claude CLI</strong> — via ton abonnement Claude, sans clé API.</li>
        </ul>
        <p className="text-xs text-muted leading-relaxed">
          Pour choisir le moteur actif : sélecteur en haut du <strong className="text-primary">panneau IA</strong> (Ctrl+Shift+A),
          ou <strong className="text-primary">Paramètres → Intelligence artificielle → Fournisseur par défaut</strong>.
        </p>
      </div>

      {/* Ollama */}
      <ProviderCard
        icon={<Server size={14} />}
        title="Ollama — IA locale (gratuit)"
        badge="Hors ligne"
        badgeClass="bg-green-500/15 text-green-500"
      >
        <Step n={1}>Installe Ollama depuis <Link href="https://ollama.com/download">ollama.com/download</Link> et lance-le (il tourne en fond).</Step>
        <Step n={2}>Télécharge un modèle : dans un terminal <Code>ollama pull gemma3:1b</Code>, ou directement dans <strong className="text-primary">Paramètres → IA → Ollama → Télécharger un modèle</strong>.</Step>
        <Step n={3}>Dans NATIA, choisis le fournisseur <strong className="text-primary">Ollama</strong>, vérifie l'URL <Code>http://localhost:11434</Code> et sélectionne le modèle.</Step>
        <p className="text-[11px] text-muted pt-1">
          ⚡ Modèles légers conseillés : <Code>gemma3:1b</Code> <Code>phi4-mini</Code> <Code>qwen2.5:1.5b</Code>. Les gros modèles sont très lents sans carte graphique dédiée.
        </p>
      </ProviderCard>

      {/* Cloud APIs */}
      <ProviderCard
        icon={<Cloud size={14} />}
        title="Claude · OpenAI · Gemini · Mistral (clé API)"
        badge="Cloud"
        badgeClass="bg-sky-500/15 text-sky-500"
      >
        <p>Récupère une clé API chez le fournisseur, puis colle-la dans <strong className="text-primary">Paramètres → IA</strong> et choisis un modèle :</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-primary">Claude (Anthropic)</strong> — clé sur <Link href="https://console.anthropic.com/settings/keys">console.anthropic.com</Link> (format <Code>sk-ant-…</Code>).</li>
          <li><strong className="text-primary">OpenAI</strong> — clé sur <Link href="https://platform.openai.com/api-keys">platform.openai.com</Link> (format <Code>sk-…</Code>).</li>
          <li><strong className="text-primary">Gemini (Google)</strong> — clé sur <Link href="https://aistudio.google.com/app/apikey">aistudio.google.com</Link> (format <Code>AIza…</Code>).</li>
          <li><strong className="text-primary">Mistral</strong> — clé sur <Link href="https://console.mistral.ai/api-keys">console.mistral.ai</Link>.</li>
        </ul>
        <p className="text-[11px] text-muted pt-1">
          🔒 Avec un mot de passe activé, les clés sont chiffrées (AES-256-GCM) ; sinon elles sont rangées dans le trousseau de ton OS.
        </p>
      </ProviderCard>

      {/* Claude CLI */}
      <ProviderCard
        icon={<Terminal size={14} />}
        title="Claude CLI — sans clé API"
        badge="Abonnement"
        badgeClass="bg-purple-500/15 text-purple-500"
      >
        <Step n={1}>Installe le CLI : <Code>npm install -g @anthropic-ai/claude-code</Code>.</Step>
        <Step n={2}>Connecte-toi une fois en terminal avec <Code>claude</Code> (utilise ton abonnement Claude, pas de clé).</Step>
        <Step n={3}>Dans NATIA, choisis le fournisseur <strong className="text-primary">Claude CLI</strong> — le bouton « tester » dans <strong className="text-primary">Paramètres → IA → Claude CLI</strong> vérifie que tout est bon.</Step>
      </ProviderCard>

      {/* Connexions personnalisées */}
      <ProviderCard
        icon={<Plug size={14} />}
        title="Connexions personnalisées"
        badge="Avancé"
        badgeClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      >
        <p>
          Pour jongler entre plusieurs clés ou providers, ouvre <strong className="text-primary">Paramètres → IA → Clés API &amp; connexions</strong> et ajoute une connexion :
        </p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-primary">Nom</strong> (ex : « Claude perso »), <strong className="text-primary">fournisseur</strong>, <strong className="text-primary">clé</strong>, <strong className="text-primary">couleur</strong> et <strong className="text-primary">modèle</strong>.</li>
          <li>Providers reconnus : <Code>OpenAI</Code> <Code>Anthropic</Code> <Code>Mistral</Code> <Code>Groq</Code> <Code>Gemini</Code>. Tout endpoint compatible OpenAI passe par « OpenAI / Autre ».</li>
          <li>Chaque connexion apparaît ensuite dans le sélecteur du panneau IA.</li>
        </ul>
      </ProviderCard>

      {/* Astuces */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-hover/40 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-primary">Bon à savoir</span>
        </div>
        <ul className="text-xs text-secondary/90 leading-relaxed list-disc list-inside space-y-1 pl-1">
          <li>Les réponses s'affichent en <strong className="text-primary">streaming</strong> (mot à mot) pour tous les providers.</li>
          <li>En cas d'erreur (clé invalide, modèle absent, Ollama éteint), active le <strong className="text-primary">Mode debug</strong> : panneau IA → onglet Debug pour voir le prompt, la réponse brute et le message d'erreur.</li>
          <li>Tu peux ajuster la <strong className="text-primary">température</strong> et le <strong className="text-primary">nombre de messages de contexte</strong> dans Paramètres → IA.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Surcouche plein écran (utilisée par le Disclaimer) ───────────────────────

export function AiManualOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-panel border border-border rounded-xl w-[640px] max-w-full max-h-[88vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 flex items-center gap-2 border-b border-border shrink-0">
          <BookOpen size={16} className="text-accent" />
          <span className="text-sm font-semibold text-primary">Manuel — configurer l'IA</span>
          <button
            onClick={onClose}
            className="ml-auto text-muted hover:text-primary transition-colors"
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <AiManual />
        </div>
      </div>
    </div>
  );
}
