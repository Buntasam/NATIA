import { useEffect, useState } from "react";
import { Folder, RotateCcw, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import { TrashItem } from "../types";

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function TrashPanel() {
  const { toggleTrash, getTrash, restoreFromTrash, emptyTrash, permanentDeleteItem } = useStore();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try { setItems(await getTrash()); }
    finally { setLoading(false); }
  };

  const handleRestore = async (item: TrashItem) => {
    setBusy(item.id);
    try {
      await restoreFromTrash(item.id, item.item_type);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally { setBusy(null); }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    setBusy(item.id);
    try {
      await permanentDeleteItem(item.id, item.item_type);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally { setBusy(null); }
  };

  const handleEmptyTrash = async () => {
    if (!confirmEmpty) { setConfirmEmpty(true); setTimeout(() => setConfirmEmpty(false), 4000); return; }
    setBusy("empty");
    try {
      await emptyTrash();
      setItems([]);
      setConfirmEmpty(false);
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border rounded-xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Trash2 size={15} className="text-muted" />
            <h2 className="text-base font-semibold text-primary">Corbeille</h2>
            {items.length > 0 && (
              <span className="text-xs text-muted bg-hover border border-border px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
          </div>
          <button onClick={toggleTrash} className="text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted text-sm">Chargement…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
              <Trash2 size={32} className="opacity-20" />
              <p className="text-sm">La corbeille est vide</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/50 transition-colors group">
                  {/* Icon */}
                  <div className="shrink-0">
                    {item.item_type === "folder"
                      ? <Folder size={15} className="text-amber-400" />
                      : <div className="w-3.5 h-3.5 rounded border border-border bg-hover" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted">{fmtDate(item.deleted_at)}</span>
                      {item.item_type === "folder" && item.note_count != null && item.note_count > 0 && (
                        <span className="text-[10px] text-muted">· {item.note_count} note{item.note_count > 1 ? "s" : ""}</span>
                      )}
                      {item.folder && item.item_type === "note" && (
                        <span className="text-[10px] text-muted truncate">· {item.folder}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={busy === item.id}
                      title="Restaurer"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={11} />
                      Restaurer
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item)}
                      disabled={busy === item.id}
                      title="Supprimer définitivement"
                      className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
            <p className="text-[10px] text-muted">Les éléments supprimés définitivement ne peuvent pas être récupérés.</p>
            <button
              onClick={handleEmptyTrash}
              disabled={busy === "empty"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 shrink-0 ${
                confirmEmpty
                  ? "bg-red-400/15 border-red-400/40 text-red-400 hover:bg-red-400/25"
                  : "bg-hover border-border text-muted hover:text-red-400 hover:border-red-400/30"
              }`}
            >
              <Trash2 size={11} />
              {confirmEmpty ? "Confirmer — tout supprimer" : "Vider la corbeille"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
