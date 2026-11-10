import { describe, expect, it } from "vitest";
import { htmlToMarkdown, safeFilename } from "./noteExport";

describe("htmlToMarkdown", () => {
  it("cases à cocher et sous-listes", () => {
    const html = '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>Pain</p></div></li>'
      + '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><div><p>Lait</p></div></li></ul>'
      + "<ul><li><p>Un</p><ul><li><p>Sous</p></li></ul></li></ul>";
    expect(htmlToMarkdown(html)).toBe("- [x] Pain\n- [ ] Lait\n\n- Un\n  - Sous");
  });
  it("liens, wikilinks, tableaux", () => {
    expect(htmlToMarkdown('<p>Voir <a href="https://x.fr">le site</a> et <span data-wikilink="true" data-note-title="Projet">Projet</span></p>'))
      .toBe("Voir [le site](https://x.fr) et [[Projet]]");
    expect(htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>"))
      .toBe("| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
  });
  it("images intégrées et fichiers joints passent par les fonctions d'export", () => {
    const html = '<img src="data:image/png;base64,AAAA" alt="schéma"><p><span data-attachment-id="id1" data-name="devis final.pdf">📎</span></p>';
    expect(htmlToMarkdown(html)).toBe("[📎 devis final.pdf]");
    expect(htmlToMarkdown(html, { image: () => "images/1.png", attachment: (_id, name) => `fichiers/${name}` }))
      .toBe("![schéma](images/1.png)\n\n[📎 devis final.pdf](fichiers/devis%20final.pdf)");
  });
  it("blocs de code et citations", () => {
    expect(htmlToMarkdown("<pre><code>let a = 1;\n</code></pre><blockquote><p>Cité</p></blockquote>"))
      .toBe("```\nlet a = 1;\n```\n\n> Cité");
  });
  it("noms de fichiers sans caractères interdits", () => {
    expect(safeFilename('Réunion: "bilan"/2026')).toBe("Réunion bilan2026");
  });
});
