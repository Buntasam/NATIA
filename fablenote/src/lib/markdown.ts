// ─── Markdown → HTML (léger, sans dépendance) ────────────────────────────────

export function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/__(.*?)__/g, "<u>$1</u>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      result.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      i++;
      continue;
    }

    if (line.startsWith("# ")) { result.push(`<h1>${inlineMd(line.slice(2))}</h1>`); i++; continue; }
    if (line.startsWith("## ")) { result.push(`<h2>${inlineMd(line.slice(3))}</h2>`); i++; continue; }
    if (line.startsWith("### ")) { result.push(`<h3>${inlineMd(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith("#### ")) { result.push(`<h4>${inlineMd(line.slice(5))}</h4>`); i++; continue; }
    if (line.startsWith("---")) { result.push("<hr>"); i++; continue; }

    if (line.startsWith("> ")) {
      result.push(`<blockquote><p>${inlineMd(line.slice(2))}</p></blockquote>`);
      i++;
      continue;
    }

    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(`<li><p>${inlineMd(lines[i].slice(2))}</p></li>`);
        i++;
      }
      result.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(`<li><p>${inlineMd(lines[i].replace(/^\d+\. /, ""))}</p></li>`);
        i++;
      }
      result.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    result.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }

  return result.join("");
}
