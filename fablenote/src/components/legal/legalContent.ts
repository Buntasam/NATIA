// Conditions d'utilisation et politique de confidentialité (premier lancement, Paramètres → Confidentialité).
// Même mise en forme que le manuel : `code` et **gras**.
// Toute URL de `links` doit être autorisée dans src-tauri/capabilities/default.json.
//
// Changer le fond de l'un des textes : mettre à jour LEGAL_VERSION (date du jour),
// la date « Dernière mise à jour » dans les deux langues, et legalContent.en.ts.
// L'acceptation est alors redemandée au prochain lancement.

import type { ManualChapter } from "../settings/manualContent";

export const LEGAL_VERSION = "2026-10-23";

export const LEGAL: ManualChapter[] = [
  // ─── Conditions d'utilisation ──────────────────────────────────────────────
  {
    id: "terms",
    title: "Conditions d'utilisation",
    topics: [
      {
        title: "1. Objet et acceptation",
        blocks: [
          { p: "Ces conditions encadrent l'utilisation de NATIA, une application de prise de notes qui fonctionne sur votre ordinateur. Elles doivent être acceptées au premier lancement, après une réinitialisation de l'application et à chaque modification de leur contenu. Si vous ne les acceptez pas, n'utilisez pas NATIA." },
          { p: "Dernière mise à jour : 23 octobre 2026." },
        ],
      },
      {
        title: "2. Éditeur",
        blocks: [
          { p: "NATIA est développée et publiée à titre personnel et non commercial par **Buntasam** (l'« Auteur »). Contact : les « issues » du dépôt GitHub officiel." },
          { links: [{ label: "github.com/Buntasam/NATIA", url: "https://github.com/Buntasam/NATIA" }] },
        ],
      },
      {
        title: "3. Licence",
        blocks: [
          { p: "NATIA est gratuite. Son utilisation est régie par la licence du dépôt officiel (fichier `LICENSE`) : usage personnel et non commercial, code consultable, modifications pour votre seul usage. La revente, la redistribution et toute utilisation commerciale sont interdites sans l'accord écrit de l'Auteur. En cas de contradiction, la licence prévaut sur ces conditions pour ce qui concerne les droits sur le logiciel." },
        ],
      },
      {
        title: "4. Version bêta, fournie en l'état",
        blocks: [
          { p: "NATIA est en développement actif. Elle est fournie **« en l'état »**, sans garantie de fonctionnement, de disponibilité ou d'adéquation à un besoin particulier. Des bugs peuvent survenir, y compris des pertes de données." },
        ],
      },
      {
        title: "5. Vos données, vos sauvegardes",
        blocks: [
          { list: [
            "Vos notes restent sur votre ordinateur : l'Auteur n'y a pas accès et ne peut pas les récupérer à votre place.",
            "Vous êtes responsable de leurs sauvegardes (Paramètres → Données → export ZIP).",
            "Si vous activez un mot de passe, gardez-le, ainsi que votre clé de récupération, en lieu sûr : sans eux, les notes chiffrées sont **définitivement illisibles**, pour vous comme pour l'Auteur.",
          ] },
        ],
      },
      {
        title: "6. Intelligence artificielle",
        blocks: [
          { list: [
            "Les réponses de l'IA (résumés, corrections, tri, traductions…) peuvent être fausses, incomplètes ou inadaptées. Vérifiez-les avant de les appliquer, et ne vous en servez pas seules pour une décision médicale, juridique, financière ou de sécurité.",
            "Les services d'IA en ligne (Anthropic, OpenAI, Google, Mistral) sont fournis par des tiers, selon leurs propres conditions. Les clés API, leur usage et leurs éventuels coûts sont sous votre responsabilité.",
            "Les modèles téléchargés pour l'IA intégrée ont leur propre licence (Gemma Terms of Use, MIT, Apache 2.0), affichée à côté de chaque modèle. En téléchargeant un modèle, vous acceptez sa licence.",
          ] },
        ],
      },
      {
        title: "7. Usage licite",
        blocks: [
          { p: "Vous vous engagez à utiliser NATIA conformément à la loi. Si vos notes contiennent des données personnelles d'autres personnes, vous êtes responsable du respect de leurs droits, notamment avant d'envoyer ces notes à une IA en ligne." },
        ],
      },
      {
        title: "8. Responsabilité",
        blocks: [
          { p: "Dans toute la mesure permise par la loi, l'Auteur ne pourra être tenu responsable des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser NATIA, notamment une perte de données, ni du fonctionnement des services tiers. Rien dans ces conditions ne limite les droits que la loi vous garantit et auxquels il ne peut être dérogé." },
        ],
      },
      {
        title: "9. Mises à jour et modification des conditions",
        blocks: [
          { p: "NATIA peut proposer des mises à jour ; leur installation reste votre choix. Ces conditions peuvent évoluer : la nouvelle version vous sera présentée au lancement suivant et devra être acceptée pour continuer à utiliser l'application." },
        ],
      },
      {
        title: "10. Droit applicable",
        blocks: [
          { p: "Ces conditions sont soumises au droit français. En cas de désaccord, contactez d'abord l'Auteur pour chercher une solution amiable. Si vous êtes un consommateur, vous gardez le bénéfice des règles protectrices de votre pays de résidence." },
        ],
      },
    ],
  },

  // ─── Politique de confidentialité ──────────────────────────────────────────
  {
    id: "privacy",
    title: "Politique de confidentialité",
    topics: [
      {
        title: "1. En bref",
        blocks: [
          { list: [
            "NATIA **ne collecte aucune donnée** : pas de compte, pas de statistiques d'utilisation, pas de publicité, pas de traceur. L'Auteur ne reçoit rien de ce que vous écrivez.",
            "Tout est stocké sur votre ordinateur. Des données ne le quittent que lorsque vous utilisez une fonction qui en a besoin (liste ci-dessous).",
            "Pour des notes sensibles, utilisez l'IA intégrée ou Ollama : rien n'est alors envoyé sur internet.",
          ] },
          { p: "Dernière mise à jour : 23 octobre 2026." },
        ],
      },
      {
        title: "2. Ce qui est stocké sur votre ordinateur",
        blocks: [
          { p: "Dans `%APPDATA%\\com.natia.app` : les notes (titres, contenu, tags, dossiers, couleurs), leur historique de versions, la mémoire IA, l'historique des conversations IA, les paramètres et les modèles de l'IA intégrée. Les préférences d'affichage (langue, thème…) sont gardées par la fenêtre de l'application." },
          { list: [
            "Avec un mot de passe, les notes, titres, tags et clés API sont chiffrés (AES-256-GCM, clé dérivée par Argon2id). Les post-its restent en clair.",
            "Sans mot de passe, les clés API sont rangées dans le gestionnaire d'identifiants de Windows et le reste est en clair dans la base locale.",
            "Le journal de débogage, s'il est activé, reste sur votre ordinateur.",
          ] },
        ],
      },
      {
        title: "3. Quand des données quittent votre ordinateur",
        blocks: [
          { table: { head: ["Fonction", "Destinataire", "Données envoyées", "Quand"], rows: [
            ["IA en ligne", "Anthropic, OpenAI, Google ou Mistral (selon votre choix)", "Le texte soumis à l'IA (note, sélection, conversation, prompt système, mémoire IA si activée) et votre clé API", "Seulement quand vous lancez une action IA avec ce fournisseur"],
            ["Claude Code CLI", "Anthropic, via votre compte Claude", "Les mêmes", "Idem"],
            ["IA intégrée, Ollama", "Personne (traitement sur votre PC)", "—", "—"],
            ["Installation de l'IA intégrée", "GitHub (moteur), Hugging Face (modèles)", "Données techniques de connexion (adresse IP, logiciel)", "Une fois, au téléchargement"],
            ["Recherche de mises à jour", "GitHub", "Données techniques de connexion", "Au démarrage ou à la demande ; désactivable (Paramètres → Application)"],
            ["Dictée vocale", "Microsoft, si la reconnaissance vocale de Windows / Edge passe par ses services en ligne", "Le son du micro pendant la dictée", "Seulement pendant une dictée"],
            ["Liens externes", "Le site ouvert dans votre navigateur", "Selon ce site", "Quand vous cliquez sur un lien"],
          ] } },
          { p: "Ces tiers traitent les données selon leur propre politique de confidentialité, parfois hors de l'Union européenne :" },
          { links: [
            { label: "Anthropic", url: "https://www.anthropic.com/legal/privacy" },
            { label: "OpenAI", url: "https://openai.com/policies/privacy-policy" },
            { label: "Google", url: "https://policies.google.com/privacy" },
            { label: "Mistral AI", url: "https://legal.mistral.ai/terms/privacy-policy" },
            { label: "GitHub", url: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" },
            { label: "Hugging Face", url: "https://huggingface.co/privacy" },
            { label: "Microsoft", url: "https://privacy.microsoft.com/" },
          ] },
          { warn: "Ce que vous publiez sur GitHub pour signaler un bug est public : n'y collez pas le contenu de vos notes." },
        ],
      },
      {
        title: "4. Qui est responsable de quoi",
        blocks: [
          { list: [
            "L'Auteur ne collecte ni ne traite vos données personnelles : il n'est pas responsable de traitement au sens du RGPD pour vos notes.",
            "Vos notes vous appartiennent. Un usage strictement personnel relève de l'exception « domestique » du RGPD (article 2) ; si vous y gardez des données d'autres personnes, c'est à vous d'en respecter les droits.",
            "Quand vous utilisez une IA en ligne, le fournisseur choisi traite le texte envoyé selon ses propres conditions. Évitez d'y envoyer des données sensibles (santé, opinions, données d'autrui) sans raison valable.",
          ] },
        ],
      },
      {
        title: "5. Durée de conservation",
        blocks: [
          { p: "Vos données restent sur votre ordinateur tant que vous ne les supprimez pas. Les versions automatiques d'une note sont regroupées par tranches de 5 minutes ; les versions nommées sont gardées jusqu'à leur suppression. La conservation chez un fournisseur d'IA en ligne dépend de sa propre politique." },
        ],
      },
      {
        title: "6. Vos droits (RGPD)",
        blocks: [
          { table: { head: ["Droit", "Comment l'exercer dans NATIA"], rows: [
            ["Accès et portabilité", "Paramètres → Données → export ZIP (toutes les notes), ou export d'une note en Markdown, texte ou HTML"],
            ["Rectification", "Modifiez directement vos notes et vos paramètres"],
            ["Effacement", "Supprimez une note, ou Paramètres → Données → **Réinitialiser l'app** pour tout effacer ; avant de désinstaller NATIA, supprimez aussi son dossier de données (Paramètres → Données → Désinstallation)"],
            ["Opposition", "N'utilisez pas d'IA en ligne, désactivez la recherche de mises à jour"],
          ] } },
          { p: "Pour les données transmises à un fournisseur d'IA, adressez-vous à lui. Vous pouvez aussi saisir la CNIL, l'autorité française de protection des données." },
          { links: [{ label: "CNIL — adresser une plainte", url: "https://www.cnil.fr/fr/plaintes" }] },
        ],
      },
      {
        title: "7. Sécurité",
        blocks: [
          { p: "NATIA protège vos données par chiffrement (si un mot de passe est actif), verrouillage automatique et vérification des fichiers téléchargés (empreinte SHA-256, mises à jour signées). La sécurité de votre ordinateur (session Windows, antivirus, sauvegardes) reste de votre ressort." },
        ],
      },
      {
        title: "8. Modifications",
        blocks: [
          { p: "Cette politique peut évoluer avec l'application. Toute modification de fond vous sera présentée au lancement suivant et devra être acceptée." },
        ],
      },
    ],
  },
];
