import { describe, expect, it } from "vitest";
import { buildTree } from "./noteTree";

const note = (id: string, title: string, folder: string | null) => ({ id, title, folder, tags: [], created_at: "t", updated_at: "t" });

describe("buildTree", () => {
  it("range les notes dans leurs dossiers, y compris les dossiers vides", () => {
    const { root, rootNotes } = buildTree(
      [note("a", "Racine", null), note("b", "Projet", "Travail/Projets"), note("c", "Recette", "Perso")],
      ["Archives", "Travail"],
      "",
    );
    expect(rootNotes.map((n) => n.id)).toEqual(["a"]);
    expect(root.children.map((c) => c.name)).toEqual(["Archives", "Perso", "Travail"]);
    const travail = root.children.find((c) => c.name === "Travail")!;
    expect(travail.children[0].path).toBe("Travail/Projets");
    expect(travail.children[0].notes[0].id).toBe("b");
  });
  it("filtre par titre sans tenir compte des majuscules", () => {
    const { root, rootNotes } = buildTree([note("a", "Budget", null), note("b", "Courses", "Perso")], [], "BUD");
    expect(rootNotes).toHaveLength(1);
    expect(root.children[0]?.notes ?? []).toHaveLength(0);
  });
});
