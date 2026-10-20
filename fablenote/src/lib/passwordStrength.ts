// Estimation simple de la solidité d'un mot de passe ou d'un PIN.
// Ce n'est qu'un indicateur : il ne bloque rien au-delà des règles minimales.

import { msg } from "../i18n";

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

const COMMON = [
  "password", "motdepasse", "azerty", "qwerty", "123456", "soleil", "bonjour",
  "admin", "natia", "loulou", "doudou", "chouchou", "marseille", "football",
  "iloveyou", "jetaime", "princesse", "nicolas", "camille", "abc123",
];

const LABELS = [msg("Très faible"), msg("Faible"), msg("Moyen"), msg("Bon"), msg("Excellent")];

function isSequence(s: string): boolean {
  if (s.length < 3) return false;
  const codes = [...s].map((c) => c.charCodeAt(0));
  const step = codes[1] - codes[0];
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
}

function result(score: number, hint: string): Strength {
  const s = Math.max(0, Math.min(4, score)) as Strength["score"];
  return { score: s, label: LABELS[s], hint };
}

export function passwordStrength(pw: string, type: "pin" | "alpha"): Strength {
  if (!pw) return result(0, "");

  if (type === "pin") {
    if (/^(\d)\1+$/.test(pw) || isSequence(pw)) return result(0, msg("Évitez les chiffres répétés ou qui se suivent."));
    if (/^(19|20)\d{2}$/.test(pw)) return result(0, msg("Une année se devine facilement."));
    if (pw.length < 6) return result(1, msg("Un PIN de 6 à 8 chiffres est plus sûr."));
    // Même à 8 chiffres, un PIN ne dépasse pas « Moyen ».
    return result(2, msg("Un mot de passe reste plus sûr qu'un PIN."));
  }

  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) return result(0, msg("Mot de passe trop courant."));
  if (/^(.)\1+$/.test(pw) || isSequence(lower)) return result(0, msg("Évitez les caractères répétés ou qui se suivent."));

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  // Les caractères répétés comptent moins.
  const unique = new Set(pw).size;
  const effectiveLen = Math.min(pw.length, unique + (pw.length - unique) / 2);
  const bits = effectiveLen * Math.log2(Math.max(pool, 10));

  const hint =
    pw.length < 12 ? msg("Visez au moins 12 caractères, ou une phrase de plusieurs mots.")
    : pool < 40 ? msg("Mélangez lettres, chiffres ou symboles.")
    : "";
  if (bits < 36) return result(1, hint);
  if (bits < 55) return result(2, hint);
  if (bits < 75) return result(3, hint);
  return result(4, "");
}
