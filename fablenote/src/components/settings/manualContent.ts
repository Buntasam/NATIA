// Contenu du manuel (Paramètres → Manuel).
// Mise en forme dans le texte : `code` et **gras**.
// Toute URL de `links` doit être autorisée dans src-tauri/capabilities/default.json.

export type ManualBlock =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { code: string }
  | { tip: string }
  | { warn: string }
  | { table: { head: string[]; rows: string[][] } }
  | { links: { label: string; url: string }[] };

export interface ManualTopic {
  title: string;
  blocks: ManualBlock[];
}

export interface ManualChapter {
  id: string;
  title: string;
  topics: ManualTopic[];
}

export const MANUAL: ManualChapter[] = [
  // ─── Prise en main ─────────────────────────────────────────────────────────
  {
    id: "start",
    title: "Prise en main",
    topics: [
      {
        title: "Créer et enregistrer une note",
        blocks: [
          { steps: [
            "Appuyez sur `Ctrl+N` (ou le bouton **Nouvelle note** de la barre latérale) pour créer une note.",
            "Tapez le titre en haut, puis le contenu en dessous.",
            "La note s'enregistre toute seule. Le mode se règle dans l'historique des versions (`Ctrl+Shift+H`) : automatique (1,5 s), équilibré (5 s) ou manuel. `Ctrl+S` enregistre à tout moment.",
          ] },
          { tip: "En fermant l'app, la note en cours est enregistrée avant de quitter." },
        ],
      },
      {
        title: "Ranger avec les dossiers et les tags",
        blocks: [
          { list: [
            "**Nouveau dossier** : bouton dossier en haut de la liste. Les dossiers peuvent être imbriqués.",
            "**Déplacer** : glissez une note ou un dossier sur un autre dossier.",
            "**Couleur** : clic droit sur un dossier ou une note.",
            "**Tags** : en bas de la note, champ « + ajouter un tag ». Cliquez sur un tag pour filtrer les notes.",
          ] },
        ],
      },
      {
        title: "Corbeille",
        blocks: [
          { p: "Une note ou un dossier supprimé va dans la corbeille (bouton en bas de la barre latérale). Vous pouvez le restaurer ou le supprimer définitivement." },
        ],
      },
      {
        title: "Langue de l'application",
        blocks: [
          { p: "Paramètres → Apparence → **Langue** : français ou anglais. Au premier lancement, NATIA prend la langue de Windows." },
          { p: "Les prompts IA par défaut changent aussi de langue. Les prompts que vous avez écrits vous-même ne sont pas modifiés, ni le contenu de vos notes." },
          { tip: "Pour des prompts (et donc des réponses) dans une autre langue que l'interface : Paramètres → Prompts → **Langue des prompts**, ou les petits drapeaux à côté de « Prompt système » dans le panneau IA (`Ctrl+Shift+A`)." },
        ],
      },
    ],
  },

  // ─── Éditeur ───────────────────────────────────────────────────────────────
  {
    id: "editor",
    title: "Éditeur",
    topics: [
      {
        title: "Mise en forme",
        blocks: [
          { p: "La barre d'outils au-dessus de la note propose : titres, gras, italique, souligné, barré, surlignage, couleurs, listes, cases à cocher, citations, blocs de code, liens, images et tableaux." },
          { p: "Le Markdown fonctionne aussi en tapant : `# ` pour un titre, `- ` pour une liste, `[ ] ` pour une case à cocher, `**texte**` pour du gras. Tapez `/` pour ouvrir le menu d'insertion." },
          { tip: "Les images collées ou insérées sont réduites automatiquement (1600 px au maximum) pour que la base reste légère." },
        ],
      },
      {
        title: "Liens entre notes (wikilinks)",
        blocks: [
          { steps: [
            "Tapez `[[` puis le titre d'une note, par exemple `[[Réunion lundi]]`.",
            "Cliquez sur le lien pour ouvrir la note.",
            "Le bouton « Liens et backlinks » en haut de la note montre les notes qui pointent vers elle.",
          ] },
        ],
      },
      {
        title: "Rappels",
        blocks: [
          { steps: [
            "Bouton « Insérer un rappel » de la barre d'outils.",
            "Écrivez le texte du rappel et choisissez la date et l'heure.",
            "À l'échéance, Windows affiche une notification. NATIA doit tourner, éventuellement rangée près de l'horloge (voir « Démarrage et fermeture »).",
          ] },
        ],
      },
      {
        title: "Post-its",
        blocks: [
          { list: [
            "**Dans une note** : bouton « Insérer un post-it » de la barre d'outils.",
            "**Sur l'écran de verrouillage** : bouton « Post-it » en bas à droite. Ils se déplacent, se redimensionnent par le coin en bas à droite et se masquent avec l'icône en forme d'œil.",
            "Le bouton Post-its de la barre latérale les affiche depuis l'app.",
          ] },
          { warn: "Les post-its de l'écran de verrouillage ne sont pas chiffrés : n'y mettez rien de confidentiel." },
        ],
      },
      {
        title: "Mode focus et recherche dans la note",
        blocks: [
          { list: [
            "**Mode focus** : bouton en haut de la note, masque la barre latérale. `Échap` pour quitter.",
            "**Chercher / remplacer** dans la note : `Ctrl+F`.",
          ] },
        ],
      },
      {
        title: "Exporter une note",
        blocks: [
          { p: "Menu « Plus d'actions » (⋯) en haut de la note : export en Markdown, texte brut, HTML ou PDF. Pour le PDF, choisissez « Microsoft Print to PDF » dans la fenêtre d'impression." },
        ],
      },
    ],
  },

  // ─── Navigation ────────────────────────────────────────────────────────────
  {
    id: "nav",
    title: "Recherche et navigation",
    topics: [
      {
        title: "Trouver une note",
        blocks: [
          { list: [
            "**Quick open** `Ctrl+P` : tapez quelques lettres du titre, puis `Entrée`. Tapez `>` pour lancer une commande (thème, corbeille, verrouillage…).",
            "**Recherche globale** `Ctrl+Shift+F` : cherche dans les titres et le contenu, sans tenir compte des majuscules ni des accents.",
            "`Alt+←` / `Alt+→` : note précédente / suivante.",
          ] },
        ],
      },
      {
        title: "Les vues",
        blocks: [
          { list: [
            "**Arborescence** : carte de tous les dossiers et notes.",
            "**Graphe** (`Ctrl+G`) : les notes reliées par des wikilinks.",
            "**Calendrier** : les notes par date de modification.",
          ] },
        ],
      },
      {
        title: "Historique des versions",
        blocks: [
          { p: "`Ctrl+Shift+H` ouvre l'historique : comparez deux versions ou restaurez-en une. Les enregistrements automatiques sont regroupés par tranches de 5 minutes, et chaque note garde jusqu'à 200 versions." },
        ],
      },
      {
        title: "Raccourcis clavier",
        blocks: [
          { table: { head: ["Raccourci", "Action"], rows: [
            ["Ctrl+N", "Nouvelle note"],
            ["Ctrl+P", "Quick open"],
            ["Ctrl+F", "Chercher dans la note"],
            ["Ctrl+Shift+F", "Recherche globale"],
            ["Ctrl+,", "Paramètres"],
            ["Ctrl+G", "Graphe"],
            ["Ctrl+Shift+A", "Panneau IA"],
            ["Ctrl+Shift+H", "Historique des versions"],
            ["Ctrl+/", "Liste des raccourcis"],
            ["Échap", "Fermer le panneau / quitter le mode focus"],
          ] } },
        ],
      },
    ],
  },

  // ─── Choisir une IA ────────────────────────────────────────────────────────
  {
    id: "ai-choice",
    title: "IA : quelle solution choisir ?",
    topics: [
      {
        title: "Comparatif",
        blocks: [
          { table: { head: ["Solution", "Coût", "Confidentialité", "Il faut"], rows: [
            ["IA intégrée (recommandée)", "Gratuit", "Rien ne quitte le PC", "Un clic, 1 à 3 Go à télécharger"],
            ["Ollama (local)", "Gratuit", "Rien ne quitte le PC", "Installer Ollama à part"],
            ["Claude, OpenAI, Gemini, Mistral (API)", "Payant à l'usage (Gemini et Mistral ont une offre gratuite limitée)", "Le texte est envoyé au fournisseur", "Une clé API"],
            ["Claude Code CLI", "Inclus dans un abonnement Claude", "Le texte est envoyé à Anthropic", "Node.js et un abonnement"],
          ] } },
          { tip: "Pour des notes sensibles, utilisez l'IA intégrée (ou Ollama). Pour la meilleure qualité de réponse, une API en ligne." },
        ],
      },
    ],
  },

  // ─── IA intégrée ───────────────────────────────────────────────────────────
  {
    id: "local-ai",
    title: "IA intégrée (recommandée)",
    topics: [
      {
        title: "Installer en un clic",
        blocks: [
          { steps: [
            "Paramètres → Intelligence artificielle → **Installer l'IA intégrée**.",
            "NATIA télécharge le moteur llama.cpp (33 Mo), analyse votre PC, puis télécharge le modèle conseillé.",
            "Une fois terminé, l'IA intégrée est choisie automatiquement : ouvrez le panneau IA (`Ctrl+Shift+A`) pour l'essayer.",
          ] },
          { p: "Tout tourne sur votre PC : aucun texte n'est envoyé sur internet. La connexion ne sert qu'au téléchargement, une seule fois." },
          { tip: "Le premier message charge le modèle en mémoire : quelques secondes avec une carte graphique, jusqu'à une minute sans." },
        ],
      },
      {
        title: "Choisir un autre modèle",
        blocks: [
          { p: "Dans la même section, chaque modèle peut être téléchargé, utilisé ou supprimé. Le badge « Recommandé pour ce PC » tient compte de votre RAM et de votre carte graphique." },
          { table: { head: ["Modèle", "Taille", "Pour"], rows: [
            ["Gemma 3 1B", "0,8 Go", "PC modeste (8 Go de RAM)"],
            ["Gemma 3 4B", "2,5 Go", "16 Go de RAM ou petite carte graphique"],
            ["Phi-4 mini", "2,5 Go", "Alternative à Gemma 3 4B"],
            ["Mistral 7B", "4,4 Go", "Carte graphique de 6 Go ou plus"],
            ["Gemma 3 12B", "7,3 Go", "Carte graphique de 10 Go ou plus"],
          ] } },
        ],
      },
      {
        title: "Sécurité et place sur le disque",
        blocks: [
          { list: [
            "Le moteur et les modèles viennent uniquement de leurs sources officielles (GitHub de llama.cpp, Hugging Face) et sont vérifiés par leur empreinte avant d'être utilisés.",
            "Le moteur n'est joignable que depuis ce PC, avec une clé secrète changée à chaque démarrage, et s'arrête avec NATIA.",
            "Les fichiers sont dans `%APPDATA%\\com.natia.app\\llm`. Supprimez un modèle depuis les paramètres pour libérer la place.",
          ] },
        ],
      },
    ],
  },

  // ─── Ollama ────────────────────────────────────────────────────────────────
  {
    id: "ollama",
    title: "Ollama (alternative locale)",
    topics: [
      {
        title: "1. Installer Ollama",
        blocks: [
          { steps: [
            "Téléchargez Ollama pour Windows sur le site officiel.",
            "Lancez `OllamaSetup.exe` et suivez l'installation.",
            "Ollama démarre tout seul : une icône de lama apparaît près de l'horloge Windows.",
            "Pour vérifier, ouvrez un terminal (touche Windows, tapez `cmd`) et tapez :",
          ] },
          { code: "ollama --version" },
          { links: [{ label: "Télécharger Ollama", url: "https://ollama.com/download" }] },
        ],
      },
      {
        title: "2. Choisir un modèle adapté à votre PC",
        blocks: [
          { p: "Un modèle trop gros pour la machine peut mettre plusieurs minutes à répondre, ou ne pas démarrer. Pour connaître votre RAM : `Ctrl+Shift+Échap` → Performances → Mémoire. Pour la carte graphique : même onglet, GPU." },
          { table: { head: ["Votre PC", "Modèles conseillés", "Taille"], rows: [
            ["8 Go de RAM, sans carte graphique", "gemma3:1b, qwen2.5:1.5b", "≈ 1 Go"],
            ["16 Go de RAM", "phi4-mini, llama3.2:3b, gemma3:4b", "2 à 3 Go"],
            ["Carte graphique avec 8 Go de mémoire vidéo ou plus", "mistral, llama3.1:8b", "4 à 5 Go"],
          ] } },
          { links: [{ label: "Bibliothèque des modèles", url: "https://ollama.com/library" }] },
        ],
      },
      {
        title: "3. Télécharger le modèle",
        blocks: [
          { p: "Deux façons de faire :" },
          { list: [
            "**Depuis NATIA** : panneau IA (`Ctrl+Shift+A`) → Ollama → bouton **+** à côté du choix du modèle, tapez le nom (par exemple `gemma3:1b`) et lancez le téléchargement.",
            "**Depuis un terminal** :",
          ] },
          { code: "ollama pull gemma3:1b" },
          { p: "Pour voir les modèles installés : `ollama list`. Pour en supprimer un : `ollama rm nom-du-modèle`." },
        ],
      },
      {
        title: "4. Configurer NATIA",
        blocks: [
          { steps: [
            "Paramètres → Intelligence artificielle → Fournisseur : **Ollama**.",
            "URL du serveur : laissez `http://localhost:11434`.",
            "Modèle par défaut : le nom du modèle téléchargé, par exemple `gemma3:1b`.",
            "Cliquez sur **Sauvegarder**, puis ouvrez le panneau IA pour tester.",
          ] },
        ],
      },
      {
        title: "Problèmes fréquents",
        blocks: [
          { list: [
            "**« Connexion refusée » ou aucun modèle listé** : Ollama n'est pas lancé. Démarrez-le depuis le menu Démarrer, puis cliquez sur le bouton Rafraîchir du panneau IA.",
            "**Réponses très lentes** : prenez un modèle plus petit (voir le tableau).",
            "**« model not found »** : le nom dans NATIA doit être exactement celui donné par `ollama list`.",
            "**Place sur le disque** : les modèles sont dans `C:\\Users\\<vous>\\.ollama\\models`. Supprimez ceux qui ne servent plus avec `ollama rm`.",
          ] },
        ],
      },
    ],
  },

  // ─── API en ligne ──────────────────────────────────────────────────────────
  {
    id: "api",
    title: "IA en ligne (clés API)",
    topics: [
      {
        title: "1. Obtenir une clé API",
        blocks: [
          { steps: [
            "Créez un compte chez le fournisseur choisi.",
            "Ajoutez un moyen de paiement ou du crédit si le fournisseur le demande (Claude et OpenAI le demandent).",
            "Créez une clé API et copiez-la tout de suite : elle n'est souvent affichée qu'une fois.",
          ] },
          { links: [
            { label: "Claude (Anthropic)", url: "https://console.anthropic.com/settings/keys" },
            { label: "OpenAI", url: "https://platform.openai.com/api-keys" },
            { label: "Gemini (Google)", url: "https://aistudio.google.com/apikey" },
            { label: "Mistral", url: "https://console.mistral.ai/api-keys" },
          ] },
          { warn: "Une clé API donne accès à votre compte payant : ne la partagez pas. Fixez une limite de dépenses dans la console du fournisseur." },
        ],
      },
      {
        title: "2. Ajouter la clé dans NATIA",
        blocks: [
          { steps: [
            "Paramètres → Intelligence artificielle → **Clés API & connexions**.",
            "Ajoutez une connexion : nom, fournisseur, clé, couleur et modèle.",
            "Dans le panneau IA, choisissez la connexion dans le sélecteur, puis cliquez sur **Tester** pour vérifier la clé.",
          ] },
          { p: "Vous pouvez enregistrer plusieurs clés (par exemple une perso et une pro) et passer de l'une à l'autre. Les clés sont rangées dans le coffre d'identifiants Windows." },
          { tip: "Un bandeau « IA en ligne » rappelle quand le texte de vos notes part chez un fournisseur extérieur." },
        ],
      },
    ],
  },

  // ─── Claude Code CLI ───────────────────────────────────────────────────────
  {
    id: "cli",
    title: "Claude Code CLI (abonnement Claude)",
    topics: [
      {
        title: "Installer et connecter",
        blocks: [
          { p: "Avec un abonnement Claude (Pro ou Max), NATIA peut utiliser Claude sans clé API, via l'outil en ligne de commande Claude Code." },
          { steps: [
            "Installez Node.js (version LTS) depuis le site officiel.",
            "Ouvrez un terminal et installez Claude Code :",
          ] },
          { code: "npm install -g @anthropic-ai/claude-code" },
          { steps: [
            "Lancez `claude` dans le terminal et connectez-vous à votre compte Claude.",
            "Dans NATIA : Paramètres → Intelligence artificielle → Fournisseur : **Claude CLI**, puis **Vérifier l'installation**.",
          ] },
          { links: [{ label: "Télécharger Node.js", url: "https://nodejs.org/" }] },
          { tip: "Si la vérification échoue juste après l'installation, redémarrez NATIA pour qu'il trouve la commande `claude`." },
        ],
      },
    ],
  },

  // ─── Utiliser l'IA ─────────────────────────────────────────────────────────
  {
    id: "ai-use",
    title: "Utiliser l'IA dans NATIA",
    topics: [
      {
        title: "Le panneau IA",
        blocks: [
          { p: "`Ctrl+Shift+A` ou le bouton IA en haut de la note. Les opérations s'appliquent à la note ouverte :" },
          { list: [
            "**Corriger** : orthographe et grammaire, avec les changements surlignés avant d'appliquer.",
            "**Résumer**, **Renommer** (donne un titre à la note), **Trier toutes les notes** (propose un dossier pour chaque note).",
            "**Traduire**, **Formaliser** (reformule en email), **Continuer** le texte.",
          ] },
        ],
      },
      {
        title: "Conversation",
        blocks: [
          { p: "Discutez avec l'IA en lui donnant la note ouverte comme contexte. L'historique de conversation se règle dans Paramètres → Intelligence artificielle." },
          { p: "Les conversations sont enregistrées (chiffrées si un mot de passe est actif) et listées à droite du chat : cliquez sur l'une d'elles pour la reprendre, sur le crayon (ou double-clic) pour la renommer, sur la corbeille (deux fois) pour la supprimer, et sur **Nouvelle** pour en commencer une autre. Le champ **Chercher** filtre les conversations par leur contenu. En ouvrant une note, sa dernière conversation est reprise." },
          { p: "Le bouton à côté de **Nouvelle** insère toute la conversation dans la note ouverte." },
        ],
      },
      {
        title: "Interroger toutes ses notes",
        blocks: [
          { steps: [
            "Ouvrez la conversation (`Ctrl+Shift+A`, puis **Conversation**).",
            "Au début d'une conversation, choisissez **Toutes mes notes** au lieu de la note ouverte.",
            "Posez votre question, par exemple « Qu'ai-je décidé pour le projet Orion ? ».",
          ] },
          { p: "NATIA cherche sur ce PC les notes qui contiennent les mots de la question, en donne des extraits à l'IA, et affiche sous la réponse les **notes utilisées** : cliquez sur l'une d'elles pour l'ouvrir." },
          { tip: "Avec l'IA intégrée ou Ollama, rien ne quitte votre PC. Avec une IA en ligne, les extraits des notes trouvées lui sont envoyés." },
        ],
      },
      {
        title: "Mémoire IA",
        blocks: [
          { p: "Des informations que l'IA garde d'une conversation à l'autre (vos préférences, vos projets…). Gérez-les dans Paramètres → Mémoire IA, ou dans le graphe depuis la barre latérale." },
        ],
      },
      {
        title: "Régler les réponses",
        blocks: [
          { list: [
            "**Température** : bas = réponses précises et constantes, haut = plus créatives.",
            "**Consommation de tokens** (Éco → Maxi) : la longueur des réponses. Éco coûte moins cher avec une API payante.",
            "**Prompts** : modifiez les instructions de chaque opération dans Paramètres → Prompts. Les prompts par défaut suivent la langue des prompts (celle de l'application, sauf choix contraire).",
          ] },
        ],
      },
    ],
  },

  // ─── Sécurité ──────────────────────────────────────────────────────────────
  {
    id: "security",
    title: "Sécurité et mot de passe",
    topics: [
      {
        title: "Activer le mot de passe",
        blocks: [
          { steps: [
            "Paramètres → Sécurité → **Activer**.",
            "Choisissez un mot de passe (conseillé) ou un code PIN. L'indicateur montre sa solidité.",
            "Notez la **clé de récupération** affichée : elle ne sera plus jamais montrée.",
          ] },
          { p: "Toutes les données personnelles sont alors chiffrées (AES-256) : notes, titres, dossiers, tags, versions, paramètres, clés API et mémoire IA. Le mot de passe ne fonctionne que sur ce PC et cette session Windows." },
        ],
      },
      {
        title: "Clé de récupération",
        blocks: [
          { p: "Elle permet de rouvrir les notes si vous oubliez le mot de passe, réinstallez Windows ou changez de PC." },
          { steps: [
            "Sur l'écran de verrouillage : **Mot de passe oublié ou nouveau PC ?**",
            "Saisissez la clé (majuscules, tirets et espaces facultatifs).",
            "Choisissez un nouveau mot de passe.",
          ] },
          { p: "Clé perdue ? Paramètres → Sécurité → **Nouvelle clé** en crée une autre ; l'ancienne ne marche plus." },
          { warn: "Gardez-la hors de NATIA (papier, gestionnaire de mots de passe). Sans mot de passe ni clé de récupération, les notes sont perdues." },
        ],
      },
      {
        title: "Verrouillage",
        blocks: [
          { list: [
            "**Automatique** après inactivité (réglable), quand Windows se verrouille (`Windows+L`) ou quand le PC sort de veille.",
            "**Manuel** : bouton cadenas de la barre latérale, ou « Verrouiller » dans le menu de l'icône près de l'horloge.",
            "**Erreurs** : après 4 essais ratés, l'app bloque de plus en plus longtemps (30 s, 1 min… jusqu'à 24 h), même après un redémarrage.",
          ] },
        ],
      },
      {
        title: "Réinitialiser l'app",
        blocks: [
          { p: "« Réinitialiser l'app » (écran de verrouillage ou Paramètres → Données) efface toutes les notes, paramètres et clés pour repartir de zéro." },
          { warn: "Irréversible. Essayez d'abord la clé de récupération." },
        ],
      },
    ],
  },

  // ─── Sauvegarde ────────────────────────────────────────────────────────────
  {
    id: "backup",
    title: "Sauvegarde et changement de PC",
    topics: [
      {
        title: "Exporter",
        blocks: [
          { p: "Paramètres → Données → Export. Trois formats :" },
          { table: { head: ["Format", "Protection", "S'ouvre avec"], rows: [
            ["ZIP classique", "Aucune, notes en clair", "Windows"],
            ["Protégé AES-256", "Mot de passe, chiffrement fort", "7-Zip"],
            ["Compatible Windows", "Mot de passe, chiffrement faible", "Windows"],
          ] } },
          { links: [{ label: "Télécharger 7-Zip", url: "https://www.7-zip.org/" }] },
          { tip: "Activez le rappel hebdomadaire (Paramètres → Données) pour ne pas oublier." },
        ],
      },
      {
        title: "Sauvegarde automatique",
        blocks: [
          { steps: [
            "Paramètres → Données → **Sauvegarde automatique** : activez l'interrupteur.",
            "**Choisir…** : le dossier des sauvegardes (OneDrive, clé USB, disque externe…).",
            "Choisissez la fréquence (chaque jour ou chaque semaine) et le nombre de sauvegardes gardées, puis **Enregistrer**.",
          ] },
          { p: "NATIA écrit une archive `NATIA-sauvegarde-date.zip` au démarrage quand la précédente est assez ancienne, et supprime les plus anciennes au-delà du nombre choisi. **Sauvegarder maintenant** en fait une tout de suite." },
          { warn: "Si vos notes sont protégées par un mot de passe, les sauvegardes doivent l'être aussi (AES-256). Notez ce mot de passe : sans lui, les archives ne s'ouvrent pas." },
          { p: "Pour restaurer : Paramètres → Données → **Importer**, puis choisissez l'archive." },
        ],
      },
      {
        title: "Importer",
        blocks: [
          { p: "Paramètres → Données → Importer : choisissez un export NATIA (n'importe lequel des trois formats). Les notes déjà présentes ne sont pas dupliquées." },
        ],
      },
      {
        title: "Passer sur un nouveau PC",
        blocks: [
          { steps: [
            "Sur l'ancien PC : faites un export protégé AES-256.",
            "Sur le nouveau PC : installez NATIA, puis Paramètres → Données → Importer.",
            "Réactivez le mot de passe et notez la nouvelle clé de récupération.",
          ] },
          { p: "Autre solution : copier le dossier `%APPDATA%\\com.natia.app`. Sur le nouveau PC, il s'ouvre avec la clé de récupération." },
        ],
      },
    ],
  },

  // ─── Mises à jour et aide ──────────────────────────────────────────────────
  {
    id: "help",
    title: "Démarrage, mises à jour et aide",
    topics: [
      {
        title: "Démarrage et fermeture",
        blocks: [
          { list: [
            "**Fermer la fenêtre** range NATIA près de l'horloge Windows : elle continue de tourner et les rappels sonnent toujours. Cliquez sur l'icône pour retrouver la fenêtre.",
            "**Pour quitter vraiment** : clic droit sur l'icône → **Quitter**.",
            "Paramètres → Application → **Démarrage et fermeture** : désactivez ce comportement, ou lancez NATIA au démarrage de Windows.",
            "Ouvrir NATIA une deuxième fois ramène la fenêtre déjà ouverte.",
          ] },
        ],
      },
      {
        title: "Mises à jour",
        blocks: [
          { p: "Au démarrage, une fenêtre propose la nouvelle version : **Mettre à jour** l'installe (la note en cours est enregistrée, puis NATIA redémarre), **Plus tard** la reporte au prochain lancement. Paramètres → Application pour désactiver la recherche ou vérifier à la main. Vos notes sont conservées." },
        ],
      },
      {
        title: "Guide de démarrage",
        blocks: [
          { p: "Au premier lancement (et après une réinitialisation), un guide propose les trois réglages conseillés : mot de passe, IA, sauvegarde automatique. Chacun est facultatif. Paramètres → Application → **Revoir le guide** pour le rouvrir." },
        ],
      },
      {
        title: "Signaler un bug ou proposer une idée",
        blocks: [
          { p: "Paramètres → Application : liens vers les issues (bugs) et les discussions (idées, questions) du projet sur GitHub. Indiquez la version de NATIA, celle de Windows et les étapes pour reproduire le problème." },
        ],
      },
    ],
  },
];
