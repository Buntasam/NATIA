# Guide de contribution — NATIA

Merci de vouloir contribuer à NATIA ! Ce document explique comment installer l'environnement, les règles du code et la façon de proposer une modification.

---

## Avant de commencer : la licence

NATIA est publiée sous une licence « code source consultable », pas sous une licence libre (voir [LICENSE](../LICENSE)) :

- vous pouvez forker le dépôt sur GitHub **pour proposer des modifications par pull request** vers ce dépôt ;
- vous pouvez modifier le code pour votre usage personnel ;
- vous ne pouvez pas publier votre propre version de NATIA, même gratuitement, ni l'utiliser commercialement sans accord.

En proposant une pull request, vous acceptez que votre contribution puisse être intégrée et réutilisée par l'auteur selon l'article 4 de la licence.

---

## Prérequis

- Windows 10 ou 11 (NATIA est développée et testée sous Windows)
- Node.js ≥ 20
- Rust stable (`rustup update stable`)
- Git, pour cloner le dépôt
- Ollama *(facultatif)*, pour tester l'IA locale

---

## Mise en place locale

```bash
git clone https://github.com/Buntasam/NATIA.git
cd NATIA/fablenote
npm install
npm run tauri dev
```

Le frontend se recharge à chaud (Vite, port 1420). Tauri recompile automatiquement le Rust à chaque modification.

> La version de développement utilise le même dossier de données qu'une version installée (`%APPDATA%\com.natia.app`). Pour repartir de zéro : « Réinitialiser l'app » dans Paramètres → Données ou sur l'écran de verrouillage.

---

## Vérifier avant de proposer une modification

```bash
cd NATIA/fablenote
npx tsc --noEmit                                     # types TypeScript
npm run i18n:check                                   # textes sans traduction anglaise
npm run build                                        # compilation du frontend
cd src-tauri && cargo test --no-default-features --lib   # tests Rust
```

Pour compiler l'application complète sans créer d'installeur :

```bash
npm run tauri build -- --no-bundle
```

Un `npm run tauri build` complet produit aussi les fichiers de mise à jour signés et demande donc la clé privée de signature (`TAURI_SIGNING_PRIVATE_KEY`), réservée au mainteneur. Les releases officielles sont compilées par GitHub Actions.

---

## Choix d'architecture

Le détail est dans [ARCHITECTURE.md](ARCHITECTURE.md). En bref :

- **Tauri plutôt qu'Electron** : WebView du système au lieu d'un Chromium embarqué, binaire beaucoup plus léger.
- **SQLite pour les métadonnées, HTML pour le contenu** : SQLite pour les titres, tags, dossiers et versions ; HTML car c'est le format natif de TipTap.
- **Historique des versions dans SQLite** (`note_versions`), 200 versions au maximum par note.
- **Zustand** : API minimale, suffisante pour une app à une fenêtre.
- **Chiffrement champ par champ plutôt que SQLCipher** : pas de dépendance native à compiler, et le préfixe `ENC:v1:` permet d'activer ou retirer le mot de passe sur une base existante.

---

## Règles du code

### TypeScript (frontend)

- Pas de `any` : typer via `src/types/index.ts`.
- Composants en PascalCase, hooks en `use*`.
- Styles avec Tailwind et les variables CSS du thème (`bg-base`, `text-primary`…), jamais de couleurs codées en dur.
- Les actions sur les notes, dossiers et paramètres passent par le store Zustand.
- Un paramètre enregistré par le bouton « Sauvegarder » se modifie via `form` / `set`, passés par `Settings.tsx` aux composants de `src/components/settings/`.
- Les liens externes passent par `openUrl` (plugin `opener`) ; toute nouvelle URL doit être ajoutée dans `src-tauri/capabilities/default.json`.
- Une nouvelle fonctionnalité visible s'accompagne d'une mise à jour du manuel, en français et en anglais (`src/components/settings/manualContent.ts` et `manualContent.en.ts`).
- Tout texte affiché passe par `t("…")` (composant, avec `const t = useT()`) ou `tr("…")` (hors composant), et sa traduction est ajoutée dans `src/i18n/en.ts`. Les variables s'écrivent `t("{n} notes", { n })`. Vérifier avec `npm run i18n:check` avant de proposer une modification.
- Un prompt IA par défaut ou un préréglage ajouté doit avoir sa version anglaise dans `src/i18n/prompts.ts`.
- Pas de `window.confirm`, `window.prompt` ni `alert` : Tauri ne les affiche pas. Pas de lien `<a download>` non plus : passer par la boîte « Enregistrer sous » (`save` du plugin dialog) puis une commande Rust.

### Rust (backend)

