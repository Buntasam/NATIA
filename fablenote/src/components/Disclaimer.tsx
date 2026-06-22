import React, { useState } from "react";
import { AlertTriangle, Bug, Copy, Lightbulb, Mail, Terminal } from "lucide-react";

const KEY = "natia_disclaimer_v1";
const CONTACT_EMAIL = "email@test.fr";

const REPORT_TEMPLATE = (date: string) =>
`À : ${CONTACT_EMAIL}
Objet : [NATIA bêta] — Rapport du ${date}

Type : [ ] Bug  [ ] Idée  [ ] Autre

Description :


Étapes pour reproduire (si bug) :
1.
2.

Comportement attendu :

Comportement observé :

---
Merci pour ton retour !`;

const ASCII_WAVE = [
  "|     .-.",
  "|    /   \\         .-.",
  "|   /     \\       /   \\       .-.     .-.     _   _",
  "+--/-------\\-----/-----\\-----/---\\---/---\\---/-\\-/-\\/\\/---",
  "| /         \\   /       \\   /     '-'     '-'",
  "|/           '-'         '-'",
].join("\n");


export default function Disclaimer() {
  const [dontShow, setDontShow] = useState(false);
  const [visible] = useState(() => !localStorage.getItem(KEY));
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const date = new Date().toLocaleDateString("fr-FR");
  const template = REPORT_TEMPLATE(date);

  if (!visible || closed) return null;

  const close = () => {
    if (dontShow) localStorage.setItem(KEY, "1");
    setClosed(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(template).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(CONTACT_EMAIL).catch(() => {});
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl w-[780px] max-h-[90vh] overflow-hidden shadow-2xl flex">

        {/* ── Colonne gauche : disclaimer ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-start gap-4 shrink-0">
            <div className="w-11 h-11 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={22} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary leading-snug">Application en développement</h2>
              <p className="text-xs text-muted mt-0.5">NATIA · Version bêta — à usage personnel uniquement</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-2 flex flex-col gap-3 text-sm text-secondary leading-relaxed">
            <p>
              <strong className="text-primary">Avertissement :</strong> NATIA est une application en cours de développement actif. Elle peut contenir des bugs, des fonctionnalités incomplètes ou des comportements inattendus.
            </p>
            <p>
              Les fonctionnalités d'intelligence artificielle sont <strong className="text-primary">expérimentales</strong>. Les résultats (tri automatique, suggestions, corrections) peuvent être incorrects — vérifiez toujours les actions proposées avant de les appliquer.
            </p>
            <p>
              Vos notes sont stockées <strong className="text-primary">localement</strong> sur votre machine. Il est fortement recommandé de sauvegarder régulièrement vos données. L'auteur ne saurait être tenu responsable d'une perte de données.
            </p>
            <p>
              Les clés API enregistrées sont stockées en clair dans la base de données locale. Ne partagez pas cette base de données avec des tiers.
            </p>
            <p>
              L'utilisation <strong className="text-primary">hors ligne</strong> (via Ollama) requiert un ordinateur performant avec suffisamment de RAM et, idéalement, une carte graphique dédiée — les performances peuvent être très dégradées sur du matériel standard. Il est <strong className="text-primary">fortement recommandé</strong> de configurer une clé API (Google Gemini, OpenAI, etc.) dans les paramètres pour une expérience optimale.
            </p>
            <p className="text-xs text-muted border-t border-border pt-3">
              En continuant, vous acceptez que cette application est fournie « en l'état » (as-is), sans garantie d'aucune sorte. L'auteur décline toute responsabilité pour tout dommage résultant de son utilisation.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-5 flex flex-col gap-3 mt-auto shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-secondary">Ne plus afficher ce message au démarrage</span>
            </label>
            <button
              onClick={close}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              J'ai compris — Continuer
            </button>
          </div>
        </div>

        {/* ── Colonne droite : section dev/testeurs ──────────────────────────── */}
        <div className="w-[280px] shrink-0 border-l border-border bg-black/30 flex flex-col overflow-y-auto">
          {/* Header dev */}
          <div className="px-4 pt-5 pb-3 flex items-center gap-2 border-b border-border/50">
            <Terminal size={14} className="text-accent" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">Pour les testeurs</span>
          </div>

          {/* ASCII art */}
          <div className="px-3 py-4 border-b border-border/50">
            <pre className="text-[8px] leading-[1.35] text-black dark:text-white/80 font-mono overflow-x-auto whitespace-pre select-none">
              {ASCII_WAVE}
            </pre>
          </div>

          {/* Content */}
          <div className="px-4 py-4 flex flex-col gap-3 text-xs text-secondary/80 leading-relaxed flex-1">
            <p>
              Tu utilises une version <strong className="text-primary">bêta de NATIA</strong>. Envoie tes retours par email :
            </p>

            {/* Email address */}
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-hover border border-border">
              <Mail size={11} className="text-accent shrink-0" />
              <span className="text-xs text-primary font-mono flex-1 truncate">{CONTACT_EMAIL}</span>
              <button
                onClick={handleCopyEmail}
                title="Copier l'adresse"
                className="text-muted hover:text-primary transition-colors shrink-0"
              >
                {copiedEmail ? <span className="text-[10px] text-accent">✓</span> : <Copy size={10} />}
              </button>
            </div>

            {/* Template preview */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Bug size={10} className="text-red-400" />
                <Lightbulb size={10} className="text-amber-400" />
                <span className="text-[10px] text-muted">Modèle de rapport</span>
              </div>
              <pre className="text-[9px] leading-[1.5] font-mono text-secondary/70 bg-black/20 border border-border/50 rounded-lg px-2.5 py-2 whitespace-pre-wrap overflow-hidden">
                {template}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border bg-hover hover:bg-active text-xs text-secondary hover:text-primary transition-colors"
              >
                <Copy size={10} />
                {copied ? "Copié !" : "Copier"}
              </button>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[NATIA bêta] Rapport")}&body=${encodeURIComponent(template)}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/20 text-xs text-accent transition-colors"
              >
                <Mail size={10} />
                Envoyer
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
