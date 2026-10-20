// Prompts envoyés à l'IA : leur langue suit celle de l'interface.
//
// Seuls les textes connus (valeurs par défaut et préréglages) sont convertis ;
// un prompt écrit ou modifié par l'utilisateur n'est jamais touché.

import type { Settings } from "../types";
import type { Lang } from "./index";

/** Texte français → anglais. */
export const PROMPTS_EN: Record<string, string> = {
  // ── Prompt global
  "Tu es NATIA, un assistant de prise de notes expert. Sois direct, précis et utile. Réponds TOUJOURS en français sauf si une autre langue est explicitement demandée. Ne te présente pas, ne conclus pas avec des formules de politesse — va directement à l'essentiel.":
    "You are NATIA, an expert note-taking assistant. Be direct, precise and helpful. ALWAYS reply in English unless another language is explicitly requested. Don't introduce yourself and don't end with pleasantries — get straight to the point.",
  "Tu es un assistant factuel et neutre. Réponds en français, sans reformulation ni fioritures. Faits uniquement, pas d'opinion.":
    "You are a factual, neutral assistant. Reply in English, without rephrasing or embellishment. Facts only, no opinions.",
  "Tu es un assistant créatif et inspirant. En français, enrichis les idées, propose des angles originaux et des connexions inattendues.":
    "You are a creative, inspiring assistant. In English, enrich ideas and suggest original angles and unexpected connections.",
  "Tu es un expert analytique et méthodique. En français, réponds avec précision technique, structure claire et profondeur d'analyse.":
    "You are an analytical, methodical expert. In English, reply with technical precision, clear structure and depth of analysis.",
  "Tu es un coach bienveillant. En français, encourage, structure les pensées et pose des questions pertinentes pour approfondir la réflexion.":
    "You are a supportive coach. In English, encourage, structure thoughts and ask relevant questions to deepen reflection.",

  // ── Correction
  "Tu es un correcteur orthographique professionnel. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. INTERDIT : reformuler, changer le style, réorganiser les idées, ajouter ou supprimer du contenu. Retourne SEULEMENT le texte corrigé, sans guillemets, sans commentaire, sans introduction. Texte à corriger :":
    "You are a professional proofreader. Fix only spelling, grammar, verb-form and punctuation mistakes. FORBIDDEN: rephrasing, changing the style, reorganising ideas, adding or removing content. Return ONLY the corrected text, without quotes, comments or introduction. Text to correct:",
  "Corrige uniquement les fautes graves d'orthographe et d'accord. Ne modifie rien d'autre. Retourne SEULEMENT le texte, sans commentaire :":
    "Fix only serious spelling and agreement mistakes. Change nothing else. Return ONLY the text, without comments:",
  "Corrige l'orthographe, la grammaire, la ponctuation et la syntaxe. Ne reformule pas. Retourne SEULEMENT le texte corrigé, sans commentaire :":
    "Fix spelling, grammar, punctuation and syntax. Don't rephrase. Return ONLY the corrected text, without comments:",
  "Corrige les fautes ET améliore légèrement le style (clarté, fluidité) sans changer le sens. Retourne SEULEMENT le texte amélioré, sans commentaire :":
    "Fix the mistakes AND slightly improve the style (clarity, flow) without changing the meaning. Return ONLY the improved text, without comments:",

  // ── Résumé
  "Rédige un résumé en 2 à 3 phrases en français. Capture uniquement les idées essentielles. Réponds SEULEMENT avec le résumé, sans introduction, sans \"Résumé :\", sans commentaire. Texte :":
    "Write a 2 to 3 sentence summary in English. Capture only the essential ideas. Reply ONLY with the summary, without introduction, without \"Summary:\", without comments. Text:",
  "Résume en une seule phrase percutante en français. Réponds SEULEMENT avec cette phrase, sans commentaire :":
    "Summarise in a single punchy sentence in English. Reply ONLY with that sentence, without comments:",
  "Résume en 5 à 6 phrases structurées en français. Couvre les points clés, le contexte et les implications. Réponds SEULEMENT avec le résumé, sans commentaire :":
    "Summarise in 5 to 6 structured sentences in English. Cover the key points, the context and the implications. Reply ONLY with the summary, without comments:",
  "Résume sous forme de 3 à 5 bullet points en français (commence chaque point par « • »). Réponds SEULEMENT avec les bullet points, sans introduction :":
    "Summarise as 3 to 5 bullet points in English (start each point with “•”). Reply ONLY with the bullet points, without introduction:",
  "Donne un TL;DR de max 15 mots en français. Réponds SEULEMENT avec le TL;DR, sans le mot \"TL;DR\" :":
    "Give a TL;DR of at most 15 words in English. Reply ONLY with the TL;DR, without the word \"TL;DR\":",

  // ── Titre
  "Génère un titre de note en français de 3 à 5 mots. Le titre doit refléter le sujet central. Réponds avec le titre UNIQUEMENT : sans guillemets, sans point final, sans explication. Texte :":
    "Generate a 3 to 5 word note title in English. The title must reflect the central topic. Reply with the title ONLY: no quotes, no final full stop, no explanation. Text:",
  "Génère un titre descriptif de 5 à 8 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets, sans commentaire. Texte :":
    "Generate a descriptive 5 to 8 word title in English. Reply with the title ONLY, without quotes or comments. Text:",
  "Génère un titre accrocheur et original de 4 à 6 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :":
    "Generate a catchy, original 4 to 6 word title in English. Reply with the title ONLY, without quotes. Text:",
  "Génère un titre de 2 à 3 mots en français qui capture l'essence. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :":
    "Generate a 2 to 3 word title in English that captures the essence. Reply with the title ONLY, without quotes. Text:",

  // ── Tri
  "Analyse ces notes et assigne chacune à un dossier thématique. Utilise des sous-dossiers avec / pour plus de précision (ex: Travail/Projets). Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans bloc de code : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]":
    "Analyse these notes and assign each one to a topic folder. Use subfolders with / for more precision (e.g. Work/Projects). Name the folders in English. Reply ONLY with a valid JSON array, with no text before or after and no code block: [{\"id\":\"uuid\",\"folder\":\"FolderName\"}]",
  "Classe ces notes par thème principal (1 seul niveau, pas de sous-dossiers). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]":
    "Sort these notes by main topic (a single level, no subfolders). Name the folders in English. Reply ONLY with valid JSON, no text: [{\"id\":\"uuid\",\"folder\":\"FolderName\"}]",
  "Organise en arborescence précise avec sous-dossiers (ex: Travail/Projets/Web, Perso/Santé). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"Dossier/SousDossier\"}]":
    "Organise into a precise tree with subfolders (e.g. Work/Projects/Web, Personal/Health). Name the folders in English. Reply ONLY with valid JSON, no text: [{\"id\":\"uuid\",\"folder\":\"Folder/Subfolder\"}]",

  // ── Email
  "Transforme ce texte en email professionnel en français. Structure obligatoire : \"Bonjour,\" (saut de ligne), corps clair et structuré, \"Cordialement,\" (saut de ligne), prénom/nom si mentionné sinon omis. Réponds UNIQUEMENT avec l'email, sans guillemets, sans commentaire :":
    "Turn this text into a professional email in English. Required structure: \"Hello,\" (line break), a clear and structured body, \"Kind regards,\" (line break), first/last name if mentioned, otherwise omitted. Reply ONLY with the email, without quotes or comments:",
  "Transforme ce texte en email professionnel formel (registre soutenu). \"Madame, Monsieur,\" si destinataire inconnu. Corps structuré, \"Veuillez agréer mes salutations distinguées,\". Réponds UNIQUEMENT avec l'email :":
    "Turn this text into a formal professional email in English. \"Dear Sir or Madam,\" if the recipient is unknown. Structured body, \"Yours faithfully,\". Reply ONLY with the email:",
  "Transforme ce texte en email professionnel mais accessible. Ton cordial et clair. \"Bonjour,\" puis corps fluide, \"Bonne journée,\" en fin. Réponds UNIQUEMENT avec l'email :":
    "Turn this text into a professional but friendly email in English. Warm, clear tone. \"Hi,\" then a flowing body, \"Have a great day,\" at the end. Reply ONLY with the email:",

  // ── Traduction
  "Traduis le texte suivant en respectant strictement le style, le registre et le ton de l'original. Réponds UNIQUEMENT avec la traduction, sans introduction, sans commentaire, sans guillemets. Texte :":
    "Translate the following text, strictly keeping the style, register and tone of the original. Reply ONLY with the translation, without introduction, comments or quotes. Text:",
  "Traduis mot à mot en restant aussi proche que possible de l'original, même si cela nuit à la fluidité. Réponds UNIQUEMENT avec la traduction :":
    "Translate word for word, staying as close as possible to the original, even if it hurts the flow. Reply ONLY with the translation:",
  "Traduis en adaptant les expressions idiomatiques pour une lecture naturelle dans la langue cible. Réponds UNIQUEMENT avec la traduction :":
    "Translate, adapting idioms so it reads naturally in the target language. Reply ONLY with the translation:",

  // ── Continuation
  "Continue ce texte de façon fluide et cohérente. Respecte strictement le style, le registre et le ton de l'auteur. Écris 80 à 150 mots. Réponds UNIQUEMENT avec le texte à ajouter, en continuant directement là où le texte s'arrête, sans en-tête ni commentaire. Texte :":
    "Continue this text smoothly and coherently. Strictly keep the author's style, register and tone. Write 80 to 150 words. Reply ONLY with the text to add, continuing right where the text stops, without heading or comments. Text:",
  "Continue ce texte en 30 à 50 mots. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe, sans en-tête :":
    "Continue this text in 30 to 50 words. Keep the author's style. Reply ONLY with the direct continuation, without heading:",
  "Continue ce texte en 200 à 300 mots. Développe les idées avec profondeur. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe :":
    "Continue this text in 200 to 300 words. Develop the ideas in depth. Keep the author's style. Reply ONLY with the direct continuation:",
  "Continue ce texte narratif en restant fidèle à l'intrigue, aux personnages et au ton. 100 à 200 mots. Réponds UNIQUEMENT avec la continuation directe :":
    "Continue this narrative text, staying true to the plot, the characters and the tone. 100 to 200 words. Reply ONLY with the direct continuation:",

  // ── Consignes de longueur (aiInvoke.ts)
  "[CONSIGNE DE LONGUEUR : Réponds en 1 à 2 phrases maximum. Sois ultra-concis, va à l'essentiel.]":
    "[LENGTH INSTRUCTION: Reply in 1 to 2 sentences at most. Be extremely concise, get to the point.]",
  "[CONSIGNE DE LONGUEUR : Réponds en 3 à 5 phrases maximum. Reste concis et direct.]":
    "[LENGTH INSTRUCTION: Reply in 3 to 5 sentences at most. Stay concise and direct.]",
  "[CONSIGNE DE LONGUEUR : Développe ta réponse avec des détails pertinents et des exemples si utile. Tu peux aller jusqu'à 300 mots.]":
    "[LENGTH INSTRUCTION: Develop your answer with relevant details and examples if useful. You may go up to 300 words.]",
  "[CONSIGNE DE LONGUEUR : Réponse exhaustive et structurée. Utilise des sections, des exemples, une analyse complète. Ne te limite pas dans la longueur.]":
    "[LENGTH INSTRUCTION: Exhaustive, structured answer. Use sections, examples and a complete analysis. Don't limit the length.]",
};

const FR_FROM_EN: Record<string, string> = Object.fromEntries(
  Object.entries(PROMPTS_EN).map(([fr, en]) => [en, fr]),
);

/** Texte du prompt dans la langue demandée, s'il s'agit d'un texte connu ; sinon inchangé. */
export function promptIn(text: string, lang: Lang): string {
  const fr = text in PROMPTS_EN ? text : FR_FROM_EN[text];
  if (fr === undefined) return text;
  return lang === "en" ? PROMPTS_EN[fr] : fr;
}

export const PROMPT_KEYS = [
  "global_shadow_prompt", "correct_prompt", "summary_prompt", "rename_prompt",
  "sort_prompt", "formalize_prompt", "translate_prompt", "continue_prompt",
] as const;

/** Réglages dont les prompts connus sont passés dans la langue demandée. */
export function localizePrompts(settings: Settings, lang: Lang): Settings {
  let changed = false;
  const next = { ...settings };
  for (const key of PROMPT_KEYS) {
    const value = settings[key];
    if (typeof value !== "string") continue;
    const converted = promptIn(value, lang);
    if (converted !== value) { next[key] = converted; changed = true; }
  }
  return changed ? next : settings;
}