- Chaque commande a `#[tauri::command]` et est enregistrée dans `invoke_handler` (`lib.rs`).
- Les erreurs sont renvoyées en `Result<_, String>`.
- Pas de `unwrap()` dans le code de production : utiliser `?` ou `map_err`.
- Une commande lourde (parcours de toutes les notes…) doit être `async`, sinon elle bloque la fenêtre.
- La logique testable va dans une fonction qui prend une connexion SQLite, la commande Tauri ne fait que l'appeler (voir `create_folder_in`, `search_rows`…).

### Chiffrement et sécurité

- Toute donnée personnelle lue ou écrite passe par `maybe_enc` / `maybe_dec` avec la clé de `AppState`.
- Une nouvelle colonne ou table contenant des données personnelles doit être ajoutée à `encrypt_all_data` **et** `decrypt_all_data` (`crypto.rs`), avec un test.
- Une valeur chiffrée ayant un nonce aléatoire, on ne peut pas la comparer en SQL (`WHERE`, `LIKE`) : charger, déchiffrer et filtrer en Rust.
- Toute commande qui écrit des données appelle `crate::require_unlocked(&state)?` en premier.
- La clé (`enc_key`) ne doit jamais être loguée, sérialisée ni persistée ; l'effacer avec `zeroize`.
- Comparer les hash en temps constant.
- Les tests ne doivent **jamais** utiliser le vrai coffre d'identifiants Windows : injecter le secret de l'appareil (voir `unwrap_dek_with` dans `settings.rs`).

### Thème

Un changement de thème met à jour la classe `.dark` sur `<html>` (variables CSS de `src/index.css`) et appelle `set_window_theme` pour la barre de titre Windows.

---

## Ajouter une commande Tauri

1. Écrire la fonction dans le module concerné (`notes.rs`, `settings.rs`…) avec `#[tauri::command]`.
2. L'ajouter dans `tauri::generate_handler![...]` dans `lib.rs`.
3. L'appeler depuis le frontend avec `invoke("nom_commande", { param: valeur })` (les noms en camelCase côté JS sont convertis en snake_case côté Rust).

Exemple avec des données chiffrées :

```rust
#[tauri::command]
pub fn ma_commande(valeur: String, state: State<AppState>) -> Result<(), String> {
    crate::require_unlocked(&state)?;
    // Copier la clé avant de verrouiller la base, pour ne jamais tenir les deux verrous.
    let key = state.enc_key.lock().map_err(|e| e.to_string())?.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT INTO ma_table(valeur) VALUES(?1)", params![maybe_enc(&key, &valeur)])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("ma_commande", { valeur: "bonjour" });
```

---

## Ajouter une opération IA

Les opérations sont dans `src/components/AiPanel.tsx`. Elles appellent `aiChat()` ou `aiStream()` de `src/lib/aiInvoke.ts`, qui choisissent la bonne commande Rust selon le fournisseur actif. En streaming, la réponse arrive par les événements `ollama-token` puis `ollama-done`, quel que soit le fournisseur.

Les prompts par défaut sont dans `src/store/index.ts` (`DEFAULT_SETTINGS`) et les préréglages dans `src/components/settings/promptPresets.ts`.

---

## Tester le chiffrement à la main

1. `npm run tauri dev`, puis Paramètres → Sécurité → Activer.
2. Choisir un PIN ou un mot de passe.
3. Fermer et relancer l'app : l'écran de verrouillage doit apparaître.
4. Saisir le bon mot de passe : les notes se chargent.
5. Avec un outil SQLite (DB Browser for SQLite), ouvrir `%APPDATA%\com.natia.app\natia.db` : titres, tags, dossiers, contenus des versions et paramètres doivent commencer par `ENC:v1:`.

Les tests Rust (`cargo test`) vérifient déjà qu'aucun texte témoin ne reste en clair après chiffrement.

---

## Pull requests

1. Forker le dépôt et créer une branche depuis `main` : `git checkout -b feat/ma-fonctionnalite`.
2. Commiter avec des messages clairs, en français ou en anglais.
3. Lancer les vérifications ci-dessus.
4. Ouvrir une pull request vers `main` en expliquant le contexte, les changements et comment tester.

---

## Publier une version (mainteneur)

1. Pousser le code sur `main`.
2. Créer et pousser un tag : `git tag v6.2.0` puis `git push origin v6.2.0` (format `vX.Y.Z` obligatoire, il devient le numéro de version de l'app).
3. GitHub Actions lance les tests, compile, signe et crée un **brouillon** de release.
4. Vérifier le brouillon, puis le publier comme release normale (pas « pre-release ») : les utilisateurs se verront proposer la mise à jour.

---

## Signaler un bug

Ouvrir une [issue](https://github.com/Buntasam/NATIA/issues) avec :

- la version de NATIA (Paramètres → Application → Mises à jour) ;
- la version de Windows ;
- les étapes pour reproduire ;
- le comportement attendu et le comportement observé ;
- si possible, la trace du mode débogage (Paramètres → Application → Développement, puis onglet Debug du panneau IA). Vérifiez qu'elle ne contient rien de personnel avant de la partager.
