import { describe, expect, it } from "vitest";
import { fileName, frontMatter, noteEntries, uniqueName } from "./markdownExport";

const note = (over: Partial<Parameters<typeof noteEntries>[0]>) => ({
  id: "n1", title: "Budget", folder: null, tags: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
  content: "<p>texte</p>", ...over,
});

describe("export Markdown", () => {
  it("noms de fichiers autorisés et uniques", () => {
    expect(fileName('Réunion: "bilan" / 2026.', "x")).toBe("Réunion_ _bilan_ _ 2026");
    expect(fileName("   ", "Sans titre")).toBe("Sans titre");
    const used = new Set<string>();
    expect(uniqueName("Budget", ".md", used)).toBe("Budget.md");
    expect(uniqueName("budget", ".md", used)).toBe("budget (2).md");
  });
  it("en-tête YAML avec les tags", () => {
    expect(frontMatter({ tags: ["perso", "a b"], created_at: "c", updated_at: "u" }))
      .toBe('---\ntags: ["perso", "a b"]\ncreated: c\nupdated: u\n---\n');
  });
  it("une note, ses images et ses fichiers, dans son dossier", () => {
    const used = new Map<string, Set<string>>();
    const entries = noteEntries(note({
      folder: "Travail/Projets",
      content: '<p>Voir</p><img src="data:image/jpeg;base64,QUJD"><p><span data-attachment-id="a1" data-name="devis.pdf">📎</span></p>',
    }), used, "Sans titre");
    expect(entries.map((e) => e.path)).toEqual([
      "Travail/Projets/Budget.md",
      "Travail/Projets/_images/Budget-1.jpg",
      "Travail/Projets/_fichiers/devis.pdf",
    ]);
    expect(entries[0].text).toContain("![](_images/Budget-1.jpg)");
    expect(entries[0].text).toContain("[📎 devis.pdf](_fichiers/devis.pdf)");
    expect(entries[1].base64).toBe("QUJD");
    expect(entries[2].attachment_id).toBe("a1");
    // Deux notes du même titre dans le même dossier ne s'écrasent pas.
    expect(noteEntries(note({ id: "n2", folder: "Travail/Projets" }), used, "Sans titre")[0].path).toBe("Travail/Projets/Budget (2).md");
  });
});
