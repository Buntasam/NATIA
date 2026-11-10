import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { msg, tr } from "../i18n";

// Export d'une note : Markdown, texte, HTML.

export interface MarkdownOptions {
  /** Image intégrée (data:…) : renvoie le chemin du fichier où elle a été mise, ou null pour l'omettre. */
  image?: (src: string, alt: string) => string | null;
  /** Fichier joint (pastille 📎) : renvoie le chemin du fichier exporté, ou null. */
  attachment?: (id: string, name: string) => string | null;
}

const quote = (text: string) => text.trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";

/** Note TipTap → Markdown (listes, cases à cocher, tableaux, liens, images, [[wikilinks]]). */
export function htmlToMarkdown(html: string, opts: MarkdownOptions = {}): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  /** Élément de liste : la suite d'un élément sur plusieurs lignes (sous-liste) est décalée. */
  const listItem = (prefix: string, body: string) => {
    // Les paragraphes dans un élément ne séparent pas ses lignes par des lignes vides.
    const lines = body.trim().split("\n").filter((l) => l.trim() !== "");
    const rest = lines.slice(1).map((l) => (l ? `  ${l}` : l));
    return [prefix + lines[0], ...rest].join("\n") + "\n";
  };

  const cell = (el: Element) =>
    Array.from(el.childNodes).map(nodeToMd).join("").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (el.hasAttribute("data-attachment-id")) {
      const name = el.getAttribute("data-name") ?? "";
      const path = opts.attachment?.(el.getAttribute("data-attachment-id")!, name);
      return path ? `[📎 ${name}](${encodeURI(path)})` : `[📎 ${name}]`;
    }
    if (el.hasAttribute("data-wikilink")) return `[[${el.getAttribute("data-note-title") || el.textContent}]]`;
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
      case "S": case "DEL": return `~~${children}~~`;
      case "CODE": return el.parentElement?.tagName === "PRE" ? children : `\`${children}\``;
      case "PRE": return "```\n" + children.replace(/\n$/, "") + "\n```\n\n";
      case "BLOCKQUOTE": return quote(children);
      case "UL": case "OL": return el.parentElement?.tagName === "LI" ? `\n${children}` : `${children}\n`;
      case "LI": {
        if (el.getAttribute("data-type") === "taskItem") {
          return listItem(el.getAttribute("data-checked") === "true" ? "- [x] " : "- [ ] ", children);
        }
        if (el.parentElement?.tagName === "OL") {
          const idx = Array.from(el.parentElement.children).indexOf(el) + 1;
          return listItem(`${idx}. `, children);
        }
        return listItem("- ", children);
      }
      case "INPUT": case "LABEL": return "";
      case "A": {
        const href = el.getAttribute("href") ?? "";
        return href ? `[${children}](${href})` : children;
      }
      case "IMG": {
        const src = el.getAttribute("src") ?? "";
        const alt = el.getAttribute("alt") ?? "";
        if (src.startsWith("data:")) {
          const path = opts.image?.(src, alt);
          return path ? `![${alt}](${encodeURI(path)})\n\n` : "";
        }
        return src ? `![${alt}](${src})\n\n` : "";
      }
      case "TABLE": {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map(cell));
        if (rows.length === 0) return "";
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
        return [line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n") + "\n\n";
      }
      case "BR": return "\n";
      case "HR": return "---\n\n";
      case "MARK": return `==${children}==`;
      // Post-it : une citation, pour qu'il reste visible.
      case "DIV": return el.getAttribute("data-type") === "postit" ? quote(children) : children;
      default: return children;
    }
  }

  return nodeToMd(div).replace(/\n{3,}/g, "\n\n").trim();
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
