import { Settings as SettingsType } from "../../types";

export const PROMPT_FIELDS: { key: keyof SettingsType; label: string; rows: number }[] = [
  { key: "global_shadow_prompt", label: "Prompt global (injecté dans chaque requête)", rows: 3 },
  { key: "correct_prompt",       label: "Correction orthographique",                   rows: 3 },
  { key: "summary_prompt",       label: "Résumé",                                      rows: 2 },
  { key: "rename_prompt",        label: "Renommage automatique",                       rows: 2 },
  { key: "sort_prompt",          label: "Tri des notes (instructions JSON)",            rows: 3 },
  { key: "formalize_prompt",     label: "Formalisation (email professionnel)",          rows: 3 },
  { key: "translate_prompt",     label: "Traduction (instructions de style)",           rows: 2 },
  { key: "continue_prompt",      label: "Continuation de texte",                       rows: 2 },
];

export const TEMP_PRESET_MAP: Record<string, (t: number) => string> = {
  global_shadow_prompt: (t) => t <= 0.3 ? "Factuel" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Créatif" : "Expert",
  correct_prompt:       (t) => t <= 0.3 ? "Léger" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Complet" : "Stylistique",
  summary_prompt:       (t) => t <= 0.3 ? "1 phrase" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Détaillé" : "Bullet points",
  rename_prompt:        (t) => t <= 0.3 ? "Minimaliste" : t <= 0.8 ? "Défaut" : t <= 1.4 ? "Descriptif" : "Créatif",
  sort_prompt:          (t) => t <= 0.8 ? "Simple" : t <= 1.4 ? "Défaut" : "Détaillé",
};

