# Architecture — NATIA

Ce document décrit les choix d'architecture et le flux de données de NATIA.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                     Fenêtre Tauri                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │                React (WebView2)                  │    │
│  │                                                  │    │
│  │  LockScreen │ Sidebar │ Editor │ AiPanel │ ...   │    │
│  │  TreeMapPanel                                    │    │
│  │               Zustand Store                      │    │
│  └──────────────────┬───────────────────────────────┘   │
│                     │ invoke()                            │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │             Rust / Tauri Commands                 │   │
│  │  CRUD notes │ Git │ Ollama │ Chiffrement │ Thème  │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │  AppState { db, notes_dir, enc_key (RAM) }  │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  └──────┬────────────────────────┬───────────────────┘  │
│         │                        │                        │
│  ┌──────▼────┐          ┌────────▼──────────┐           │
│  │  SQLite   │          │  Fichiers HTML     │           │
│  │  (.db)    │          │  + Git (.git)      │           │
│  │ chiffrés  │          │  chiffrés          │           │
│  └───────────┘          └────────────────────┘           │
└─────────────────────────────────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │   Ollama (local)    │
                │ http://localhost:   │
                │      11434          │
                └─────────────────────┘
```

---

## Couches

### Frontend (React + TypeScript)

**Composants principaux** :

| Fichier | Rôle |
|---|---|
| `Layout.tsx` | Orchestrateur : gère quelle colonne est visible |
| `Sidebar.tsx` | Arborescence dossiers/notes, recherche, toggle thème, bouton arborescence |
| `TreeMapPanel.tsx` | Vue maillage complète (├──/└──) de toute l'arborescence |
| `LockScreen.tsx` | Écran de verrouillage affiché au démarrage si mot de passe actif |
| `Editor.tsx` | Éditeur TipTap, auto-save, tags |
| `Toolbar.tsx` | Boutons de formatage (gras, titres, listes…) |
| `AiPanel.tsx` | Opérations IA + debug panel |
| `VersionTree.tsx` | Navigation dans l'historique Git, diff, restauration |
| `Settings.tsx` | Modal de configuration Ollama, prompts, sécurité |

**State (Zustand)** — `src/store/index.ts` :

Le store est le seul endroit qui appelle `invoke()`. Les composants lisent l'état et appellent des actions du store — jamais `invoke()` directement (sauf `AiPanel` qui gère ses propres appels streaming).

État de sécurité dans le store :
- `isLocked` — vrai si l'app est verrouillée (mot de passe actif non encore saisi)
- `hasPassword` — vrai si un mot de passe a été configuré
- `passwordType` — `"pin"` ou `"alpha"`

**Thème** :

- `isDark` est initialisé depuis `localStorage`
- `toggleTheme()` : met à jour la classe `.dark` sur `<html>` + `localStorage` + appelle `set_window_theme` (Rust) pour la barre de titre native
- `App.tsx` appelle `set_window_theme` au montage pour synchroniser l'état natif dès l'ouverture

---

### Backend (Rust + Tauri)

Toutes les commandes sont dans `src-tauri/src/lib.rs`.

**Catégories** :

| Commandes | Description |
|---|---|
| `get_all_notes`, `get_note`, `create_note`, `update_note`, `rename_note`, `delete_note` | CRUD notes (SQLite + fichiers HTML) |
| `get_folders`, `create_folder`, `delete_folder`, `rename_folder`, `move_note` | Gestion dossiers |
| `get_versions`, `get_version_content`, `restore_version` | Git (via `std::process::Command`) |
| `get_settings`, `update_settings` | Paramètres (SQLite key/value) |
| `ollama_test_simple`, `ollama_chat`, `ollama_models`, `ollama_stream` | Proxy HTTP vers Ollama |
| `set_window_theme` | Thème natif de la fenêtre OS |
| `has_password`, `get_password_type` | Lecture état sécurité |
| `setup_password`, `verify_password`, `change_password`, `remove_password` | Gestion du mot de passe |
| `lock_app` | Efface la clé AES de la RAM (verrouillage) |

**Stockage** :

```
AppDataDir/
├── fablenote.db          ← SQLite
│   ├── notes             (id, title*, tags*, folder, timestamps)
│   ├── folders           (path)
│   ├── settings          (key, value*)
│   ├── api_keys          (id, name*, provider*, key_value*)
│   ├── prompt_versions   (id, value*)
│   └── app_config        (key, value)  ← salt, hash vérif, type mdp
└── notes/
    ├── {uuid}.html*      ← Contenu HTML des notes
    └── .git/             ← Dépôt Git interne pour le versionnage
