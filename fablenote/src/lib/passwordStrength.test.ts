import { describe, expect, it } from "vitest";
import { passwordStrength } from "./passwordStrength";

describe("passwordStrength", () => {
  it("PIN : séquences, répétitions et années sont très faibles", () => {
    for (const pin of ["123456", "111111", "654321", "1987"]) expect(passwordStrength(pin, "pin").score).toBe(0);
  });
  it("un PIN ne dépasse jamais « Moyen »", () => {
    expect(passwordStrength("73914826", "pin").score).toBe(2);
  });
  it("mots de passe courants refusés, phrases longues bien notées", () => {
    expect(passwordStrength("MonPassword2024", "alpha").score).toBe(0);
    expect(passwordStrength("cheval-Agrafe-batterie-77", "alpha").score).toBeGreaterThanOrEqual(3);
  });
});
