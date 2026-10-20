// Liste les textes de l'interface qui n'ont pas de traduction anglaise.
// Usage : npm run i18n:check
// Textes repérés : t("…"), tr("…") et msg("…") avec une chaîne entre guillemets doubles.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dictFile = join(root, "i18n", "en.ts");

const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;
const CALL = new RegExp(String.raw`\b(?:t|tr|msg)\(\s*` + STRING, "g");
const ENTRY = new RegExp(String.raw`^\s*` + STRING + String.raw`\s*:`, "gm");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const dict = new Set([...readFileSync(dictFile, "utf8").matchAll(ENTRY)].map((m) => JSON.parse(`"${m[1]}"`)));
const missing = new Map();
let total = 0;

for (const f of files(root)) {
  if (f === dictFile) continue;
  for (const m of readFileSync(f, "utf8").matchAll(CALL)) {
    total++;
    const key = JSON.parse(`"${m[1]}"`);
    if (!dict.has(key)) missing.set(key, relative(root, f));
  }
}

for (const [key, file] of missing) console.log(`${file}\t${JSON.stringify(key)}`);
console.log(`\n${total} textes, ${dict.size} traductions, ${missing.size} manquantes.`);
process.exit(missing.size ? 1 : 0);
