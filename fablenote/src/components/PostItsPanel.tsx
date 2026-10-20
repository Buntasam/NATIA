import { useState } from "react";
import { Eye, EyeOff, Plus, StickyNote, X } from "lucide-react";
import { LockPostIt, POSTIT_COLORS, arePostItsHidden, loadPostIts, newPostIt, savePostIts, setPostItsHidden } from "../lib/lockPostIts";
import { useT } from "../i18n";

export default function PostItsPanel({ onClose }: { onClose: () => void }) {
  const [postIts, setPostIts] = useState<LockPostIt[]>(loadPostIts);
  const [hidden, setHidden] = useState(arePostItsHidden);
  const t = useT();

  const update = (next: LockPostIt[]) => { setPostIts(next); savePostIts(next); };
  const patch = (id: string, changes: Partial<LockPostIt>) =>
    update(postIts.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const toggleHidden = () => { setPostItsHidden(!hidden); setHidden(!hidden); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-xl w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 shrink-0">
          <StickyNote size={15} className="text-accent" />
          <span className="text-sm font-semibold text-primary">{t("Post-its")}</span>
          <span className="text-xs text-muted">{postIts.length === 1 ? t("{n} post-it", { n: 1 }) : t("{n} post-its", { n: postIts.length })}</span>
          <div className="flex-1" />
          <button
            onClick={toggleHidden}
            title={hidden ? t("Masqués sur l'écran de verrouillage") : t("Visibles sur l'écran de verrouillage")}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            {hidden ? t("Masqués au verrouillage") : t("Visibles au verrouillage")}
          </button>
          <button
            onClick={() => update([...postIts, newPostIt()])}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-accent hover:bg-accent/10 transition-colors"
          >
            <Plus size={13} />
            {t("Ajouter")}
          </button>
          <button onClick={onClose} aria-label={t("Fermer")} className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
            <X size={15} />
          </button>
        </div>

        <p className="px-5 pt-3 text-[10px] text-amber-500/90">
          {t("Ces post-its s'affichent sur l'écran de verrouillage et ne sont pas chiffrés : n'y notez rien de personnel.")}
        </p>

        <div className="flex-1 overflow-y-auto p-5">
          {postIts.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">{t("Aucun post-it")}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {postIts.map((p) => (
                <div key={p.id} className="rounded-lg shadow-md overflow-hidden flex flex-col" style={{ backgroundColor: p.color }}>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex gap-1.5">
                      {POSTIT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => patch(p.id, { color: c })}
                          aria-label={t("Couleur")}
                          style={{
                            backgroundColor: c, width: 10, height: 10, borderRadius: "50%",
                            border: p.color === c ? "2px solid rgba(0,0,0,0.45)" : "1px solid rgba(0,0,0,0.15)",
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => update(postIts.filter((n) => n.id !== p.id))}
                      aria-label={t("Supprimer")}
                      style={{ color: "rgba(0,0,0,0.35)", fontSize: 16, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    value={p.text}
                    onChange={(e) => patch(p.id, { text: e.target.value })}
                    placeholder="..."
                    rows={5}
                    style={{ backgroundColor: p.color, color: "rgba(0,0,0,0.75)", resize: "none" }}
                    className="w-full px-2.5 pb-2 text-xs placeholder:text-black/25 outline-none border-0 leading-relaxed"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
