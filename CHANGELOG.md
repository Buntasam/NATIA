# Historique des versions

Les nouveautés de chaque version de NATIA. Les fichiers d'installation sont sur la page
[Releases](https://github.com/Buntasam/NATIA/releases).

## [Non publié]

### Nouveautés
- **Capture rapide** (`Ctrl+Alt+N`, depuis n'importe quelle application) : une petite fenêtre pour noter une idée ou une tâche, même NATIA réduite.
- **Échéances des tâches** : `@demain`, `@vendredi`, `@15/11` ou une date ; vue « Par échéance », points verts dans le calendrier, notification Windows le jour J.
- **OCR** : le texte des images et des PDF scannés joints est cherchable (OCR intégré à Windows, rien à télécharger).
- **Export en Markdown** de toutes les notes (Paramètres → Données), avec dossiers, images et fichiers joints, lisible par Obsidian.
- **Diagnostic** à copier pour un signalement de bug (mode débogage), sans contenu de note, chemins ni clés.
- **Note du jour** (`Ctrl+D`) : une note datée par jour, rangée dans le dossier « Journal ».
- **Vue Tâches** (`Ctrl+Shift+T`) : toutes les cases à cocher de toutes les notes, filtrables, à cocher sans ouvrir la note ; une tâche se crée directement depuis la vue (dans une note « Tâches », la note du jour ou une note choisie).
- **« Demander à mes notes »** lit aussi le texte des PDF joints.
- **Conflits de synchronisation** : un nuage orange les signale ; comparaison côte à côte, garder l'une ou l'autre version.
- **Écran « Nouveautés »** après une mise à jour (et depuis la palette).

### Performances
- Barre latérale plus fluide avec beaucoup de notes (moins de rafraîchissements, éléments hors écran non dessinés).
- Démarrage plus léger : le panneau IA, la conversation, l'écran des conditions et le manuel se chargent à l'ouverture ; coloration du code limitée aux langages courants (fichier principal : 1,26 Mo → 1,03 Mo).

### Projet
- `Editor.tsx` et `Sidebar.tsx` découpés (`components/editor/`, `components/sidebar/`, `lib/noteExport.ts`, `lib/noteTree.ts`).
- Nouveaux tests : tâches, note du jour, conflits, nouveautés, arbre des dossiers, recherche dans les fichiers joints.

## [6.3.0] — 2026-11-10

### Nouveautés
- **Onglets** : chaque note ouverte prend un onglet au-dessus de l'éditeur. `Ctrl+Tab` pour passer de l'une à l'autre, `Ctrl+W` pour fermer, `Ctrl+1…9` pour aller à un onglet ; glisser un onglet pour le déplacer. Peut se masquer (Paramètres → Apparence).
- **Notes liées** : le panneau Liens montre les notes qui parlent de la même chose, même sans lien `[[…]]` entre elles (par le sens avec l'IA intégrée, sinon par les mots en commun).
- **Tags suggérés** sous chaque note : ceux des notes proches, et les tags existants dont le nom apparaît dans la note. Un clic pour l'ajouter.
- **Glisser-déposer** de fichiers dans une note : les images s'affichent dans la note, les autres fichiers deviennent des fichiers joints.
- **Recherche dans les PDF** joints (et les fichiers texte) : la recherche trouve la note qui contient le fichier.
- **Partage sécurisé** : une note s'enregistre en page HTML chiffrée, protégée par un mot de passe, qui s'ouvre dans n'importe quel navigateur.
- **Indicateur de synchronisation** dans la barre latérale : vert à jour, flèches pendant la synchro, rouge en cas d'erreur. Un clic synchronise.
- **Palette de commandes** enrichie : les commandes s'affichent sous les notes quand elles correspondent au texte tapé, avec leur raccourci ; `Ctrl+Shift+P` ouvre directement les commandes.
- **Mode focus en plein écran** (`F11`).

### Sécurité
- SQLite mis à jour (faille corrigée en amont), ainsi que pulldown-cmark et markdown-it.

### Projet
- Vérification automatique (traductions, tests, build, tests Rust) à chaque push et pull request.
- Audit hebdomadaire des dépendances, mises à jour proposées par Dependabot.
- Tests de l'interface (Vitest) ; recherche sortie de `notes.rs` dans `search.rs`, panneau IA découpé.

## [6.2.6] — 2026-11-09
- Nouveaux logos, qui suivent le thème clair ou sombre, et animation au démarrage.
- Nouvelle icône de l'application.
- Bouton cadenas dans la barre latérale et raccourci `Ctrl+L` pour verrouiller (sans mot de passe, il ouvre la page pour en créer un).

## [6.2.5] — 2026-11-09
- Les conditions d'utilisation sont présentées à nouveau à chaque nouvelle version.
- Téléchargement du moteur de l'IA intégrée plus robuste (nouvelles tentatives, adresse de secours quand GitHub répond 504).

## [6.2.4] — 2026-11-09
- **Fichiers joints** aux notes (PDF, documents…), chiffrés, avec le panneau « Fichiers liés ».
- **Synchronisation entre plusieurs PC** par un dossier partagé, entièrement chiffré ; liaison en un clic avec OneDrive, Dropbox ou Google Drive.
- **Restauration** d'une sauvegarde automatique depuis les paramètres.
- **Import** d'un coffre Obsidian ou d'un export Notion.
- **Recherche intelligente** (par le sens) dans « Toutes mes notes », avec le modèle d'embeddings de l'IA intégrée.
- Sécurité : PIN de 6 chiffres minimum, actions GitHub épinglées, dépendances mises à jour.

## [6.2.2] — 2026-10-23
- Proposition de mise à jour au démarrage (« Mettre à jour » ou « Plus tard ») et message après la mise à jour.
- Guide de démarrage à la place de l'avertissement.
- Sauvegarde automatique, dans le dossier de votre choix.
- « Demander à mes notes » : la conversation IA peut s'appuyer sur toutes vos notes, avec les sources.
- Conversations précédentes : rouvrir, rechercher, renommer, supprimer, insérer dans une note.
- Langue des prompts IA au choix (drapeaux).

## [6.2.1] — 2026-10-23
- Conditions d'utilisation et politique de confidentialité (RGPD), acceptées au premier lancement et après une réinitialisation.

## [6.2.0] — 2026-10-23
- **IA intégrée** : un modèle qui tourne sur le PC, sans Ollama ni compte, téléchargeable depuis les paramètres.
- Choix du modèle de l'IA intégrée directement dans le panneau IA.

## Versions précédentes
Voir la page [Releases](https://github.com/Buntasam/NATIA/releases).

[6.3.0]: https://github.com/Buntasam/NATIA/releases/tag/v6.3.0
[6.2.6]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.6
[6.2.5]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.5
[6.2.4]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.4
[6.2.2]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.2
[6.2.1]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.1
[6.2.0]: https://github.com/Buntasam/NATIA/releases/tag/v6.2.0
