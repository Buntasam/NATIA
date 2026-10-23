import type { CloudProvider } from "../lib/sync";

// Petits logos des applications cloud (boutons de synchronisation).
// Dropbox et Google Drive : tracés de Simple Icons (CC0). OneDrive : nuage simple aux couleurs de Microsoft.

const PATHS: Record<Exclude<CloudProvider, "onedrive">, { d: string; color: string }> = {
  dropbox: { color: "#0061FF", d: "M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z" },
  gdrive: { color: "#1FA463", d: "M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z" },
};

export default function CloudLogo({ provider, size = 14, muted = false }: { provider: CloudProvider; size?: number; muted?: boolean }) {
  const style = muted ? { filter: "grayscale(1)", opacity: 0.5 } : undefined;
  if (provider === "onedrive") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style} className="shrink-0">
        <path fill="#0364B8" d="M9.6 8.2a5.2 5.2 0 0 1 9 2.3 3.9 3.9 0 0 1 .9 7.6H9.2Z" />
        <path fill="#0078D4" d="M10.1 9.1A6 6 0 0 0 4.6 12.4 4 4 0 0 0 5.4 20h9.3a3.7 3.7 0 0 0 .8-7.3 6 6 0 0 0-5.4-3.6Z" />
        <path fill="#28A8EA" d="M5.4 20a3.9 3.9 0 0 1-.9-7.6 6 6 0 0 1 10.9.2 3.7 3.7 0 0 1-.6 7.4Z" opacity=".55" />
      </svg>
    );
  }
  const p = PATHS[provider];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style} className="shrink-0">
      <path fill={p.color} d={p.d} />
    </svg>
  );
}
