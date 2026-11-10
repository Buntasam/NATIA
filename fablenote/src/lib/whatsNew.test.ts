import { describe, expect, it } from "vitest";
import { RELEASES, compareVersions, releasesBetween } from "./whatsNew";

describe("nouveautés", () => {
  it("compare les versions numériquement", () => {
    expect(compareVersions("6.10.0", "6.9.0")).toBe(1);
    expect(compareVersions("6.3.0", "6.3")).toBe(0);
    expect(compareVersions("6.2.6", "6.3.0")).toBe(-1);
  });
  it("montre les versions sautées, la plus récente d'abord", () => {
    const list = releasesBetween("6.2.6", "6.4.0");
    expect(list.map((r) => r.version)).toEqual(["6.4.0", "6.3.0"]);
  });
  it("rien sans mise à jour, rien pour une version future", () => {
    expect(releasesBetween("6.4.0", "6.4.0")).toEqual([]);
    expect(releasesBetween("6.2.6", "6.3.0").map((r) => r.version)).toEqual(["6.3.0"]);
  });
  it("la liste est rangée de la plus récente à la plus ancienne", () => {
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBe(1);
  });
});
