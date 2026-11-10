import { describe, expect, it } from "vitest";
import { trError, tr, useLang } from "./index";

describe("traductions", () => {
  it("variables remplacées, en français comme en anglais", () => {
    useLang.setState({ lang: "fr" });
    expect(tr("Ajouter le tag {tag}", { tag: "x" })).toBe("Ajouter le tag x");
    useLang.setState({ lang: "en" });
    expect(tr("Ajouter le tag {tag}", { tag: "x" })).toBe("Add tag x");
  });
  it("les erreurs variables du backend sont traduites", () => {
    useLang.setState({ lang: "en" });
    expect(trError("devis.pdf : fichier trop gros (100 Mo maximum)")).toBe("devis.pdf: file too large (100 MB maximum)");
    useLang.setState({ lang: "fr" });
  });
});
