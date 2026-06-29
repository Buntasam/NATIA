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

> Application de prise de notes locale avec IA multi-provider, versionnage Git, chiffrement AES-256-GCM et support du dark mode.

NATIA est une application de bureau **cross-platform** (Windows, macOS, Linux) construite avec **Tauri 2** (backend Rust) et **React 18** (frontend TypeScript). Toutes les données sont stockées localement — aucun cloud requis.

---

## Fonctionnalités

### Éditeur
- **Éditeur riche** — TipTap avec support Markdown, titres, listes, blocs de code, tâches, surlignage, tableaux, images
- **Post-its** — blocs repositionnables colorés dans la note
- **Wikilinks** — liens `[[Titre de note]]` avec navigation directe
- **Rappels** — blocs de rappel avec date/heure, notifications Windows natives à l'échéance
- **Mode focus** — éditeur plein écran sans sidebar (`Échap` pour quitter)
- **Mode présentation** — diaporama slide par slide sur le contenu de la note
- **Auto-save** — sauvegarde automatique avec debounce (1,5 s contenu / 600 ms titre)
- **Confirmation de fermeture** — dialogue de confirmation + indicateur de sauvegarde avant quitter

### Organisation
- **Dossiers hiérarchiques** — arborescence de dossiers imbriqués avec glisser-déposer
- **Vue arborescence** — panneau maillage (├──/└──) de tous les dossiers et notes
- **Vue graphe** — graphe interactif des wikilinks entre notes
- **Vue calendrier** — visualisation des notes par date de création/modification
- **Backlinks** — panneau listant toutes les notes qui pointent vers la note active
- **Tags** — étiquettes colorées sur chaque note
- **Corbeille** — suppression avec restauration ou suppression définitive
- **Templates** — modèles de notes réutilisables

### IA multi-provider
- **Ollama** — IA locale (Gemma, Phi, Qwen, Llama, Mistral…)
- **Claude API** — Anthropic (claude-haiku, claude-sonnet…)
- **OpenAI** — GPT-4o, GPT-4o-mini…
- **Gemini** — Google Gemini 2.0 Flash…
- **Mistral** — Mistral Small, Medium…
- **Claude CLI** — via `claude` CLI local (sans clé API)
- **Connexions personnalisées** — gestionnaire de clés API avec nom, fournisseur, couleur et modèle
- **Opérations** — correction orthographique, résumé, génération de titre, tri automatique, traduction, formalisation en email, continuation de texte
- **Conversation** — panneau chat avec contexte de la note active et historique par note
- **Mémoire IA** — contexte persistant injecté dans les prompts
- **Génération d'image** — via les providers qui le supportent
- **Pull Ollama** — téléchargement de nouveaux modèles directement depuis l'app
- **Streaming** — réponses affichées token par token pour tous les providers
- **Mode debug** — panneau de trace complet (prompt, réponse, temps, modèle)

### Recherche et navigation
- **Recherche plein texte** — recherche dans les titres et contenus en temps réel
- **Quick open** — `Ctrl+P` pour ouvrir une note par nom (notes récentes en priorité)

### Versionnage
- **Versionnage Git** — chaque sauvegarde crée un commit ; navigation dans l'historique et restauration
- **Diff** — comparaison entre versions

### Sécurité et données
- **Chiffrement AES-256-GCM** — toutes les données chiffrées au repos avec dérivation Argon2id
- **Protection par mot de passe** — PIN numérique (4-8 chiffres) ou mot de passe alphanumérique
- **Verrouillage automatique** — verrou après N minutes d'inactivité (configurable)
- **Export ZIP** — export complet ou note par note
- **Dark mode** — thème clair/sombre persistant, synchronisé avec la barre de titre native
- **Hors ligne first** — aucune dépendance cloud, données 100 % locales (SQLite + fichiers HTML)

### Divers
- **Enregistreur vocal** — transcription audio via IA
- **Statistiques** — comptage de mots, notes, activité
- **D20 Roller** — dé à 20 faces intégré
- **Stats globales** — vue d'ensemble de toute la base de notes

---

## Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+N` | Nouvelle note |
| `Ctrl+F` | Rechercher |
| `Ctrl+,` | Paramètres |
| `Ctrl+P` | Quick open |
| `Ctrl+G` | Vue graphe |
| `Ctrl+Shift+A` | Panneau IA |
| `Ctrl+Shift+H` | Historique Git |
| `Échap` | Fermer le panneau actif / quitter le mode focus |

---

## Stack technique

| Couche | Technologie |
|---|---|
| UI | React 18, TypeScript, Tailwind CSS 3 |
| Éditeur | TipTap 2 (ProseMirror) |
| State | Zustand |
| Desktop shell | Tauri 2 |
| Backend | Rust (rusqlite, reqwest, chrono, uuid) |
| Chiffrement | aes-gcm 0.10 (AES-256-GCM), argon2 0.5 (Argon2id), rand 0.8, base64 0.22 |
| Base de données | SQLite |
| Versionnage | Git (via `std::process::Command`) |
| IA | Ollama · Claude API · OpenAI · Gemini · Mistral · Claude CLI |
| Plugins Tauri | tauri-plugin-notification, tauri-plugin-dialog |
| Build | Vite 5 |

---

## Prérequis

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) (stable, via `rustup`)
- [Tauri CLI](https://tauri.app/start/prerequisites/) — installé automatiquement via npm
- [Git](https://git-scm.com/) — nécessaire pour le versionnage des notes
- [Ollama](https://ollama.com/) *(optionnel)* — pour l'IA locale

---

## Installation et développement

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-nom/natia.git
cd natia/fablenote

# 2. Installer les dépendances
npm install

# 3. Lancer en mode développement
npm run tauri dev
```

Le frontend démarre sur `http://localhost:1420` ; Tauri ouvre automatiquement la fenêtre native.

---

## Build de production

```bash
cd fablenote
npm run tauri build
```

Les installeurs (`.msi` Windows, `.dmg` macOS, `.AppImage` Linux) sont générés dans `src-tauri/target/release/bundle/`.

---

## Structure du projet

```
fablenote/
├── src/                          # Frontend React
│   ├── components/
│   │   ├── Layout.tsx            # Orchestrateur principal + QuickOpen + ConvPanel
│   │   ├── Sidebar.tsx           # Navigation, recherche, toggle thème, dossiers, CalendarPanel, GraphPanel
│   │   ├── TreeMapPanel.tsx      # Vue maillage (├──/└──) de l'arborescence
│   │   ├── CalendarPanel.tsx     # Vue calendrier des notes
│   │   ├── GraphPanel.tsx        # Graphe interactif des wikilinks
│   │   ├── BacklinksPanel.tsx    # Panneau des backlinks de la note active
│   │   ├── TemplatesPanel.tsx    # Modèles de notes réutilisables
│   │   ├── LockScreen.tsx        # Écran de verrouillage (PIN / alphanumérique)
│   │   ├── Editor.tsx            # Éditeur TipTap + auto-save + fermeture
│   │   ├── Toolbar.tsx           # Barre de formatage
│   │   ├── AiPanel.tsx           # Panneau IA + ConvPanel + debug trace
│   │   ├── ApiKeysPanel.tsx      # Gestionnaire de connexions IA personnalisées
│   │   ├── ImageGenPanel.tsx     # Génération d'image
│   │   ├── VoiceRecorder.tsx     # Enregistreur vocal + transcription
│   │   ├── VersionTree.tsx       # Historique Git + diff + restauration
│   │   ├── TrashPanel.tsx        # Corbeille avec restauration / suppression définitive
│   │   ├── StatsPanel.tsx        # Statistiques globales
│   │   ├── PresentationMode.tsx  # Mode présentation diaporama
│   │   ├── D20Roller.tsx         # Dé à 20 faces
│   │   ├── ReminderDaemon.tsx    # Daemon de vérification des rappels (notifs système)
│   │   ├── CloseOverlay.tsx      # Confirmation de fermeture + overlay sauvegarde
│   │   ├── Disclaimer.tsx        # Écran d'accueil beta
│   │   └── Settings.tsx          # Paramètres (modèle, prompts, sécurité, éditeur…)
│   ├── extensions/
│   │   ├── PostIt.tsx            # Extension TipTap post-it
│   │   ├── Wikilink.tsx          # Extension TipTap wikilink [[Note]]
│   │   └── Reminder.tsx          # Extension TipTap rappel avec date
│   ├── ai/
│   │   ├── CorrectionModal.tsx   # Modale accepter/refuser la correction IA
│   │   ├── OpButton.tsx          # Bouton d'opération IA
│   │   └── TraceRow.tsx          # Ligne de trace debug IA
│   ├── lib/
│   │   └── aiInvoke.ts           # Abstraction multi-provider (aiChat, aiStream)
│   ├── store/index.ts            # State global Zustand
│   ├── hooks/useOllama.ts        # Hook requêtes Ollama
│   ├── types/index.ts            # Types TypeScript
│   └── index.css                 # Variables CSS (thèmes clair/sombre)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                # Point d'entrée Tauri + types + setup
│   │   ├── notes.rs              # Commandes CRUD notes, dossiers, Git, export
│   │   ├── settings.rs           # Commandes paramètres, clés API, couleurs, sécurité
│   │   ├── ai.rs                 # Commandes IA (Ollama, Claude, OpenAI, Gemini, Mistral, CLI)
│   │   ├── crypto.rs             # AES-256-GCM + Argon2id
│   │   └── db.rs                 # Initialisation SQLite + migrations
│   ├── Cargo.toml                # Dépendances Rust
│   ├── capabilities/default.json # Permissions Tauri (notification, dialog…)
│   └── tauri.conf.json           # Config fenêtre, bundle, sécurité
├── index.html                    # Point d'entrée HTML
├── tailwind.config.js            # Config Tailwind (couleurs CSS variables)
└── vite.config.ts                # Config Vite
```

---

## Sécurité et chiffrement

NATIA chiffre toutes les données au repos dès qu'un mot de passe est activé. Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour le détail complet.

**Algorithmes** :
- **Dérivation de clé** — Argon2id (19 456 KB RAM, 2 itérations, 1 thread) → 64 octets
  - Octets [0..32] : hash de vérification stocké en DB
  - Octets [32..64] : clé AES-256 tenue en RAM uniquement
- **Chiffrement** — AES-256-GCM, nonce aléatoire 12 octets par valeur
- **Format** — `ENC:v1:{nonce_base64}:{ciphertext_base64}`
- **Portée** — titres et tags des notes, contenu HTML, clés API, paramètres, versions de prompts

**Types de mot de passe** :
- **PIN** — 4 à 8 chiffres, pavé numérique, bouton ✓ pour valider
- **Alphanumérique** — mot de passe libre, champ masqué avec toggle œil, Entrée ou bouton pour valider

**Gestion** : Paramètres → Avancé → Sécurité — activer / changer / désactiver / verrouiller maintenant.

---

## Configuration IA

### Ollama (local)
1. Installer et lancer [Ollama](https://ollama.com/)
2. Télécharger un modèle : `ollama pull gemma3:1b` (ou tout autre modèle)
3. Dans NATIA → ⚙️ Paramètres, saisir l'URL Ollama et sélectionner le modèle

> ⚠️ **Note sur les performances** : l'IA locale peut être très lente sur de longues notes. Privilégier des modèles légers : `gemma3:1b`, `phi4-mini`, `qwen2.5:1.5b`.

### Providers cloud
Dans Paramètres → Connexions, ajouter une clé API avec le provider souhaité (Claude, OpenAI, Gemini, Mistral). La connexion devient disponible dans la barre de sélection du panneau IA.

---

## Données utilisateur

Toutes les données sont stockées dans le répertoire de données applicatif de l'OS :

| OS | Chemin |
|---|---|
| Windows | `%APPDATA%\com.fablenote.app\` |
| macOS | `~/Library/Application Support/com.fablenote.app/` |
| Linux | `~/.local/share/com.fablenote.app/` |

- `natia.db` — base SQLite (métadonnées notes, dossiers, paramètres, clés API, config sécurité)
- `notes/` — fichiers HTML des notes + dépôt Git interne (chiffrés si mot de passe activé)

---

## Contribuer

Voir [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) pour le guide de contribution.

---

## Licence

MIT
