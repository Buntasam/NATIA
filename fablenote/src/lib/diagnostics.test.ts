import { describe, expect, it } from "vitest";
import { redact } from "./diagnostics";

describe("diagnostic", () => {
  it("masque chemins personnels, clés API, e-mails et identifiants", () => {
    const out = redact(
      "Échec : C:\\Users\\Jean.Dupont\\OneDrive\\NATIA-sync introuvable · clé sk-ant-api03-abcdefgh · AIzaSyABCDEFGH · " +
      "contact jean@mail.fr · note 0f8fad5b-d9cb-469f-a165-70867728950e",
    );
    expect(out).not.toMatch(/Jean|Dupont|abcdefgh|SyABCDEFGH|jean@|0f8fad5b/);
    expect(out).toContain("C:\\Users\\…");
    expect(out).toContain("[clé masquée]");
    expect(out).toContain("[e-mail masqué]");
    expect(out).toContain("[id]");
  });
  it("laisse le reste intact", () => {
    expect(redact("NATIA 6.4.0 · Tauri 2.9 · 12 notes")).toBe("NATIA 6.4.0 · Tauri 2.9 · 12 notes");
  });
});
