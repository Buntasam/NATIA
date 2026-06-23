import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { Bell, BellOff, Trash2 } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reminder: {
      insertReminder: (attrs?: { dueDate?: string; done?: boolean }) => ReturnType;
    };
  }
}

function formatDue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "maintenant";
  if (diff < 0) {
    if (abs < 3_600_000) return `il y a ${Math.floor(abs / 60_000)} min`;
    if (abs < 86_400_000) return `il y a ${Math.floor(abs / 3_600_000)} h`;
    return `il y a ${Math.floor(abs / 86_400_000)} j`;
  }
  if (diff < 3_600_000) return `dans ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `dans ${Math.floor(diff / 3_600_000)} h`;
  return d.toLocaleDateString("fr", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ReminderView({
  node,
  updateAttributes,
  deleteNode,
}: {
  node: { attrs: Record<string, unknown> };
  updateAttributes: (a: Record<string, unknown>) => void;
  deleteNode: () => void;
}) {
  const dueDate = node.attrs.dueDate as string;
  const done = node.attrs.done as boolean;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dueDate);

  const isPast = dueDate && new Date(dueDate) < new Date() && !done;

  return (
    <NodeViewWrapper>
      <div
        className={`reminder-block ${done ? "reminder-done" : ""} ${isPast ? "reminder-past" : ""}`}
        contentEditable={false}
      >
        <div className="reminder-icon">
          {done ? <BellOff size={14} /> : <Bell size={14} />}
        </div>
        <div className="reminder-body">
          <NodeViewContent className="reminder-text" />
          {editing ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="datetime-local"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none"
              />
              <button
                onClick={() => { updateAttributes({ dueDate: draft }); setEditing(false); }}
                className="text-xs text-accent hover:underline"
              >
                OK
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-muted hover:text-primary"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setDraft(dueDate); setEditing(true); }}
              className={`reminder-date ${isPast ? "text-red-500" : "text-muted"} hover:underline`}
            >
              {dueDate ? formatDue(dueDate) : "+ Ajouter une date"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={() => updateAttributes({ done: !done })}
            title={done ? "Marquer comme en attente" : "Marquer comme fait"}
            className={`p-1 rounded transition-colors ${done ? "text-green-500" : "text-muted hover:text-primary"}`}
          >
            <span className="text-base">{done ? "✓" : "○"}</span>
          </button>
          <button
            onClick={deleteNode}
            className="p-1 rounded text-muted hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Reminder = Node.create({
  name: "reminder",
  group: "block",
  content: "inline*",
  marks: "",

  addAttributes() {
    return {
      dueDate: { default: "", parseHTML: (el) => el.getAttribute("data-due") ?? "", renderHTML: (a) => ({ "data-due": a.dueDate }) },
      done: { default: false, parseHTML: (el) => el.getAttribute("data-done") === "true", renderHTML: (a) => ({ "data-done": String(a.done) }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="reminder"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "reminder" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReminderView);
  },

  addCommands() {
    return {
      insertReminder:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: "reminder",
            attrs: { dueDate: "", done: false, ...attrs },
            content: [{ type: "text", text: "Rappel" }],
          }),
    };
  },
});
