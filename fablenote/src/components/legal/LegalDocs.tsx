import { useState } from "react";
import { useLang } from "../../i18n";
import { Topic } from "../settings/ManualSettings";
import { LEGAL as LEGAL_FR } from "./legalContent";
import { LEGAL_EN } from "./legalContent.en";

/** Conditions d'utilisation et politique de confidentialité, un onglet chacune. */
export default function LegalDocs({ initial = "terms" }: { initial?: "terms" | "privacy" }) {
  const docs = useLang((s) => s.lang) === "en" ? LEGAL_EN : LEGAL_FR;
  const [docId, setDocId] = useState<string>(initial);
  const [open, setOpen] = useState<Set<string>>(() => new Set([`${initial}/0`]));
  const doc = docs.find((d) => d.id === docId) ?? docs[0];

  const toggle = (key: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex gap-1 bg-hover rounded-lg p-0.5 self-start">
        {docs.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === doc.id}
            onClick={() => setDocId(d.id)}
            className={`px-3 py-1.5 rounded-md text-xs transition-colors ${d.id === doc.id ? "bg-panel text-primary font-medium shadow-sm" : "text-muted hover:text-primary"}`}
          >
            {d.title}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {doc.topics.map((topic, i) => {
          const key = `${doc.id}/${i}`;
          return <Topic key={key} topic={topic} open={open.has(key)} onToggle={() => toggle(key)} />;
        })}
      </div>
    </div>
  );
}
