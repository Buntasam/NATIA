// Glisser-déposer de la barre latérale : dataTransfer n'est pas fiable dans WebView2,
// l'élément glissé est gardé ici, partagé entre la barre latérale et ses éléments.

export const drag: { current: { type: "note"; id: string } | { type: "folder"; path: string } | null } = { current: null };