export const PROMPT_PRESETS: Record<string, { label: string; value: string }[]> = {
  global_shadow_prompt: [
    { label: "Défaut",   value: "Tu es NATIA, un assistant de prise de notes expert. Sois direct, précis et utile. Réponds TOUJOURS en français sauf si une autre langue est explicitement demandée. Ne te présente pas, ne conclus pas avec des formules de politesse — va directement à l'essentiel." },
    { label: "Factuel",  value: "Tu es un assistant factuel et neutre. Réponds en français, sans reformulation ni fioritures. Faits uniquement, pas d'opinion." },
    { label: "Créatif",  value: "Tu es un assistant créatif et inspirant. En français, enrichis les idées, propose des angles originaux et des connexions inattendues." },
    { label: "Expert",   value: "Tu es un expert analytique et méthodique. En français, réponds avec précision technique, structure claire et profondeur d'analyse." },
    { label: "Coach",    value: "Tu es un coach bienveillant. En français, encourage, structure les pensées et pose des questions pertinentes pour approfondir la réflexion." },
  ],
  correct_prompt: [
    { label: "Défaut",       value: "Tu es un correcteur orthographique professionnel. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. INTERDIT : reformuler, changer le style, réorganiser les idées, ajouter ou supprimer du contenu. Retourne SEULEMENT le texte corrigé, sans guillemets, sans commentaire, sans introduction. Texte à corriger :" },
    { label: "Léger",        value: "Corrige uniquement les fautes graves d'orthographe et d'accord. Ne modifie rien d'autre. Retourne SEULEMENT le texte, sans commentaire :" },
    { label: "Complet",      value: "Corrige l'orthographe, la grammaire, la ponctuation et la syntaxe. Ne reformule pas. Retourne SEULEMENT le texte corrigé, sans commentaire :" },
    { label: "Stylistique",  value: "Corrige les fautes ET améliore légèrement le style (clarté, fluidité) sans changer le sens. Retourne SEULEMENT le texte amélioré, sans commentaire :" },
  ],
  summary_prompt: [
    { label: "Défaut",        value: "Rédige un résumé en 2 à 3 phrases en français. Capture uniquement les idées essentielles. Réponds SEULEMENT avec le résumé, sans introduction, sans \"Résumé :\", sans commentaire. Texte :" },
    { label: "1 phrase",      value: "Résume en une seule phrase percutante en français. Réponds SEULEMENT avec cette phrase, sans commentaire :" },
    { label: "Détaillé",      value: "Résume en 5 à 6 phrases structurées en français. Couvre les points clés, le contexte et les implications. Réponds SEULEMENT avec le résumé, sans commentaire :" },
    { label: "Bullet points", value: "Résume sous forme de 3 à 5 bullet points en français (commence chaque point par « • »). Réponds SEULEMENT avec les bullet points, sans introduction :" },
    { label: "TL;DR",         value: "Donne un TL;DR de max 15 mots en français. Réponds SEULEMENT avec le TL;DR, sans le mot \"TL;DR\" :" },
  ],
  rename_prompt: [
    { label: "Défaut",      value: "Génère un titre de note en français de 3 à 5 mots. Le titre doit refléter le sujet central. Réponds avec le titre UNIQUEMENT : sans guillemets, sans point final, sans explication. Texte :" },
    { label: "Descriptif",  value: "Génère un titre descriptif de 5 à 8 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets, sans commentaire. Texte :" },
    { label: "Créatif",     value: "Génère un titre accrocheur et original de 4 à 6 mots en français. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :" },
    { label: "Minimaliste", value: "Génère un titre de 2 à 3 mots en français qui capture l'essence. Réponds avec le titre UNIQUEMENT, sans guillemets. Texte :" },
  ],
  sort_prompt: [
    { label: "Défaut",   value: "Analyse ces notes et assigne chacune à un dossier thématique. Utilise des sous-dossiers avec / pour plus de précision (ex: Travail/Projets). Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans bloc de code : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]" },
    { label: "Simple",   value: "Classe ces notes par thème principal (1 seul niveau, pas de sous-dossiers). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]" },
    { label: "Détaillé", value: "Organise en arborescence précise avec sous-dossiers (ex: Travail/Projets/Web, Perso/Santé). Réponds UNIQUEMENT avec du JSON valide, sans texte : [{\"id\":\"uuid\",\"folder\":\"Dossier/SousDossier\"}]" },
  ],
  formalize_prompt: [
    { label: "Défaut",      value: "Transforme ce texte en email professionnel en français. Structure obligatoire : \"Bonjour,\" (saut de ligne), corps clair et structuré, \"Cordialement,\" (saut de ligne), prénom/nom si mentionné sinon omis. Réponds UNIQUEMENT avec l'email, sans guillemets, sans commentaire :" },
    { label: "Formel",      value: "Transforme ce texte en email professionnel formel (registre soutenu). \"Madame, Monsieur,\" si destinataire inconnu. Corps structuré, \"Veuillez agréer mes salutations distinguées,\". Réponds UNIQUEMENT avec l'email :" },
    { label: "Décontracté", value: "Transforme ce texte en email professionnel mais accessible. Ton cordial et clair. \"Bonjour,\" puis corps fluide, \"Bonne journée,\" en fin. Réponds UNIQUEMENT avec l'email :" },
  ],
  translate_prompt: [
    { label: "Défaut",       value: "Traduis le texte suivant en respectant strictement le style, le registre et le ton de l'original. Réponds UNIQUEMENT avec la traduction, sans introduction, sans commentaire, sans guillemets. Texte :" },
    { label: "Littéral",     value: "Traduis mot à mot en restant aussi proche que possible de l'original, même si cela nuit à la fluidité. Réponds UNIQUEMENT avec la traduction :" },
    { label: "Naturel",      value: "Traduis en adaptant les expressions idiomatiques pour une lecture naturelle dans la langue cible. Réponds UNIQUEMENT avec la traduction :" },
  ],
  continue_prompt: [
    { label: "Défaut",    value: "Continue ce texte de façon fluide et cohérente. Respecte strictement le style, le registre et le ton de l'auteur. Écris 80 à 150 mots. Réponds UNIQUEMENT avec le texte à ajouter, en continuant directement là où le texte s'arrête, sans en-tête ni commentaire. Texte :" },
    { label: "Court",     value: "Continue ce texte en 30 à 50 mots. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe, sans en-tête :" },
    { label: "Long",      value: "Continue ce texte en 200 à 300 mots. Développe les idées avec profondeur. Respecte le style de l'auteur. Réponds UNIQUEMENT avec la continuation directe :" },
    { label: "Narratif",  value: "Continue ce texte narratif en restant fidèle à l'intrigue, aux personnages et au ton. 100 à 200 mots. Réponds UNIQUEMENT avec la continuation directe :" },
  ],
};
