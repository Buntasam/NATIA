# Logos NATIA

| Fichier | Usage |
|---|---|
| `natia-app-icon-black.svg` | Source de l'icône de l'application (`npx tauri icon brand/natia-app-icon-black.svg -o src-tauri/icons`, puis ne garder que les fichiers listés dans `tauri.conf.json` et `icon.png`) |
| `natia-app-icon-white.svg` | Variante claire de l'icône |

Dans l'interface, les logos sont des composants React en `currentColor` (`src/components/Brand.tsx`) : ils prennent la couleur du texte, donc noirs en thème clair et blancs en thème sombre.

- `NatiaSymbol` : écran de verrouillage
- `NatiaLockup` : en-tête de la barre latérale
- `NatiaWordmark` : écran de démarrage, fenêtre de fermeture
- `NatiaAnimated` (`intro` au démarrage, `loader` pendant l'enregistrement à la fermeture), animations dans `src/index.css` (classes `natia-*`), coupées si Windows demande de réduire les animations
