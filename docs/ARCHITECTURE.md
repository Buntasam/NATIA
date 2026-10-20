# Architecture — NATIA

Ce document décrit les choix d'architecture et le flux de données de NATIA. Il s'adresse aux personnes qui veulent comprendre ou modifier le code.

---

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────┐
│                          Fenêtre Tauri                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     React (WebView2)                        │  │
│  │  LockScreen │ Sidebar │ Editor │ AiPanel │ ConvPanel        │  │
│  │  Settings (src/components/settings/*) │ panneaux à la demande│  │
│  │  ReminderDaemon │ BackupReminder │ CloseOverlay             │  │
│  │                      Zustand Store                          │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
│                            │ invoke() / événements               │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │                  Rust / commandes Tauri                     │  │
│  │  notes.rs │ settings.rs │ ai.rs │ crypto.rs │ db.rs         │  │
│  │  system_lock.rs (thread de surveillance de la session)      │  │
│  │  AppState { db, notes_dir, enc_key, lock_request,           │  │
│  │             search_cache }                                  │  │
│  └──────┬──────────────────────┬──────────────────┬───────────┘  │
│  ┌──────▼──────┐     ┌─────────▼────────┐  ┌──────▼───────────┐  │
│  │ SQLite      │     │ Fichiers HTML    │  │ Coffre Windows   │  │
│  │ natia.db    │     │ notes/{id}.html  │  │ (clés API,       │  │
│  │             │     │                  │  │  secret appareil)│  │
│  └─────────────┘     └──────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
               │
   ┌───────────┴─────────────────────────────────────┐
   │                Fournisseurs IA                   │
   │  Ollama (local) · Claude API · OpenAI            │
   │  Gemini · Mistral · Claude CLI                   │
   └──────────────────────────────────────────────────┘
```

NATIA est développée et testée sous **Windows**. Le verrouillage avec la session Windows et le coffre d'identifiants n'ont pas d'équivalent testé sous macOS et Linux.

---

## Frontend (React + TypeScript)

### Composants principaux

| Fichier | Rôle |
|---|---|
| `App.tsx` | Vérification du mot de passe au démarrage, chargement des données, vérification des mises à jour, écoute du verrouillage système |
| `Layout.tsx` | Orchestrateur : panneaux visibles, raccourcis clavier, Quick open, ConvPanel, verrouillage après inactivité |
| `Sidebar.tsx` | Arborescence dossiers/notes, recherche, boutons Arborescence / Mémoire IA / Calendrier / Post-its |
| `Editor.tsx` | Éditeur TipTap, enregistrement automatique, import `.md` / `.txt` |
| `Toolbar.tsx` | Boutons de formatage (gras, titres, listes, wikilinks, rappels…) |
| `AiPanel.tsx` | Opérations IA, sélecteur de fournisseur / connexion, trace de debug |
| `ApiKeysPanel.tsx` | Connexions IA par clé API (nom, fournisseur, couleur, modèle) |
| `CloudAiNotice.tsx` | Bandeau « IA en ligne : le texte part chez… » quand l'IA n'est pas locale |
| `LockScreen.tsx` | Écran de verrouillage (PIN ou mot de passe), post-its, bouton de réinitialisation |
| `ResetConfirmDialog.tsx` | Confirmation de la réinitialisation complète |
| `PostItsPanel.tsx` | Gestion des post-its de l'écran de verrouillage depuis l'app |
| `BackupReminder.tsx` | Rappel hebdomadaire de sauvegarde |
| `Disclaimer.tsx` | Avertissements au premier lancement (bêta, chiffrement, IA locale) |
| `Settings.tsx` | Fenêtre des paramètres : navigation, formulaire, enregistrement |
| `settings/*.tsx` | Une catégorie de paramètres par fichier (Apparence, IA, Prompts, Mémoire, Sécurité, Données, Application) |
| `TreeMapPanel.tsx`, `CalendarPanel.tsx`, `GraphPanel.tsx` | Vues arborescence, calendrier, graphe |
| `BacklinksPanel.tsx`, `TemplatesPanel.tsx` | Notes qui pointent vers la note active, modèles de notes |
| `VersionTree.tsx` | Historique des versions d'une note, comparaison, restauration |
| `TrashPanel.tsx`, `StatsPanel.tsx` | Corbeille, statistiques |
| `VoiceRecorder.tsx`, `D20Roller.tsx` | Enregistreur vocal, dé à 20 faces |
| `ReminderDaemon.tsx` | Vérifie les rappels toutes les 60 s et envoie une notification Windows |
| `CloseOverlay.tsx` | Confirmation de fermeture + enregistrement avant de quitter |

`PresentationMode.tsx` et `ImageGenPanel.tsx` existent mais ne sont reliés à aucun bouton pour l'instant.

**Chargement à la demande** : `Settings`, `VersionTree`, `TrashPanel`, `ShortcutsOverlay`, `TreeMapPanel`, `CalendarPanel`, `PostItsPanel` et `GraphPanel` sont chargés avec `React.lazy` à leur première ouverture, pour alléger le démarrage (le graphe embarque `d3`).

### Extensions TipTap

| Fichier | Rôle |
|---|---|
| `extensions/PostIt.tsx` | Bloc post-it coloré repositionnable dans une note |
| `extensions/Wikilink.tsx` | Lien `[[Titre]]` avec navigation directe |
| `extensions/Reminder.tsx` | Bloc rappel avec date/heure et état (fait / en attente) |

### Utilitaires (`src/lib/`)

| Fichier | Rôle |
|---|---|
| `aiInvoke.ts` | `aiChat()` / `aiStream()` : route vers la bonne commande Rust selon le fournisseur |
| `lockSafely.ts` | Enregistre la note en cours, puis verrouille |
| `updater.ts` | Vérification et installation des mises à jour |
| `backupReminder.ts` | Dates de dernière sauvegarde, report du rappel |
| `lockPostIts.ts` | Stockage des post-its de l'écran de verrouillage (localStorage, en clair par conception) |
| `memoryContext.ts` | Construit le contexte « mémoire IA » ajouté aux prompts |
| `markdown.ts` | Conversion Markdown → HTML |

### State (Zustand) — `src/store/index.ts`

Les actions sur les notes, dossiers, paramètres et la sécurité passent par le store. Certains composants appellent aussi `invoke()` directement pour des besoins locaux (IA en streaming, export/import, mises à jour).

État principal :
- `notes`, `folders`, `activeNote` — données des notes
- `settings` — paramètres (fournisseur IA, prompts, éditeur…)
- `isLocked`, `hasPassword`, `passwordType` — sécurité
- `memoryNodes` — mémoire IA, chargée depuis le backend après déverrouillage et vidée au verrouillage
- `theme`, `isDark` — thème
- `showAiPanel`, `showVersionPanel`, `showSettings`, `showTrash`, `focusMode` — panneaux visibles
- `isConfirmingClose`, `isClosingApp`, `closeOverlayDone` — flux de fermeture

---

## Backend (Rust + Tauri)

```
src-tauri/src/
├── lib.rs          ← types, AppState, setup, invoke_handler, reset_app, exit_app
├── notes.rs        ← notes, dossiers, versions, corbeille, export/import, recherche, rappels
├── settings.rs     ← paramètres, clés API, couleurs, données utilisateur, mot de passe, blocage
├── ai.rs           ← fournisseurs IA (chat + streaming)
├── crypto.rs       ← AES-256-GCM, Argon2id, chiffrement/déchiffrement de toute la base
├── db.rs           ← schéma SQLite, coffre d'identifiants, couleurs, versions
└── system_lock.rs  ← verrouillage quand la session Windows se verrouille ou sort de veille
```

Les commandes de dossiers, corbeille, export et recherche délèguent à des fonctions qui prennent une connexion SQLite brute (`*_in`, `search_rows`…) : elles sont testables sans Tauri.

### Commandes — `notes.rs`

| Commande | Description |
|---|---|
| `get_all_notes`, `get_note` | Lecture (SQLite + HTML déchiffrés) |
| `create_note`, `update_note`, `rename_note`, `delete_note`, `move_note` | Écriture des notes |
| `get_folders`, `create_folder`, `delete_folder`, `rename_folder` | Dossiers (filtrage fait en Rust, les chemins étant chiffrés) |
| `get_versions`, `get_version_content`, `restore_version`, `trim_note_versions` | Historique des versions |
| `get_trash`, `restore_from_trash`, `permanent_delete_item`, `empty_trash` | Corbeille |
| `save_zip_to_path`, `export_note_to_path`, `reveal_data_dir` | Export |
| `inspect_import`, `import_zip` | Import des trois formats d'export |
| `search_notes` | Recherche plein texte (asynchrone, avec cache) |
| `get_global_stats`, `get_all_reminders` | Statistiques, rappels |

### Commandes — `settings.rs`

| Commande | Description |
|---|---|
| `get_settings`, `update_settings` | Paramètres |
| `get_prompt_versions`, `delete_prompt_version` | Historique des prompts |
| `get_api_keys`, `upsert_api_key`, `delete_api_key` | Connexions IA |
| `get_colors`, `set_color`, `delete_color` | Couleurs des notes et dossiers |
| `get_user_data`, `set_user_data` | Mémoire IA, bibliothèque de prompts |
| `has_password`, `get_password_type`, `get_lock_status` | État de la sécurité |
| `setup_password`, `verify_password`, `change_password`, `remove_password`, `lock_app` | Gestion du mot de passe |
| `set_window_theme` | Couleur de la barre de titre Windows |

### Commandes — `ai.rs`

| Commande | Description |
|---|---|
| `ollama_test_simple`, `ollama_chat`, `ollama_models`, `ollama_stream`, `ollama_pull` | Ollama |
| `claude_chat`, `claude_stream`, `openai_chat`, `openai_stream`, `gemini_chat`, `gemini_stream`, `mistral_chat`, `mistral_stream` | API en ligne |
| `connection_chat`, `connection_stream` | Connexion par clé API enregistrée |
| `check_claude_cli`, `claude_cli_chat`, `claude_cli_stream` | Claude Code CLI |
| `generate_image` | Génération d'image (non reliée à l'interface pour l'instant) |

Tous les fournisseurs diffusent leur réponse avec les événements `ollama-token` puis `ollama-done`.

### Commandes — `lib.rs`

| Commande | Description |
|---|---|
| `reset_app` | Supprime toutes les données, vide le coffre et recrée une base vide |
| `toggle_maximize_window`, `exit_app` | Fenêtre, fermeture après enregistrement |

---

## Stockage

```
%APPDATA%\com.natia.app\
├── natia.db
│   ├── notes            (id, title*, tags*, folder*, created_at, updated_at, deleted_at)
│   ├── folders          (path*, deleted_at)
│   ├── note_versions    (id, note_id, content*, message*, created_at) — 200 versions max par note
│   ├── settings         (key, value*)
│   ├── api_keys         (id, name*, provider*, key_value*, color, model)
│   ├── prompt_versions  (id, prompt_key, value*, saved_at)
│   ├── item_colors      (item_key*, color)
│   ├── user_data        (key, value*) — mémoire IA, bibliothèque de prompts
│   └── app_config       (key, value) — sel, hash de vérification, DEK chiffrée,
│                                       device_bound, failed_attempts, lock_until…
└── notes\
    └── {uuid}.html*     ← contenu des notes
```

*\* Chiffré en AES-256-GCM quand un mot de passe est actif.* Restent en clair : les dates, le nombre de notes, les couleurs et modèles des connexions, les post-its de l'écran de verrouillage (localStorage).

La base utilise `PRAGMA secure_delete = ON`, et un `VACUUM` est lancé à l'activation du mot de passe : aucune ancienne valeur en clair ne reste dans le fichier.

Sans mot de passe, les clés API des fournisseurs (Paramètres → IA) sont rangées dans le coffre d'identifiants Windows plutôt qu'en base.

Les anciennes versions de NATIA versionnaient les notes avec un dépôt Git interne (`notes\.git`). Il n'est plus utilisé : il est supprimé au démarrage s'il existe.

---

## Sécurité et chiffrement

### Clés

```
mot de passe + sel aléatoire (16 octets) + secret de l'appareil
                     │
                     ▼
     Argon2id — 64 Mo, 3 itérations, 1 fil, 64 octets en sortie
                     │
          ┌──────────┴──────────┐
       [0..32]               [32..64]
    hash de vérification       KEK
    (app_config)                │ déchiffre
                                ▼
                     DEK (clé aléatoire de 32 octets,
                     stockée chiffrée dans app_config)
                                │
                                ▼
                   chiffre toutes les données (AES-256-GCM)
```

- **DEK / KEK** : les données sont chiffrées avec une clé aléatoire (DEK). Le mot de passe ne sert qu'à chiffrer cette clé (KEK). Changer de mot de passe ne rechiffre donc que la DEK, pas toutes les notes.
- **Secret de l'appareil** : un secret aléatoire de 32 octets, rangé dans le coffre d'identifiants Windows (`com.natia.app` / `device_secret`), est passé à Argon2 comme « secret » (pepper). Une base copiée sur une autre machine ne permet de tester aucun mot de passe. Contrepartie : réinstaller Windows ou changer de compte rend les données illisibles, d'où l'export protégé.
- **Migration** : une base créée sans secret d'appareil est liée au premier déverrouillage réussi.
- **Comparaison** du hash de vérification en temps constant (OU exclusif cumulé).
- Les écritures de sel, hash et DEK se font dans une seule transaction.

### Format d'une valeur chiffrée

```
"ENC:v1:{nonce_base64}:{ciphertext_base64}"   ← nonce aléatoire de 12 octets par valeur
```

Le préfixe distingue les valeurs chiffrées des valeurs en clair, ce qui permet d'activer ou de retirer le mot de passe sur une base existante. Les chemins de dossiers étant chiffrés avec un nonce aléatoire, aucune comparaison n'est possible en SQL : le filtrage des dossiers (sous-dossiers, renommage, corbeille) se fait en Rust après déchiffrement.

### Activation, changement, retrait

- `setup_password` : génère la DEK, chiffre toute la base et les fichiers (`encrypt_all_data`), puis `VACUUM`.
- `change_password` : rechiffre seulement la DEK avec le nouveau mot de passe ; le type (PIN / alphanumérique) est enregistré.
- `remove_password` : déchiffre toute la base (`decrypt_all_data`) et supprime le secret de l'appareil.

### Blocage après échecs

Le compteur (`failed_attempts`) et la fin de blocage (`lock_until`, heure Unix) sont stockés en base. La tentative est comptée **avant** la vérification : interrompre l'app pendant le calcul Argon2 ne permet pas d'esquiver le compteur.

| Échecs consécutifs | Blocage |
|---|---|
| 1 à 4 | aucun |
| 5 à 9 | 30 s, 1, 2, 4, 8 min |
| 10 et plus | 15 min, doublé à chaque échec, 24 h maximum |

### Verrouillage

- **Inactivité** : `Layout.tsx`, délai réglable dans Paramètres → Sécurité.
- **Session Windows** : `system_lock.rs` vérifie chaque seconde si la session est verrouillée (`WTSQuerySessionInformationW`) ou si le PC sort de veille (écart entre `GetTickCount64` et `QueryUnbiasedInterruptTime`). Il émet `system-lock` ; l'interface enregistre puis verrouille. Si elle ne l'a pas fait en 5 s, la clé est effacée d'office.
- Au verrouillage : la DEK est effacée de la mémoire (`zeroize`), le cache de recherche est vidé, la mémoire IA est retirée du store.
- Les commandes qui écrivent du contenu (notes, dossiers, paramètres, clés API, couleurs, mémoire IA, import) refusent de s'exécuter tant que l'app est verrouillée (`require_unlocked`), pour ne jamais écrire en clair une donnée qui devrait être chiffrée.

---

## Flux — enregistrement d'une note

```
Editor (onChange)
  → délai selon le mode d'enregistrement (auto 1,5 s · équilibré 5 s · manuel)
  → store.updateNote(...)
    → invoke("update_note")
      → Rust : chiffre titre, tags, dossier et contenu (si mot de passe)
      → Rust : écrit notes\{id}.html
      → Rust : ajoute une version dans note_versions
      → renvoie la note déchiffrée
```

## Flux — fermeture de l'app

```
Clic sur [X] → onCloseRequested → preventDefault
  → CloseOverlay « Quitter NATIA ? »
  → Quitter : enregistre la note (callSaveNow), attend la fin (5 s max)
  → invoke("exit_app") → app_handle.exit(0)
```

`app_handle.exit(0)` est la méthode fiable en Tauri v2 depuis un handler `onCloseRequested` asynchrone : `win.close()` et `win.destroy()` redéclenchent l'événement.

## Flux — opération IA

```
AiPanel → aiStream(settings, system, message)
  → lib/aiInvoke.ts choisit la commande selon le fournisseur
  → Rust envoie la requête et émet « ollama-token » à chaque morceau, puis « ollama-done »
  → AiPanel accumule la réponse ; CorrectionModal propose Accepter / Refuser / Copier
```

Avec un fournisseur en ligne, le texte envoyé quitte la machine : `CloudAiNotice` l'indique dans le panneau IA et la conversation.

## Recherche

`search_notes` est asynchrone (hors du fil principal). Le texte déchiffré de chaque note est gardé dans `AppState.search_cache`, invalidé quand la taille ou la date du fichier change, et vidé à chaque verrouillage. La recherche ignore la casse caractère par caractère, ce qui gère les lettres accentuées.

## Export et import

| Format | Contenu | Ouverture |
|---|---|---|
| Classique | ZIP : `notes/{dossier}/{titre}.html` + `metadata.json` | Tout outil ZIP |
| Protégé (AES-256) | ZIP chiffré contenant un seul fichier `NATIA-notes.zip` (le ZIP classique) | 7-Zip |
| Compatible Windows | Même structure, chiffrement ZipCrypto (faible) | Explorateur Windows |

Le ZIP interne cache les titres et noms de dossiers, que le format ZIP laisse sinon lisibles. L'import (`import_zip`) relit les trois formats, conserve les identifiants (les wikilinks restent valides), ignore les notes déjà présentes, nettoie le HTML avec `ammonia` et limite l'archive à 1 Go.

## Rappels

`ReminderDaemon` appelle `get_all_reminders` toutes les 60 s. Le backend parcourt le HTML des notes à la recherche des blocs `<div data-type="reminder">` et renvoie ceux qui sont dus ; une notification Windows est envoyée une seule fois par rappel.

## Mises à jour et releases

- `tauri-plugin-updater` lit `https://github.com/Buntasam/NATIA/releases/latest/download/latest.json`. Les mises à jour sont signées ; la clé publique est dans `tauri.conf.json`.
- Le workflow `.github/workflows/release.yml` se déclenche sur un tag `vX.Y.Z` : tests Rust, version de l'app tirée du tag, compilation, signature, création d'un brouillon de release. Le brouillon doit être publié comme release normale (pas « pre-release »).
- La clé privée de signature est un secret GitHub (`TAURI_SIGNING_PRIVATE_KEY`) ; elle ne doit jamais être commitée.

## Thème natif

`index.html` applique la classe `.dark` avant le premier rendu (pas de flash), puis `App.tsx` appelle `set_window_theme` à chaque changement de thème pour accorder la barre de titre Windows.
