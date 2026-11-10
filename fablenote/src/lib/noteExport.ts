import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { msg, tr } from "../i18n";

// Export d'une note : Markdown, texte, HTML.

// ─── Conversion utils ─────────────────────────────────────────────────────────

export function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const children = Array.from(el.childNodes).map(nodeToMd).join("");
    switch (el.tagName) {
      case "H1": return `# ${children}\n\n`;
      case "H2": return `## ${children}\n\n`;
      case "H3": return `### ${children}\n\n`;
      case "H4": return `#### ${children}\n\n`;
      case "P": return children ? `${children}\n\n` : "";
      case "STRONG": case "B": return `**${children}**`;
      case "EM": case "I": return `*${children}*`;
      case "U": return `__${children}__`;
      case "CODE": return `\`${children}\``;
      case "PRE": return `\`\`\`\n${children.replace(/`/g, "")}\n\`\`\`\n\n`;
      case "BLOCKQUOTE": return `> ${children.trim()}\n\n`;
      case "UL": return `${children}\n`;
      case "OL": return `${children}\n`;
      case "LI": {
        const parent = el.parentElement?.tagName;
        if (parent === "OL") {
          const idx = Array.from(el.parentElement!.children).indexOf(el) + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case "BR": return "\n";
      case "HR": return "---\n\n";
      case "MARK": return `==${children}==`;
      default: return children;
    }
  }

  return nodeToMd(div).trim();
}

export const EXPORT_FORMATS = {
  md: { name: "Markdown" },
  txt: { name: msg("Texte") },
  html: { name: msg("Page HTML") },
} as const;

/** « Enregistrer sous » puis écriture par le backend (un lien de téléchargement ne marche pas dans Tauri). */
export async function saveExport(content: string, title: string, ext: keyof typeof EXPORT_FORMATS) {
  const path = await save({
    defaultPath: `${safeFilename(title)}.${ext}`,
    filters: [{ name: tr(EXPORT_FORMATS[ext].name), extensions: [ext] }],
  });
  if (!path) return;
  await invoke("write_export_file", { path, content });
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function safeFilename(title: string) {
  return title.replace(/[^a-zA-Z0-9\-_àâäéèêëîïôùûüçœ ]/g, "").trim() || "note";
}
