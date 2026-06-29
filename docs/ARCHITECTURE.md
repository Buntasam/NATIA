# Architecture — NATIA

Ce document décrit les choix d'architecture et le flux de données de NATIA.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         Fenêtre Tauri                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    React (WebView2)                       │   │
│  │                                                           │   │
│  │  LockScreen │ Sidebar │ Editor │ AiPanel │ ConvPanel      │   │
│  │  TreeMapPanel │ CalendarPanel │ GraphPanel │ BacklinksPanel│   │
│  │  VersionTree │ TrashPanel │ Settings │ StatsPanel         │   │
│  │  ReminderDaemon │ CloseOverlay │ D20Roller                │   │
│  │                    Zustand Store                          │   │
│  └───────────────────────┬────────────────────────────────────┘  │
│                          │ invoke()                               │
│  ┌───────────────────────▼────────────────────────────────────┐  │
│  │                 Rust / Tauri Commands                      │  │
│  │  notes.rs │ settings.rs │ ai.rs │ crypto.rs │ db.rs        │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  AppState { db, notes_dir, enc_key (RAM) }           │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └──────┬──────────────────────────┬──────────────────────────┘  │
│         │                          │                              │
│  ┌──────▼────┐           ┌─────────▼──────────┐                 │
│  │  SQLite   │           │  Fichiers HTML      │                 │
│  │  (.db)    │           │  + Git (.git)       │                 │
│  │ chiffrés  │           │  chiffrés           │                 │
│  └───────────┘           └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
              │
   ┌──────────┴──────────────────────────────────────┐
   │             Providers IA externes               │
   │  Ollama (local) · Claude API · OpenAI           │
   │  Gemini · Mistral · Claude CLI                  │
   └─────────────────────────────────────────────────┘
