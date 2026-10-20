import { LayoutTemplate, X } from "lucide-react";
import { locale, tr, useLang, useT } from "../i18n";

interface Template {
  name: string;
  icon: string;
  content: string;
}

function buildTemplates(): Template[] {
  const T = (s: string) => tr(s);
  return [
  {
    name: T("Réunion"),
    icon: "🗓️",
    content: `<h1>${T("Réunion")}</h1>
<p><strong>${T("Date :")}</strong> ${new Date().toLocaleDateString(locale())}</p>
<p><strong>${T("Participants :")}</strong> </p>
<p><strong>${T("Objectif :")}</strong> </p>
<h2>${T("Ordre du jour")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Notes")}</h2>
<p></p>
<h2>${T("Décisions prises")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Actions à faire")}</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: T("Journal"),
    icon: "📔",
    content: `<h1>${new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
<h2>${T("Humeur du jour")}</h2>
<p></p>
<h2>${T("Ce que j'ai fait")}</h2>
<p></p>
<h2>${T("Ce que j'ai appris")}</h2>
<p></p>
<h2>${T("Demain")}</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: T("To-do list"),
    icon: "✅",
    content: `<h1>${T("À faire")}</h1>
<h2>${T("Urgent")}</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>
<h2>${T("Important")}</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>
<h2>${T("Plus tard")}</h2>
<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>`,
  },
  {
    name: T("Brainstorming"),
    icon: "🧠",
    content: `<h1>${T("Brainstorming")}</h1>
<p><strong>${T("Sujet :")}</strong> </p>
<h2>${T("Idées")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Pour")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Contre")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Conclusion")}</h2>
<p></p>`,
  },
  {
    name: T("Projet"),
    icon: "🚀",
    content: `<h1>${T("Projet")}</h1>
<p><strong>${T("Objectif :")}</strong> </p>
<p><strong>${T("Délai :")}</strong> </p>
<p><strong>${T("Équipe :")}</strong> </p>
<h2>${T("Description")}</h2>
<p></p>
<h2>${T("Étapes")}</h2>
<ul data-type="taskList">
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
<li data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li>
</ul>
<h2>${T("Ressources")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Risques")}</h2>
<ul><li><p></p></li></ul>`,
  },
  {
    name: T("Article"),
    icon: "✍️",
    content: `<h1>${T("Titre de l'article")}</h1>
<p><em>${T("Introduction — accrocher le lecteur en 1-2 phrases.")}</em></p>
<h2>${T("Partie 1")}</h2>
<p></p>
<h2>${T("Partie 2")}</h2>
<p></p>
<h2>${T("Partie 3")}</h2>
<p></p>
<h2>${T("Conclusion")}</h2>
<p></p>`,
  },
  {
    name: T("Fiche de lecture"),
    icon: "📚",
    content: `<h1>${T("Fiche de lecture")}</h1>
<p><strong>${T("Titre :")}</strong> </p>
<p><strong>${T("Auteur :")}</strong> </p>
<p><strong>${T("Année :")}</strong> </p>
<h2>${T("Résumé")}</h2>
<p></p>
<h2>${T("Points clés")}</h2>
<ul><li><p></p></li></ul>
<h2>${T("Citations")}</h2>
<blockquote><p></p></blockquote>
<h2>${T("Mon avis")}</h2>
<p></p>`,
  },
  {
    name: T("Note vide"),
    icon: "📄",
    content: `<p></p>`,
  },
  ];
}

interface Props {
  onClose: () => void;
  onApply: (content: string, title: string) => void;
}

export default function TemplatesPanel({ onClose, onApply }: Props) {
  const t = useT();
  useLang((s) => s.lang); // reconstruit les modèles quand la langue change
  const templates = buildTemplates();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={18} className="text-accent" />
            <span className="font-semibold text-primary">{t("Modèles")}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Fermer")}
            className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto grid grid-cols-2 gap-3 p-4">
          {templates.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => onApply(tpl.content, tpl.name)}
              className="text-left p-4 rounded-lg border border-border bg-sidebar hover:bg-hover hover:border-accent/40 transition-colors group"
            >
              <div className="text-2xl mb-2">{tpl.icon}</div>
              <p className="text-sm font-medium text-primary group-hover:text-accent transition-colors">
                {tpl.name}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
