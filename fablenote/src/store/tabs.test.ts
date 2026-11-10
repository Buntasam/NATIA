import { describe, expect, it } from "vitest";
import { withTab } from "./index";

describe("withTab", () => {
  it("ajoute l'onglet juste après la note qu'on quitte", () => {
    expect(withTab(["a", "b", "c"], "x", "a")).toEqual(["a", "x", "b", "c"]);
  });
  it("ajoute à la fin sans note précédente", () => {
    expect(withTab(["a"], "x", null)).toEqual(["a", "x"]);
    expect(withTab(["a"], "x", "inconnue")).toEqual(["a", "x"]);
  });
  it("ne duplique pas un onglet déjà ouvert", () => {
    const tabs = ["a", "b"];
    expect(withTab(tabs, "b", "a")).toBe(tabs);
  });
  it("au-delà du maximum, ferme le plus ancien", () => {
    expect(withTab(["a", "b", "c"], "x", "c", 3)).toEqual(["b", "c", "x"]);
  });
});
