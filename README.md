```
███▄▄▄▄      ▄████████     ███      ▄█     ▄████████ 
███▀▀▀██▄   ███    ███ ▀█████████▄ ███    ███    ███ 
███   ███   ███    ███    ▀███▀▀██ ███▌   ███    ███ 
███   ███   ███    ███     ███   ▀ ███▌   ███    ███ 
███   ███ ▀███████████     ███     ███▌ ▀███████████ 
███   ███   ███    ███     ███     ███    ███    ███ 
███   ███   ███    ███     ███     ███    ███    ███ 
 ▀█   █▀    ███    █▀     ▄████▀   █▀     ███    █▀  
                                                     
```
🇫🇷 Développeur français

> Application de prise de notes locale avec IA multi-fournisseur, historique des versions, chiffrement AES-256-GCM et thèmes clair/sombre.

NATIA est une application de bureau pour **Windows**, construite avec **Tauri 2** (backend Rust) et **React 18** (frontend TypeScript). Toutes les données sont stockées sur votre PC, aucun compte ni cloud n'est nécessaire. macOS et Linux ne sont pas testés.

---

## Installation

Téléchargez `NATIA_x.y.z_x64-setup.exe` dans les [Releases](https://github.com/Buntasam/NATIA/releases/latest), puis lancez-le.

L'installeur n'est pas signé : Windows SmartScreen affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ». Les versions suivantes sont proposées automatiquement au démarrage de l'app.

---

## Fonctionnalités

### Éditeur
- **Éditeur riche** — TipTap avec Markdown, titres, listes, blocs de code, tâches, surlignage, tableaux, images
- **Post-its** — blocs colorés repositionnables dans la note
- **Wikilinks** — liens `[[Titre de note]]` avec navigation directe
- **Rappels** — blocs de rappel avec date/heure, notification Windows à l'échéance
- **Mode focus** — éditeur plein écran sans barre latérale (`Échap` pour quitter)
- **Enregistrement automatique** — trois modes : automatique (1,5 s), équilibré (5 s) ou manuel
- **Confirmation de fermeture** — la note en cours est enregistrée avant de quitter

### Organisation
- **Dossiers imbriqués** — arborescence avec glisser-déposer
- **Vues** — arborescence, graphe des wikilinks, calendrier
- **Backlinks** — notes qui pointent vers la note active
- **Tags**, **corbeille** avec restauration, **modèles de notes**

### IA multi-fournisseur
- **IA intégrée** — llama.cpp tourne dans NATIA : installation en un clic, modèle choisi selon le PC, rien ne quitte votre PC
- **Ollama** — autre option locale, à installer séparément
- **Claude API**, **OpenAI**, **Gemini**, **Mistral** — avec une clé API
- **Claude Code CLI** — avec un abonnement Claude, sans clé API
- **Connexions** — plusieurs clés API nommées, avec fournisseur, couleur et modèle
- **Opérations** — correction, résumé, titre, tri automatique, traduction, email, continuation de texte
- **Conversation** — chat avec le contexte de la note active, historique enregistré (reprendre, renommer, chercher, supprimer)
- **Interroger ses notes** — mode « Toutes mes notes » : l'IA répond à partir des notes trouvées sur le PC et indique lesquelles elle a utilisées ; avec la recherche intelligente (modèle BGE-M3), elle trouve aussi les notes formulées avec d'autres mots
- **Mémoire IA** — contexte persistant ajouté aux prompts
- **Streaming** — réponses affichées au fil de l'eau
- **Indicateur « IA en ligne »** — rappelle quand le texte est envoyé à un fournisseur extérieur

### Recherche et navigation
- **Recherche plein texte** — titres et contenus, sans tenir compte des majuscules ni des accents (« reunion » trouve « Réunion »)
- **Quick open** — `Ctrl+P` pour ouvrir une note par son nom

### Historique
- **Versions** — enregistrements automatiques regroupés par tranches de 5 minutes, 200 versions par note ; comparaison et restauration

### Sécurité et données
- **Chiffrement AES-256-GCM** — notes, titres, tags, dossiers, versions, paramètres, clés API et mémoire IA
- **PIN ou mot de passe** — dérivation Argon2id, clé liée à votre PC et à votre session Windows
- **Blocage après erreurs** — délais croissants, conservés même après redémarrage
- **Verrouillage automatique** — après inactivité, quand Windows se verrouille ou quand le PC sort de veille
- **Export / import** — ZIP classique, protégé AES-256 (7-Zip) ou compatible Windows ; rappel de sauvegarde chaque semaine
- **Sauvegarde automatique** — chaque jour ou chaque semaine, dans le dossier de votre choix, en gardant les N dernières ; restauration en un clic
- **Import Obsidian et Notion** — dossiers, tags, tâches, images et liens `[[…]]` conservés
- **Clé de récupération** — rouvre les notes en cas d'oubli du mot de passe, de réinstallation de Windows ou de changement de PC
- **Indicateur de solidité** du mot de passe
- **Réinitialisation** — pour repartir de zéro, depuis l'écran de verrouillage

### Divers
- **Post-its de l'écran de verrouillage**, redimensionnables et masquables (non chiffrés)
- **Enregistreur vocal** avec transcription par l'IA
- **Français ou anglais** — interface, manuel et prompts IA par défaut (Paramètres → Apparence → Langue) ; les prompts peuvent avoir leur propre langue (Paramètres → Prompts, ou les drapeaux du panneau IA)
- **Manuel intégré** (Paramètres → Manuel) — installer Ollama, une clé API ou Claude Code CLI, et utiliser l'app pas à pas
- **Icône près de l'horloge** — fermer la fenêtre garde NATIA active pour les rappels ; lancement avec Windows en option
- **Export d'une note** en Markdown, texte, HTML ou PDF
- **Statistiques**, **thèmes**, **dé à 20 faces**
- **Mises à jour automatiques**

---

## Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+N` | Nouvelle note |
| `Ctrl+F` | Rechercher dans la note |
| `Ctrl+Shift+F` | Recherche globale |
| `Ctrl+P` | Quick open |
| `Ctrl+,` | Paramètres |
| `Ctrl+G` | Vue graphe |
| `Ctrl+Shift+A` | Panneau IA |
| `Ctrl+Shift+H` | Historique des versions |
| `Ctrl+/` | Liste des raccourcis |
| `Alt+←` / `Alt+→` | Note précédente / suivante |
| `Échap` | Fermer le panneau actif / quitter le mode focus |

---

## Stack technique

| Couche | Technologie |
|---|---|
| Interface | React 18, TypeScript, Tailwind CSS 3 |
| Éditeur | TipTap 2 (ProseMirror) |
| État | Zustand |
| Application de bureau | Tauri 2 |
| Backend | Rust (rusqlite, reqwest, chrono, uuid) |
| Chiffrement | aes-gcm (AES-256-GCM), argon2 (Argon2id), keyring (coffre Windows), zip (export AES-256) |
| Base de données | SQLite |
| IA | llama.cpp intégré · Ollama · Claude API · OpenAI · Gemini · Mistral · Claude CLI |
| Plugins Tauri | notification, dialog, opener, updater, single-instance, autostart |
| Build | Vite 5, GitHub Actions |

---

## Développement

Prérequis : [Node.js](https://nodejs.org/) ≥ 20, [Rust](https://www.rust-lang.org/tools/install) stable, [Git](https://git-scm.com/) et, en option, [Ollama](https://ollama.com/).

```bash
git clone https://github.com/Buntasam/NATIA.git
cd NATIA/fablenote
npm install
npm run tauri dev
```

Le frontend tourne sur `http://localhost:1420` et Tauri ouvre la fenêtre de l'app.

Pour vérifier une modification :

```bash
npx tsc --noEmit
npm run build
cd src-tauri && cargo test --no-default-features --lib
```

Pour compiler l'app sans installeur : `npm run tauri build -- --no-bundle`. Les installeurs officiels sont compilés et signés par GitHub Actions à chaque tag `vX.Y.Z` (voir [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)).

---

## Structure du projet

```
fablenote/
├── src/                              # Frontend React
│   ├── components/
│   │   ├── Layout.tsx                # Orchestrateur, raccourcis, Quick open, conversation
│   │   ├── Sidebar.tsx               # Navigation, recherche, dossiers, vues
│   │   ├── Editor.tsx · Toolbar.tsx  # Éditeur TipTap
│   │   ├── AiPanel.tsx               # Panneau IA
│   │   ├── LockScreen.tsx            # Écran de verrouillage
│   │   ├── Settings.tsx              # Fenêtre des paramètres
│   │   ├── settings/                 # Une catégorie de paramètres par fichier
│   │   ├── TreeMapPanel.tsx · GraphPanel.tsx · CalendarPanel.tsx
│   │   ├── VersionTree.tsx · TrashPanel.tsx · StatsPanel.tsx
│   │   ├── PostItsPanel.tsx · BackupReminder.tsx · CloudAiNotice.tsx
│   │   └── ai/                       # Modale de correction, boutons, trace de debug
│   ├── extensions/                   # Extensions TipTap (post-it, wikilink, rappel)
│   ├── lib/                          # aiInvoke, lockSafely, updater, backupReminder…
│   ├── store/index.ts                # État global Zustand
│   └── types/index.ts                # Types TypeScript
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                    # Point d'entrée Tauri, AppState, réinitialisation
│   │   ├── notes.rs                  # Notes, dossiers, versions, corbeille, export/import, recherche
│   │   ├── settings.rs               # Paramètres, clés API, mot de passe, blocage
│   │   ├── ai.rs                     # Fournisseurs IA
│   │   ├── crypto.rs                 # AES-256-GCM, Argon2id
│   │   ├── db.rs                     # Schéma SQLite, coffre Windows
│   │   └── system_lock.rs            # Verrouillage avec la session Windows
│   ├── capabilities/default.json     # Permissions Tauri
│   └── tauri.conf.json               # Fenêtre, installeur, mises à jour
└── vite.config.ts
```

Le détail de l'architecture est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Sécurité et chiffrement

Sans mot de passe, les notes sont stockées **en clair**. Dès qu'un mot de passe est activé (Paramètres → Sécurité), NATIA chiffre toutes les données personnelles :

- **Algorithmes** — Argon2id (64 Mo, 3 itérations) pour dériver la clé du mot de passe ; AES-256-GCM avec un nonce aléatoire par valeur pour les données.
- **Clé liée au PC** — un secret rangé dans le coffre d'identifiants Windows entre dans le calcul : une copie de vos données ne peut pas être ouverte sur un autre PC, même avec le bon mot de passe.
- **Clé de récupération** — donnée une seule fois à l'activation du mot de passe (ou plus tard dans Paramètres → Sécurité). Elle n'est pas liée au PC : après une réinstallation de Windows, un changement de PC ou un oubli, « Mot de passe oublié ou nouveau PC ? » sur l'écran de verrouillage permet de rouvrir les notes et de choisir un nouveau mot de passe. Conservez-la hors de NATIA.
- **Ce qui reste en clair** — les dates et le nombre de notes, ainsi que les post-its de l'écran de verrouillage.
- **IA en ligne** — le texte envoyé à Claude, OpenAI, Gemini ou Mistral quitte votre PC. Utilisez Ollama pour que tout reste local.

Un PIN se devine plus facilement qu'un mot de passe : pour des notes sensibles, préférez un mot de passe long.

---

## Configuration de l'IA

### IA intégrée (recommandée)
Paramètres → Intelligence artificielle → **Installer l'IA intégrée**. NATIA télécharge le moteur [llama.cpp](https://github.com/ggml-org/llama.cpp) (33 Mo), analyse le PC (RAM, carte graphique) puis télécharge le modèle conseillé :

| Modèle | Taille | Pour |
|---|---|---|
| Gemma 3 1B | 0,8 Go | PC modeste (8 Go de RAM) |
| Gemma 3 4B | 2,5 Go | 16 Go de RAM ou petite carte graphique |
| Phi-4 mini | 2,5 Go | Alternative à Gemma 3 4B |
| Mistral 7B | 4,4 Go | Carte graphique de 6 Go ou plus |
| Gemma 3 12B | 7,3 Go | Carte graphique de 10 Go ou plus |

Le moteur et les modèles viennent de leurs sources officielles et sont vérifiés par leur empreinte SHA-256. Le moteur n'écoute que sur ce PC, avec une clé changée à chaque démarrage. Licences : voir [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

### Ollama (alternative locale)
1. Installer [Ollama](https://ollama.com/) et le lancer.
2. Télécharger un modèle adapté à votre PC, par exemple `ollama pull gemma3:1b`.
3. Dans NATIA : Paramètres → Intelligence artificielle → Ollama, puis indiquer le modèle.

| Votre PC | Modèles conseillés |
|---|---|
| 8 Go de RAM, sans carte graphique | `gemma3:1b`, `qwen2.5:1.5b` |
| 16 Go de RAM | `phi4-mini`, `llama3.2:3b`, `gemma3:4b` |
| Carte graphique avec 8 Go de mémoire vidéo ou plus | `mistral`, `llama3.1:8b` |

Ce sont des repères : un modèle trop gros pour la machine peut mettre plusieurs minutes à répondre.

### Fournisseurs en ligne
Dans Paramètres → Intelligence artificielle → Clés API & connexions, ajouter une clé API (Claude, OpenAI, Gemini, Mistral). La connexion apparaît ensuite dans le sélecteur du panneau IA.

---

## Données utilisateur

Les données sont dans `%APPDATA%\com.natia.app\` :

- `natia.db` — base SQLite (notes, dossiers, versions, paramètres, clés API, configuration de sécurité)
- `notes\` — contenu des notes en HTML (chiffré si un mot de passe est actif)
- `llm\` — moteur et modèles de l'IA intégrée (aucune donnée personnelle)
- `terms.json` — version et date d'acceptation des conditions d'utilisation

Pour sauvegarder ou changer de PC, le plus simple est l'export protégé. Une copie de ce dossier fonctionne aussi, mais sur un autre PC elle ne s'ouvre qu'avec la clé de récupération.

---

## Confidentialité et conditions d'utilisation

NATIA ne collecte aucune donnée : pas de compte, pas de statistiques, pas de publicité. Des données ne quittent le PC que lorsque l'utilisateur s'en sert : texte envoyé à une IA en ligne, recherche de mises à jour et téléchargement de l'IA intégrée (GitHub, Hugging Face), dictée vocale.

Les conditions d'utilisation et la politique de confidentialité (RGPD) doivent être acceptées au premier lancement, après une réinitialisation et à chaque changement de leur contenu. Elles se relisent dans Paramètres → Confidentialité, avec les moyens d'exercer ses droits (export, effacement).

---

## Contribuer

Voir [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## Licence

NATIA est publié sous une **licence « code source consultable »** : le code est public, mais NATIA n'est pas un logiciel libre. Voir le fichier [LICENSE](LICENSE) pour le texte complet.

En résumé :

- ✅ Utiliser NATIA pour un usage personnel et non commercial
- ✅ Lire et étudier le code, le modifier pour votre usage personnel
- ✅ Forker le dépôt pour proposer vos améliorations via une pull request
- ❌ Toute utilisation commerciale sans accord
- ❌ Redistribuer NATIA ou une version modifiée ailleurs que sur ce dépôt, même gratuitement

Pour toute autre demande, ouvrez une [issue](https://github.com/Buntasam/NATIA/issues).
