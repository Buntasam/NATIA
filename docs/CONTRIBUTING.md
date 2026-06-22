# Guide de contribution — NATIA

Merci de vouloir contribuer à NATIA ! Ce document explique comment configurer l'environnement, les conventions de code et le processus de contribution.

---

## Prérequis

- Node.js ≥ 18
- Rust stable (`rustup update stable`)
- Git ≥ 2.30
- Ollama *(optionnel, pour tester les fonctionnalités IA)*

---

## Mise en place locale

```bash
git clone https://github.com/votre-nom/natia.git
cd natia/fablenote
npm install
npm run tauri dev
```

La hot-reload Vite fonctionne pour le frontend. Pour les changements Rust, Tauri recompile automatiquement en mode `dev`.

---

## Architecture décisionnelle

### Pourquoi Tauri et pas Electron ?

Tauri utilise le WebView natif du système (Edge WebView2 sur Windows, WebKit sur macOS/Linux) plutôt qu'un Chromium embarqué. Le binaire final est ~10× plus léger et la consommation mémoire au repos est bien inférieure.

### Pourquoi SQLite pour les métadonnées et HTML pour le contenu ?

- SQLite — requêtes rapides sur titres, tags, dossiers sans charger le contenu
- HTML — format natif de TipTap, facile à versionner ligne par ligne avec Git
- Git interne — chaque sauvegarde est un commit dans `AppDataDir/notes/.git` ; aucun service externe

### Pourquoi Zustand et pas Redux ?

Zustand a une API minimaliste parfaitement adaptée à une app mono-fenêtre sans besoin de middleware ou de reducers.

### Pourquoi chiffrement au niveau des champs (field-level) et pas SQLCipher ?

SQLCipher est une dépendance native qui complique le build cross-platform. Le chiffrement field-level avec AES-256-GCM est portable et évite les dépendances supplémentaires. Le préfixe `ENC:v1:` garantit la compatibilité avec des données non chiffrées (migration transparente).

---

## Conventions de code

### TypeScript (frontend)

- Pas de `any` — typer explicitement via `src/types/index.ts`
- Composants en PascalCase, hooks en `use*`
- Styles via classes Tailwind uniquement (pas de style inline sauf cas exceptionnel)
- Couleurs via les variables CSS (`bg-base`, `text-primary`, etc.) — ne jamais utiliser de couleurs hardcodées
- Pas de `invoke()` dans les composants — passer par le store Zustand

### Rust (backend)

- Chaque commande Tauri doit être déclarée avec `#[tauri::command]` et enregistrée dans `invoke_handler`
- Erreurs retournées sous `Result<_, String>` pour être sérialisables vers le frontend
- Pas de `unwrap()` dans le code de production — utiliser `?` ou `map_err`
- Toujours utiliser `maybe_enc` / `maybe_dec` pour les lectures/écritures de données utilisateur (transparence chiffrement)

### Chiffrement

- La clé AES (`enc_key`) ne doit **jamais** être loggée, sérialisée ou persistée
- Toujours générer un nonce aléatoire frais avec `OsRng` pour chaque valeur chiffrée
- Toutes les comparaisons de hash doivent être en temps constant (`subtle::ConstantTimeEq`)

### Thème / dark mode

Le système de thème repose sur deux mécanismes :

1. **CSS** — classe `.dark` sur `<html>` + variables CSS dans `src/index.css`
2. **Natif** — commande Tauri `set_window_theme(dark: bool)` qui appelle `window.set_theme()` pour synchroniser la barre de titre OS

Toujours appeler les deux lors d'un changement de thème.

---

## Ajouter une commande Tauri

1. Écrire la fonction Rust dans `src-tauri/src/lib.rs` avec `#[tauri::command]`
2. L'ajouter dans `tauri::generate_handler![...]` dans la fonction `run()`
3. L'appeler depuis le frontend avec `invoke("nom_commande", { param: valeur })`

Exemple minimal :

```rust
#[tauri::command]
fn ma_commande(texte: String) -> Result<String, String> {
    Ok(format!("Reçu : {}", texte))
}
```

```ts
import { invoke } from "@tauri-apps/api/core";
const resultat = await invoke<string>("ma_commande", { texte: "bonjour" });
```

Si la commande lit ou écrit des données utilisateur, utiliser `maybe_enc` / `maybe_dec` avec la clé du `AppState` :

```rust
#[tauri::command]
fn ma_commande_chiffree(state: State<AppState>, valeur: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    let key = state.enc_key.lock().unwrap();
    let enc = maybe_enc(&key, &valeur);
    // ... stocker enc en DB ...
    Ok(())
}
```

---

## Ajouter une opération IA

Les opérations IA sont définies dans `src/components/AiPanel.tsx`. Chaque opération :

1. Appelle `invoke("ollama_chat", { url, model, systemPrompt, userMessage })`
2. Ou utilise `invoke("ollama_stream", ...)` + écoute de l'événement `ollama-chunk` pour le streaming

Les prompts par défaut sont dans `src/store/index.ts` (`DEFAULT_SETTINGS`) et éditables par l'utilisateur dans les Paramètres.

---

## Tester le chiffrement manuellement

1. Lancer l'app en dev : `npm run tauri dev`
2. Ouvrir Paramètres → Avancé → Sécurité → Activer
3. Choisir PIN ou alphanumérique, définir un mot de passe
4. Fermer et relancer l'app — l'écran de verrouillage doit apparaître
5. Saisir le bon mot de passe → les notes doivent se charger normalement
6. Vérifier dans SQLite Browser que les titres en DB commencent par `ENC:v1:`

---

## Pull Requests

1. Forker le dépôt et créer une branche depuis `main` : `git checkout -b feat/ma-feature`
2. Commiter avec des messages clairs et concis en anglais ou français
3. Ouvrir une PR vers `main` en décrivant le contexte, les changements et comment tester
4. S'assurer que `npm run tauri build` passe sans erreur avant de soumettre

---

## Signaler un bug

Ouvrir une issue GitHub avec :
- La version de NATIA (visible dans `tauri.conf.json` → `version`)
- L'OS et sa version
- Les étapes pour reproduire
- Le comportement attendu vs observé
- Les logs de la console (F12 dans l'app en mode dev, ou `~/.local/share/com.fablenote.app/logs/` en production)
