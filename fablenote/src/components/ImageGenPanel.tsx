import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import { useStore } from "../store";

interface Props {
  onClose: () => void;
  onInsert: (src: string) => void;
}

const SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;
type Size = typeof SIZES[number];

export default function ImageGenPanel({ onClose, onInsert }: Props) {
  const { settings } = useStore();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<Size>("1024x1024");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKey = settings.openai_api_key;
  const canGenerate = !!apiKey && !!prompt.trim() && !loading;

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const src = await invoke<string>("generate_image", {
        apiKey,
        prompt: prompt.trim(),
        size,
      });
      setResult(src);
    } catch (e) {
      setError(typeof e === "string" ? e : "Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[480px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <span className="font-semibold text-primary">Générer une image (DALL-E 3)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!apiKey && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500">
              Clé OpenAI requise — configure-la dans les Paramètres.
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris l'image souhaitée en détail…"
              rows={4}
              className="w-full bg-sidebar border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted outline-none resize-none focus:border-accent/40 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Format</label>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors ${
                    size === s
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-secondary hover:bg-hover"
                  }`}
                >
                  {s === "1024x1024" ? "Carré" : s === "1792x1024" ? "Paysage" : "Portrait"}
                  <span className="block text-muted mt-0.5">{s}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted">
              <Loader2 size={28} className="animate-spin text-accent" />
              <p className="text-sm">Génération en cours (10–30 s)…</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-3">
              <img src={result} alt={prompt} className="w-full rounded-lg border border-border" />
              <button
                onClick={() => { onInsert(result); onClose(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <ImageIcon size={15} />
                Insérer dans la note
              </button>
            </div>
          )}
        </div>

        {!result && !loading && (
          <div className="px-5 pb-5 shrink-0">
            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={15} />
              Générer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
