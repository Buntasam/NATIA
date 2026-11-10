import { describe, expect, it } from "vitest";
import { buildProtectedHtml, decryptNote, encryptNote, fromBase64, toBase64 } from "./secureShare";

// Peu d'itérations : le chiffrement est le même, le test reste rapide.
const FAST = 1000;

describe("partage sécurisé", () => {
  it("base64 aller-retour, y compris sur de gros volumes", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("se déchiffre avec le bon mot de passe", async () => {
    const p = await encryptNote("Budget 2026", "<p>Loyer : 900 €</p>", "correct horse", FAST);
    expect(await decryptNote(p, "correct horse")).toEqual({ title: "Budget 2026", html: "<p>Loyer : 900 €</p>" });
  });

  it("refuse un mauvais mot de passe", async () => {
    const p = await encryptNote("Secret", "<p>x</p>", "bon mot de passe", FAST);
    await expect(decryptNote(p, "mauvais")).rejects.toBeTruthy();
  });

  it("chaque partage a son propre sel et son propre IV", async () => {
    const a = await encryptNote("t", "<p>x</p>", "pw123456", FAST);
    const b = await encryptNote("t", "<p>x</p>", "pw123456", FAST);
    expect(a.s).not.toBe(b.s);
    expect(a.i).not.toBe(b.i);
  });

  it("retire les scripts du contenu partagé", async () => {
    const p = await encryptNote("t", '<p>ok</p><img src="x" onerror="alert(1)"><script>alert(2)</script>', "pw123456", FAST);
    const { html } = await decryptNote(p, "pw123456");
    expect(html).not.toMatch(/onerror|<script/);
  });

  it("la page générée ne contient ni le titre ni le texte en clair", async () => {
    const page = await buildProtectedHtml("Projet confidentiel", "<p>code d'accès 4242</p>", "pw123456");
    expect(page).not.toContain("Projet confidentiel");
    expect(page).not.toContain("4242");
    expect(page).toContain("Content-Security-Policy");
    expect(page).toContain('"n":600000');
  }, 30_000);
});