```

---

## Couches

### Frontend (React + TypeScript)

**Composants principaux** :

| Fichier | Rôle |
|---|---|
| `Layout.tsx` | Orchestrateur : panneaux visibles, raccourcis clavier, QuickOpen, ConvPanel, auto-lock |
| `Sidebar.tsx` | Arborescence dossiers/notes, recherche, toggle thème, CalendarPanel, GraphPanel |
| `TreeMapPanel.tsx` | Vue maillage complète (├──/└──) de toute l'arborescence |
| `CalendarPanel.tsx` | Vue calendrier des notes par date |
| `GraphPanel.tsx` | Graphe interactif des wikilinks entre notes |
| `BacklinksPanel.tsx` | Notes qui pointent vers la note active |
| `TemplatesPanel.tsx` | Modèles de notes réutilisables |
| `LockScreen.tsx` | Écran de verrouillage affiché au démarrage si mot de passe actif |
| `Editor.tsx` | Éditeur TipTap, auto-save, fermeture avec confirmation |
| `Toolbar.tsx` | Boutons de formatage (gras, titres, listes, wikilinks, rappels…) |
| `AiPanel.tsx` | Opérations IA, sélecteur de connexion, debug trace |
| `ApiKeysPanel.tsx` | Gestionnaire de connexions IA (nom, provider, couleur, modèle) |
| `ImageGenPanel.tsx` | Génération d'image via provider actif |
| `VoiceRecorder.tsx` | Enregistreur vocal avec transcription IA |
| `VersionTree.tsx` | Navigation dans l'historique Git, diff, restauration |
| `TrashPanel.tsx` | Corbeille : restauration ou suppression définitive |
| `StatsPanel.tsx` | Statistiques globales (mots, notes, activité) |
| `PresentationMode.tsx` | Mode diaporama sur le contenu de la note |
| `D20Roller.tsx` | Dé à 20 faces |
| `ReminderDaemon.tsx` | Vérifie les rappels toutes les 60 s, envoie des notifs Windows |
| `CloseOverlay.tsx` | Confirmation de fermeture + spinner/checkmark pendant la sauvegarde |
| `Disclaimer.tsx` | Écran d'accueil beta avec avertissements et tips testeurs |
| `Settings.tsx` | Configuration complète (modèle, prompts, sécurité, éditeur, avancé) |

**Extensions TipTap** :

| Fichier | Rôle |
|---|---|
| `extensions/PostIt.tsx` | Bloc post-it coloré repositionnable |
| `extensions/Wikilink.tsx` | Lien `[[Titre]]` avec navigation directe |
| `extensions/Reminder.tsx` | Bloc rappel avec date/heure et état (fait/en attente) |

**State (Zustand)** — `src/store/index.ts` :

Le store est le seul endroit qui appelle `invoke()` pour les données (sauf `AiPanel` qui gère ses propres appels streaming). Les composants lisent l'état et appellent des actions du store.

État principal :
- `notes`, `folders`, `activeNote` — données notes
- `settings` — paramètres complets (model, prompts, provider…)
- `isLocked`, `hasPassword`, `passwordType` — sécurité
- `theme`, `isDark` — thème
- `showAiPanel`, `showVersionPanel`, `showSettings`, `showTrash`, `focusMode` — panneaux visibles
- `isConfirmingClose`, `isClosingApp`, `closeOverlayDone` — flux de fermeture
- `recentNoteIds` — historique de navigation (Quick open)

**Abstraction IA** — `src/lib/aiInvoke.ts` :

Expose `aiChat()` et `aiStream()` qui routent vers le bon `invoke()` Rust selon le provider actif (ollama, claude, openai, gemini, mistral, connection, claude_cli). Les composants ne gèrent pas le provider directement.

---

### Backend (Rust + Tauri)

Le backend est découpé en modules :

```
src-tauri/src/
├── lib.rs          ← types, AppState, setup, invoke_handler, exit_app
├── notes.rs        ← CRUD notes, dossiers, Git, export, stats, rappels
├── settings.rs     ← paramètres, clés API, couleurs, sécurité, thème
├── ai.rs           ← tous les providers IA (chat + stream)
├── crypto.rs       ← AES-256-GCM, Argon2id, maybe_enc/maybe_dec
└── db.rs           ← init SQLite, migrations, init_git
```

**Commandes — notes.rs** :

| Commande | Description |
|---|---|
| `get_all_notes`, `get_note` | Lecture notes (SQLite + HTML déchiffré) |
| `create_note`, `update_note`, `rename_note`, `delete_note` | CRUD + commit Git |
| `get_folders`, `create_folder`, `delete_folder`, `rename_folder`, `move_note` | Gestion dossiers |
| `get_versions`, `get_version_content`, `restore_version`, `trim_note_versions` | Historique Git |
| `get_trash`, `restore_from_trash`, `permanent_delete_item`, `empty_trash` | Corbeille |
| `reveal_data_dir`, `export_zip`, `save_zip_to_path`, `export_note_to_path` | Export |
| `search_notes` | Recherche plein texte (titre + contenu déchiffré) |
| `get_global_stats` | Statistiques globales |
| `get_all_reminders` | Rappels échus depuis toutes les notes |

**Commandes — settings.rs** :

| Commande | Description |
|---|---|
| `get_settings`, `update_settings` | Paramètres (SQLite key/value) |
| `get_prompt_versions`, `delete_prompt_version` | Historique des versions de prompts |
| `get_api_keys`, `upsert_api_key`, `delete_api_key` | Connexions IA personnalisées |
| `get_colors`, `set_color`, `delete_color` | Couleurs personnalisées |
| `has_password`, `get_password_type` | État sécurité |
| `setup_password`, `verify_password`, `change_password`, `remove_password` | Gestion du mot de passe |
| `lock_app` | Efface la clé AES de la RAM |
| `set_window_theme` | Thème natif de la barre de titre OS |

**Commandes — ai.rs** :

| Commande | Description |
|---|---|
| `ollama_test_simple`, `ollama_chat`, `ollama_models`, `ollama_stream`, `ollama_pull` | Proxy HTTP vers Ollama |
| `claude_chat`, `claude_stream` | Claude API (Anthropic) |
| `openai_chat`, `openai_stream` | OpenAI API |
| `gemini_chat`, `gemini_stream` | Google Gemini API |
| `mistral_chat`, `mistral_stream` | Mistral API |
| `connection_chat`, `connection_stream` | Connexion personnalisée (clé API stockée) |
| `check_claude_cli`, `claude_cli_chat`, `claude_cli_stream` | Claude via CLI local |
| `generate_image` | Génération d'image |

**Commande — lib.rs** :

| Commande | Description |
|---|---|
| `exit_app` | `app_handle.exit(0)` — fermeture OS-level après sauvegarde |

**Stockage** :

```
AppDataDir/
├── natia.db           ← SQLite
│   ├── notes          (id, title*, tags*, folder, timestamps)
│   ├── folders        (path)
│   ├── settings       (key, value*)
│   ├── api_keys       (id, name*, provider*, key_value*, color*, model*)
│   ├── prompt_versions(id, value*)
│   └── app_config     (key, value)  ← salt, hash vérif, type mdp
└── notes/
    ├── {uuid}.html*   ← Contenu HTML des notes (avec rappels, wikilinks, post-its…)
    └── .git/          ← Dépôt Git interne pour le versionnage
