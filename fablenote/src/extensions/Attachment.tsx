import { Node, mergeAttributes } from "@tiptap/core";
import { locale, tr } from "../i18n";

// Fichier joint dans une note : une pastille « 📎 nom (taille) ». Le fichier lui-même est
// rangé et chiffré côté Rust (src-tauri/src/attachments.rs) ; un clic l'ouvre (Editor.tsx).

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      insertAttachment: (a: { id: string; name: string; size: number }) => ReturnType;
    };
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return tr("{n} o", { n: bytes });
  if (bytes < 1024 * 1024) return tr("{n} Ko", { n: Math.round(bytes / 1024) });
  return tr("{n} Mo", { n: (bytes / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 }) });
}

export const Attachment = Node.create({
  name: "attachment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute("data-attachment-id"), renderHTML: (a) => ({ "data-attachment-id": a.id }) },
      name: { default: "", parseHTML: (el) => el.getAttribute("data-name") ?? "", renderHTML: (a) => ({ "data-name": a.name }) },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute("data-size") ?? 0), renderHTML: (a) => ({ "data-size": String(a.size) }) },
    };
  },

  parseHTML() { return [{ tag: "span[data-attachment-id]" }]; },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "attachment-chip", contenteditable: "false" }, HTMLAttributes),
      `📎 ${node.attrs.name} · ${formatSize(node.attrs.size)}`,
    ];
  },

  renderText({ node }) {
    return `[${node.attrs.name}]`;
  },

  addCommands() {
    return {
      insertAttachment: (a) => ({ commands }) =>
        commands.insertContent([{ type: this.name, attrs: a }, { type: "text", text: " " }]),
    };
  },
});
