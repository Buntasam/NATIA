import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, ExternalLink, FileText, Paperclip, Search, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import { formatSize } from "../extensions/Attachment";
import { locale, trError, useT } from "../i18n";

interface AttachmentInfo {
  id: string; note_id: string; name: string; size: number; created_at: string;
  note_title: string; note_deleted: boolean;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** « Fichiers liés » : tous les fichiers joints aux notes, à ouvrir, enregistrer ou supprimer. */
export default function AttachmentsPanel() {
  const { toggleAttachments, selectNote } = useStore();
  const t = useT();
  const [items, setItems] = useState<AttachmentInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<AttachmentInfo[]>("list_attachments", { noteId: null }).then(setItems).catch((e) => { setItems([]); setError(trError(e)); });
  }, []);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (items ?? []).filter((a) => !q || fold(`${a.name} ${a.note_title}`).includes(q));
  }, [items, query]);
  const total = (items ?? []).reduce((n, a) => n + a.size, 0);

  const run = (job: Promise<unknown>) => job.catch((e) => setError(trError(e)));

  const saveAs = async (a: AttachmentInfo) => {
    const path = await save({ defaultPath: a.name, title: t("Enregistrer le fichier") });
    if (path) run(invoke("save_attachment_as", { id: a.id, path }));
  };

  const remove = async (a: AttachmentInfo) => {
    if (confirmId !== a.id) { setConfirmId(a.id); return; }
    await run(invoke("delete_attachment", { id: a.id }));
    setItems((list) => (list ?? []).filter((x) => x.id !== a.id));
    setConfirmId(null);
  };

  const goToNote = (a: AttachmentInfo) => {
    toggleAttachments();
    selectNote(a.note_id).catch(() => {});
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={toggleAttachments}>
      <div className="bg-panel border border-border rounded-xl w-[600px] max-w-[95vw] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Paperclip size={15} className="text-muted" />
            <h2 className="text-base font-semibold text-primary">{t("Fichiers liés")}</h2>
            {items && items.length > 0 && (
              <span className="text-xs text-muted bg-hover border border-border px-2 py-0.5 rounded-full">
                {items.length} · {formatSize(total)}
              </span>
            )}
          </div>
          <button onClick={toggleAttachments} aria-label={t("Fermer")} className="text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {items && items.length > 0 && (
          <div className="px-5 pt-3 shrink-0">
            <div className="flex items-center gap-2 bg-hover rounded-lg px-2.5 py-1.5">
              <Search size={13} className="text-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Chercher un fichier ou une note…")}
                aria-label={t("Chercher un fichier ou une note…")}
                className="bg-transparent text-xs text-primary placeholder-muted outline-none w-full"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {items === null ? (
            <p className="text-center py-12 text-sm text-muted">{t("Chargement…")}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted px-8 text-center">
              <Paperclip size={30} className="opacity-20" />
              <p className="text-sm">{t("Aucun fichier joint pour l'instant")}</p>
              <p className="text-[11px]">{t("Dans une note, le trombone de la barre d'outils joint un PDF, un document ou tout autre fichier. Il est rangé (et chiffré si un mot de passe est actif) avec vos notes.")}</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted">{t("Aucun résultat")}</p>
          ) : (
            shown.map((a) => (
              <div key={a.id} className="group flex items-center gap-3 px-5 py-2 hover:bg-hover/50 transition-colors" onMouseLeave={() => confirmId === a.id && setConfirmId(null)}>
                <FileText size={15} className="text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <button onClick={() => run(invoke("open_attachment", { id: a.id }))} className="block max-w-full text-left text-sm text-primary truncate hover:text-accent transition-colors" title={t("Ouvrir")}>
                    {a.name}
                  </button>
                  <p className="text-[10px] text-muted truncate">
                    {formatSize(a.size)} · {when(a.created_at)} ·{" "}
                    {a.note_title ? (
                      <button onClick={() => goToNote(a)} disabled={a.note_deleted} className="hover:text-accent disabled:hover:text-muted transition-colors">
                        {a.note_title}{a.note_deleted && ` (${t("dans la corbeille")})`}
                      </button>
                    ) : t("note supprimée")}
                  </p>
                </div>
                <div className={`flex items-center gap-1 shrink-0 transition-opacity ${confirmId === a.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  <button onClick={() => run(invoke("open_attachment", { id: a.id }))} title={t("Ouvrir")} className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover">
                    <ExternalLink size={13} />
                  </button>
                  <button onClick={() => saveAs(a)} title={t("Enregistrer sous…")} className="p-1.5 rounded text-muted hover:text-primary hover:bg-hover">
                    <Download size={13} />
                  </button>
                  <button
                    onClick={() => remove(a)}
                    title={confirmId === a.id ? t("Cliquer encore pour supprimer") : t("Supprimer")}
                    className={`p-1.5 rounded transition-colors ${confirmId === a.id ? "bg-red-400/15 text-red-400" : "text-muted hover:text-red-400 hover:bg-hover"}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {error && <p className="px-5 py-2 text-xs text-red-400 border-t border-border shrink-0">{error}</p>}
      </div>
    </div>
  );
}