```

*\* Champs chiffrés AES-256-GCM quand un mot de passe est actif.*

**Versionnage Git** :

À chaque `update_note`, le backend :
1. Chiffre (si nécessaire) et écrit le fichier HTML
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
    → compare [0..32] avec hash en DB (temps constant)
    → si OK : stocke [32..64] dans AppState.enc_key (RAM)
    → isLocked = false → données chargées

Verrouillage automatique (inactivité)
  → Layout.tsx : timer reset sur mousemove/keydown/pointerdown
  → délai écoulé → lock()
    → AppState.enc_key ← None
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

## Flux de données — fermeture de l'app

```
Utilisateur clique [X]
  → Tauri onCloseRequested → event.preventDefault()
  → setIsConfirmingClose(true)
  → CloseOverlay affiche "Quitter NATIA ?" (Rester / Quitter)

Si Quitter :
  → setIsClosingApp(true)
  → saveNowRef.current?.()  ← flush du debounce TipTap
  → polling isSaving jusqu'à false (max 5 s)
  → setCloseOverlayDone(true)
  → overlay affiche "Sauvegardé !" (1,2 s)
  → invoke("exit_app")
    → Rust: app_handle.exit(0)  ← fermeture OS-level
```

> `app_handle.exit(0)` est la seule méthode fiable en Tauri v2 pour fermer l'app depuis un handler `onCloseRequested` async — `win.close()` et `win.destroy()` déclenchent un nouveau `CloseRequested` event.

---

## Flux de données — opération IA (streaming)

```
AiPanel (clic "Corriger")
  → aiStream(settings, system, userMessage)
    → lib/aiInvoke.ts : sélection du provider actif
    → invoke("ollama_stream" | "claude_stream" | "openai_stream" | ...)
      → Rust: POST vers le provider sélectionné
      → Rust: émet "ollama-token" (ou "claude-token"…) à chaque token
      → Rust: émet "ollama-done" en fin
  → AiPanel écoute via listen()
  → accumule les tokens dans le state local
  → affiche le résultat progressivement
  → CorrectionModal : propose Accepter / Refuser / Copier
```

---

## Rappels et notifications système

```
ReminderDaemon (monté dans Layout)
  → setInterval(check, 60_000)
  → invoke("get_all_reminders")
    → Rust: scanne toutes les notes, parse le HTML pour trouver
            les blocs <div data-type="reminder"> avec data-done=false
    → retourne ReminderItem[]
  → pour chaque rappel échu non encore notifié :
    → sendNotification({ title: note_title, body: text })
       (tauri-plugin-notification → Windows toast)
  → notifiedRef garde la liste des clés déjà notifiées
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