```

*\* Champs chiffrés AES-256-GCM quand un mot de passe est actif.*

**Versionnage Git** :

À chaque `update_note`, le backend :
1. Écrit le fichier HTML
2. Exécute `git add {id}.html && git commit -m "Update: {title}"`

`get_versions` fait un `git log`, `restore_version` fait un `git checkout {hash} -- {id}.html`.

---

## Sécurité et chiffrement

### Dérivation de clé (Argon2id)

```
mot de passe (str)  +  salt aléatoire 32 octets
         │
         ▼
    Argon2id
    mem: 19 456 KB
    iter: 2
    threads: 1
    output: 64 octets
         │
    ┌────┴────────────────┐
    │                     │
 [0..32]              [32..64]
 hash vérif           clé AES-256
 → stocké DB          → RAM uniquement
   app_config           (AppState.enc_key)
```

Le hash de vérification est comparé en temps constant (`subtle::ConstantTimeEq`) à chaque tentative de déverrouillage.

### Chiffrement des données (AES-256-GCM)

Chaque valeur est chiffrée indépendamment :

```
plaintext  +  nonce aléatoire 12 octets  +  clé AES [32..64]
         │
         ▼
    AES-256-GCM
         │
         ▼
"ENC:v1:{nonce_base64}:{ciphertext_base64}"
```

La présence du préfixe `ENC:v1:` permet de distinguer les données chiffrées des données en clair (compatibilité migration).

### Migration des données

- **Activation** (`setup_password`) : toutes les données existantes sont chiffrées sur place.
- **Désactivation** (`remove_password`) : toutes les données sont déchiffrées sur place.
- **Changement** (`change_password`) : déchiffrement avec l'ancienne clé → re-chiffrement avec la nouvelle.

### Cycle de vie de la clé

```
Démarrage app
  → checkSecurity() → has_password ?
      Non → données accessibles directement
      Oui → LockScreen affiché

Saisie du mot de passe
  → verify_password(password)
    → Argon2id derive 64 bytes
    → compare [0..32] avec hash en DB
    → si OK : stocke [32..64] dans AppState.enc_key (RAM)
    → isLocked = false → données chargées

Verrouillage
  → lock_app()
    → AppState.enc_key ← None  (clé effacée de la RAM)
    → isLocked = true → LockScreen réaffiché
```

---

## Flux de données — sauvegarde d'une note

```
Editor (onChange) 
  → debounce 1500ms
  → store.updateNote(id, title, content, tags, folder)
    → invoke("update_note", {...})
      → Rust: maybe_enc(enc_key, title), maybe_enc(enc_key, content)
      → Rust: écrit le .html (potentiellement chiffré)
      → Rust: git add + git commit
      → retourne Note (déchiffrée pour affichage)
    → store met à jour activeNote + notes[]
```

---

## Flux de données — opération IA (streaming)

```
AiPanel (clic "Corriger")
  → invoke("ollama_stream", { url, model, system, user })
    → Rust: POST /api/chat vers Ollama
    → Rust: émet "ollama-chunk" à chaque token
    → Rust: émet "ollama-done" en fin
  → AiPanel écoute "ollama-chunk" via listen()
  → accumule les tokens dans le state local
  → affiche le résultat progressivement
```

---

## Vue arborescence (TreeMapPanel)

Le `TreeMapPanel` reconstruit l'arborescence en mémoire à partir de `notes[]` et `folders[]` du store Zustand — aucun appel réseau supplémentaire.

Algorithme de rendu des connecteurs ├──/└── :

```
parentLines: boolean[]  →  un booléen par niveau de profondeur
  true  = le niveau a encore des frères après lui  →  barre verticale │
  false = c'est le dernier enfant                  →  espace

Pour chaque nœud :
  isLast ? "└──" : "├──"
  childLines = depth === 0 ? [] : [...parentLines, !isLast]
```

---

## Thème natif (dark mode barre de titre)

Tauri 2 expose `Window::set_theme(Some(Theme::Dark | Theme::Light))` qui appelle l'API DWM sur Windows (ou équivalent macOS/Linux) pour colorier la barre de titre de la fenêtre native.

Le cycle est :

1. `index.html` — script inline applique `.dark` sur `<html>` avant le premier rendu (évite le flash)
2. `App.tsx` — `useEffect([isDark])` appelle `set_window_theme` dès le montage
3. `store.toggleTheme()` — appelle `set_window_theme` à chaque bascule

Les trois ensemble garantissent que le CSS de l'app et la barre de titre native sont toujours synchronisés.
