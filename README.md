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

> Application de prise de notes locale avec IA intégrée, versionnage Git, chiffrement AES-256-GCM et support du dark mode.

NATIA est une application de bureau **cross-platform** (Windows, macOS, Linux) construite avec **Tauri 2** (backend Rust) et **React 18** (frontend TypeScript). Toutes les données sont stockées localement — aucun cloud requis.

---

## Fonctionnalités

- **Éditeur riche** — TipTap avec support Markdown, titres, listes, blocs de code, tâches, surlignage
- **Organisation en dossiers** — arborescence hiérarchique de dossiers imbriqués
- **Vue arborescence** — panneau visuel maillage (├──/└──) de tous les dossiers et notes, accessible depuis la barre latérale
- **Versionnage Git** — chaque sauvegarde crée un commit ; navigation dans l'historique et restauration
- **IA locale (Ollama)** — correction grammaticale, résumé, génération de titre, tri automatique des notes
- **Recherche** — recherche plein texte par titre en temps réel
- **Tags** — système d'étiquettes sur chaque note
- **Dark mode** — thème clair/sombre persistant, synchronisé avec la barre de titre native
- **Auto-save** — sauvegarde automatique avec debounce (1,5 s contenu / 600 ms titre)
- **Chiffrement AES-256-GCM** — toutes les données chiffrées au repos (notes, clés API, paramètres) avec dérivation Argon2id
- **Protection par mot de passe** — PIN numérique (4-8 chiffres) ou mot de passe alphanumérique ; écran de verrouillage au démarrage
- **Hors ligne first** — aucune dépendance cloud, données 100 % locales (SQLite + fichiers HTML)

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
| IA | Ollama (API HTTP locale) |
| Build | Vite 5 |

---

## Prérequis

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) (stable, via `rustup`)
- [Tauri CLI](https://tauri.app/start/prerequisites/) — installé automatiquement via npm
- [Git](https://git-scm.com/) — nécessaire pour le versionnage des notes
- [Ollama](https://ollama.com/) *(optionnel)* — pour les fonctionnalités IA

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
├── src/                        # Frontend React
│   ├── components/
│   │   ├── Layout.tsx          # Conteneur principal
│   │   ├── Sidebar.tsx         # Navigation, recherche, toggle thème, bouton arborescence
│   │   ├── TreeMapPanel.tsx    # Vue maillage de l'arborescence complète
│   │   ├── LockScreen.tsx      # Écran de verrouillage (PIN / alphanumérique)
│   │   ├── Editor.tsx          # Éditeur TipTap + auto-save
│   │   ├── Toolbar.tsx         # Barre de formatage
│   │   ├── AiPanel.tsx         # Panneau IA (Ollama)
│   │   ├── VersionTree.tsx     # Historique Git + diff
│   │   └── Settings.tsx        # Paramètres (modèle, URL Ollama, prompts, sécurité)
│   ├── store/index.ts          # State global (Zustand) — inclut état sécurité
│   ├── hooks/useOllama.ts      # Hook requêtes Ollama
│   ├── types/index.ts          # Types TypeScript
│   └── index.css               # Variables CSS (thèmes clair/sombre)
├── src-tauri/
│   ├── src/lib.rs              # Toutes les commandes Tauri (CRUD, Git, Ollama, chiffrement, thème)
│   ├── Cargo.toml              # Dépendances Rust
│   └── tauri.conf.json         # Config fenêtre, bundle, sécurité
├── index.html                  # Point d'entrée HTML
├── tailwind.config.js          # Config Tailwind (couleurs CSS variables)
└── vite.config.ts              # Config Vite
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

## Configuration Ollama

1. Installer et lancer [Ollama](https://ollama.com/)
2. Télécharger un modèle : `ollama pull gemma3:1b` (ou tout autre modèle)
3. Dans NATIA → ⚙️ Paramètres, saisir l'URL Ollama (`http://localhost:11434` par défaut) et sélectionner le modèle

---

## Données utilisateur

Toutes les données sont stockées dans le répertoire de données applicatif de l'OS :

| OS | Chemin |
|---|---|
| Windows | `%APPDATA%\com.fablenote.app\` |
| macOS | `~/Library/Application Support/com.fablenote.app/` |
| Linux | `~/.local/share/com.fablenote.app/` |

- `fablenote.db` — base SQLite (métadonnées notes, dossiers, paramètres, config sécurité)
- `notes/` — fichiers HTML des notes + dépôt Git interne (chiffrés si mot de passe activé)

---

## Contribuer

Voir [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) pour le guide de contribution.

---

## Licence

MIT
