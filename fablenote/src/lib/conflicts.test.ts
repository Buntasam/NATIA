import { describe, expect, it } from "vitest";
import { findConflicts, parseConflictTitle } from "./conflicts";

const note = (id: string, title: string, folder: string | null = null) =>
  ({ id, title, folder, tags: [], created_at: "t", updated_at: "t" });

describe("conflits de synchronisation", () => {
  it("lit le titre d'une copie, même si le titre contient des parenthèses", () => {
    expect(parseConflictTitle("Budget (2026) (conflit PC-BUREAU 10/11 14:32)"))
      .toEqual({ base: "Budget (2026)", origin: "PC-BUREAU", when: "10/11 14:32" });
    expect(parseConflictTitle("autre PC (conflit)")).toBeNull();
    expect(parseConflictTitle("Courses")).toBeNull();
  });
  it("retrouve l'original, de préférence dans le même dossier", () => {
    const list = findConflicts([
      note("a", "Courses", "Perso"),
      note("b", "Courses", "Travail"),
      note("c", "Courses (conflit autre PC 01/02 09:00)", "Travail"),
      note("d", "Orphelin (conflit autre PC 01/02 09:00)"),
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].original?.id).toBe("b");
    expect(list[1].original).toBeNull();
  });
});
