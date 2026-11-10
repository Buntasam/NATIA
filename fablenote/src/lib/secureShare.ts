import DOMPurify from "dompurify";
import { tr } from "../i18n";

// Partage sécurisé : la note devient une page HTML autonome, chiffrée (AES-256-GCM, clé
// tirée du mot de passe par PBKDF2-SHA256). Elle s'ouvre dans n'importe quel navigateur,
// sans NATIA ; sans le mot de passe, le fichier ne contient rien de lisible, pas même le titre.

export const SHARE_ITERATIONS = 600_000;
export const MIN_SHARE_PASSWORD = 8;

const enc = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage, iterations = SHARE_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export interface SharePayload { s: string; i: string; c: string; n: number }

/** Chiffre le titre et le contenu (HTML nettoyé). */
export async function encryptNote(title: string, html: string, password: string, iterations = SHARE_ITERATIONS): Promise<SharePayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, "encrypt", iterations);
  const clean = DOMPurify.sanitize(html);
  const data = enc.encode(JSON.stringify({ title, html: clean }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  return { s: toBase64(salt), i: toBase64(iv), c: toBase64(cipher), n: iterations };
}

/** Inverse d'`encryptNote` (même code que la page générée ; sert aux tests). */
export async function decryptNote(p: SharePayload, password: string): Promise<{ title: string; html: string }> {
  const key = await deriveKey(password, fromBase64(p.s), "decrypt", p.n);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(p.i) as BufferSource }, key, fromBase64(p.c) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain));
}

/** Les textes de la page sont figés dans la langue de l'interface au moment du partage. */
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Page HTML autonome qui demande le mot de passe puis affiche la note. */
export async function buildProtectedHtml(title: string, html: string, password: string, lang = "fr"): Promise<string> {
  const payload = await encryptNote(title, html, password);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const L = {
    heading: esc(tr("Note protégée")),
    intro: esc(tr("Cette note a été partagée depuis NATIA. Entrez le mot de passe qu'on vous a donné pour la lire.")),
    password: esc(tr("Mot de passe")),
    open: tr("Ouvrir"),
    wrong: tr("Mot de passe incorrect"),
    opening: tr("Ouverture…"),
  };
  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="robots" content="noindex">
<title>${L.heading}</title>
<style>
:root{color-scheme:light dark;--fg:#111;--bg:#fff;--muted:#666;--line:#ddd;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--bg:#161616;--muted:#999;--line:#333;--accent:#818cf8}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px}
pre{background:rgba(127,127,127,.12);padding:12px;border-radius:8px;overflow:auto}
#gate{max-width:360px;margin:15vh auto;text-align:center}
#gate p{color:var(--muted);font-size:14px}
#gate input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font-size:15px}
#gate button{margin-top:10px;width:100%;padding:10px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-size:15px;cursor:pointer}
#err{color:#dc2626;min-height:1.4em}
</style>
</head>
<body>
<form id="gate">
<h1>${L.heading}</h1>
<p>${L.intro}</p>
<input id="pw" type="password" autocomplete="off" autofocus aria-label="${L.password}" placeholder="${L.password}">
<button id="go" type="submit">${esc(L.open)}</button>
<p id="err" role="alert"></p>
</form>
<main id="note" hidden></main>
<script>
(function () {
  var D = ${json(payload)}, L = ${json({ wrong: L.wrong, open: L.open, opening: L.opening })};
  var b = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var form = document.getElementById("gate"), btn = document.getElementById("go"), err = document.getElementById("err");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    err.textContent = ""; btn.disabled = true; btn.textContent = L.opening;
    try {
      var pw = document.getElementById("pw").value;
      var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
      var key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b(D.s), iterations: D.n, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(D.i) }, key, b(D.c));
      var note = JSON.parse(new TextDecoder().decode(plain));
      var main = document.getElementById("note"), h1 = document.createElement("h1"), body = document.createElement("div");
      h1.textContent = note.title; body.innerHTML = note.html;
      main.appendChild(h1); main.appendChild(body);
      document.title = note.title; form.remove(); main.hidden = false;
    } catch (_) {
      err.textContent = L.wrong; btn.disabled = false; btn.textContent = L.open;
    }
  });
})();
</script>
</body>
</html>
`;
}
