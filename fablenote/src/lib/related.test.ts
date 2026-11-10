import { describe, expect, it } from "vitest";
import { containsWord, fold, suggestTags } from "./related";

describe("containsWord", () => {
  it("ignore accents et majuscules", () => {
    expect(containsWord(fold("Réunion d'ÉQUIPE lundi"), "équipe")).toBe(true);
  });
  it("ne trouve pas un mot à l'intérieur d'un autre", () => {
    expect(containsWord(fold("les projets avancent"), "projet")).toBe(false);
    expect(containsWord(fold("projet"), "projet")).toBe(true);
  });
  it("ignore les tags trop courts", () => {
    expect(containsWord(fold("un ia ici"), "ia")).toBe(false);
  });
});

describe("suggestTags", () => {
  const notes = [
    { id: "a", tags: ["voyage", "bretagne"] },
    { id: "b", tags: ["voyage"] },
    { id: "c", tags: ["cuisine"] },
  ];

  it("propose les tags des notes proches, les plus proches d'abord", () => {
    const tags = suggestTags("texte sans rapport", [], [{ id: "a", score: 0.9 }, { id: "b", score: 0.5 }], notes);
    expect(tags[0]).toBe("voyage");
    expect(tags).toContain("bretagne");
  });

  it("propose un tag existant dont le nom est dans la note", () => {
    expect(suggestTags("Recette de cuisine du dimanche", [], [], notes)).toEqual(["cuisine"]);
  });

  it("ne repropose jamais un tag déjà mis, quelle que soit la casse", () => {
    const tags = suggestTags("cuisine", ["Cuisine", "VOYAGE"], [{ id: "a", score: 1 }], notes);
    expect(tags).toEqual(["bretagne"]);
  });

  it("écarte les rapprochements trop faibles et limite le nombre", () => {
    expect(suggestTags("", [], [{ id: "c", score: 0.1 }], notes)).toEqual([]);
    expect(suggestTags("voyage bretagne cuisine", [], [], notes, 2)).toHaveLength(2);
  });
});
