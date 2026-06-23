import { LayoutTemplate, X } from "lucide-react";
import { useStore } from "../store";

interface Template {
  name: string;
  icon: string;
  content: string;
}

const TEMPLATES: Template[] = [
  {
    name: "Réunion",
    icon: "🗓️",
    content: `<h1>Réunion</h1>
<p><strong>Date :</strong> ${new Date().toLocaleDateString("fr")}</p>
<p><strong>Participants :</strong> </p>
<p><strong>Objectif :</strong> </p>
<h2>Ordre du jour</h2>
<ul><li><p></p></li></ul>
<h2>Notes</h2>
<p></p>
<h2>Décisions prises</h2>
<ul><li><p></p></li></ul>
<h2>Actions à faire</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: "Journal",
    icon: "📔",
    content: `<h1>${new Date().toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
<h2>Humeur du jour</h2>
<p></p>
<h2>Ce que j'ai fait</h2>
<p></p>
<h2>Ce que j'ai appris</h2>
<p></p>
<h2>Demain</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: "To-do list",
    icon: "✅",
    content: `<h1>À faire</h1>
<h2>Urgent</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>
<h2>Important</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>
<h2>Plus tard</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: "Brainstorming",
    icon: "🧠",
    content: `<h1>Brainstorming</h1>
<p><strong>Sujet :</strong> </p>
<h2>Idées</h2>
<ul><li><p></p></li></ul>
<h2>Pour</h2>
<ul><li><p></p></li></ul>
<h2>Contre</h2>
<ul><li><p></p></li></ul>
<h2>Conclusion</h2>
<p></p>`,
  },
  {
    name: "Projet",
    icon: "🚀",
    content: `<h1>Projet</h1>
<p><strong>Objectif :</strong> </p>
<p><strong>Délai :</strong> </p>
<p><strong>Équipe :</strong> </p>
<h2>Description</h2>
<p></p>
<h2>Étapes</h2>
<ul data-type="taskList">
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
</ul>
<h2>Ressources</h2>
<ul><li><p></p></li></ul>
<h2>Risques</h2>
<ul><li><p></p></li></ul>`,
  },
  {
    name: "Article",
    icon: "✍️",
    content: `<h1>Titre de l'article</h1>
<p><em>Introduction — accrocher le lecteur en 1-2 phrases.</em></p>
<h2>Partie 1</h2>
<p></p>
<h2>Partie 2</h2>
<p></p>
<h2>Partie 3</h2>
<p></p>
<h2>Conclusion</h2>
<p></p>`,
  },
  {
    name: "Fiche de lecture",
    icon: "📚",
    content: `<h1>Fiche de lecture</h1>
<p><strong>Titre :</strong> </p>
<p><strong>Auteur :</strong> </p>
<p><strong>Année :</strong> </p>
<h2>Résumé</h2>
<p></p>
<h2>Points clés</h2>
<ul><li><p></p></li></ul>
<h2>Citations</h2>
<blockquote><p></p></blockquote>
<h2>Mon avis</h2>
<p></p>`,
  },
  {
    name: "Note vide",
    icon: "📄",
    content: `<p></p>`,
  },
];

interface Props {
  onClose: () => void;
  onApply: (content: string, title: string) => void;
}

export default function TemplatesPanel({ onClose, onApply }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={18} className="text-accent" />
            <span className="font-semibold text-primary">Templates</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto grid grid-cols-2 gap-3 p-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => onApply(t.content, t.name)}
              className="text-left p-4 rounded-lg border border-border bg-sidebar hover:bg-hover hover:border-accent/40 transition-colors group"
            >
              <div className="text-2xl mb-2">{t.icon}</div>
              <p className="text-sm font-medium text-primary group-hover:text-accent transition-colors">
                {t.name}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
