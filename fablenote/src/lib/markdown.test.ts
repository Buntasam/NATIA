import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("titres, listes et mise en forme", () => {
    const html = markdownToHtml("# Titre\n- **un**\n- *deux*\n\n1. premier");
    expect(html).toContain("<h1>Titre</h1>");
    expect(html).toContain("<ul><li><p><strong>un</strong></p></li><li><p><em>deux</em></p></li></ul>");
    expect(html).toContain("<ol><li><p>premier</p></li></ol>");
  });
  it("bloc de code gardé tel quel", () => {
    expect(markdownToHtml("```\n# pas un titre\n```")).toBe("<pre><code># pas un titre</code></pre>");
  });
});
