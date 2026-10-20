import { useEffect, useState } from "react";
import { Clock, GitBranch, RotateCcw, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { useStore } from "../store";
import { Version } from "../types";
import * as Diff from "diff";
import { msg, tr, useLocale, useT } from "../i18n";

const VERSION_LIMIT_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "30", value: 30 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "∞", value: null },
];

// Libellés écrits par le backend (en français) : traduits à l'affichage.
const VERSION_MESSAGES: [RegExp, string][] = [
  [/^Modifier : (.*)$/s, "Modifier : {0}"],
  [/^Restauré \((.*)\)$/, "Restauré ({0})"],
];

function trVersionMessage(message: string): string {
  for (const [re, key] of VERSION_MESSAGES) {
    const m = message.match(re);
    if (m) return tr(key, { 0: m[1] });
  }
  return tr(message);
}

export default function VersionTree() {
  const {
    activeNote, versions, restoreVersion, toggleVersionPanel, loadVersions,
    versionLimit, setVersionLimit, saveMode, setSaveMode,
  } = useStore();
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  useEffect(() => {
    if (activeNote?.id) loadVersions(activeNote.id);
  }, [activeNote?.updated_at]);
  const [versionContent, setVersionContent] = useState<string>("");
  const [showDiff, setShowDiff] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // confirm() ne s'affiche pas dans Tauri : confirmation par un second clic.
  const [confirmRestore, setConfirmRestore] = useState(false);
  const t = useT();
  const loc = useLocale();

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(loc, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const selectVersion = async (version: Version) => {
    if (!activeNote) return;
    setSelectedVersion(version);
    setConfirmRestore(false);
    setIsLoading(true);
    try {
      const content = await invoke<string>("get_version_content", {
        noteId: activeNote.id,
        hash: version.hash,
      });
      setVersionContent(content);
      setShowDiff(false);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const getPlain = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent ?? "";
  };

  const diffParts = selectedVersion && versionContent && activeNote
    ? Diff.diffWordsWithSpace(getPlain(versionContent), getPlain(activeNote.content))
    : [];

  const handleRestore = async () => {
    if (!activeNote || !selectedVersion) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      setTimeout(() => setConfirmRestore(false), 4000);
      return;
    }
    setConfirmRestore(false);
    await restoreVersion(activeNote.id, selectedVersion.hash);
    setSelectedVersion(null);
    setVersionContent("");
  };

  const changeVersionLimit = async (limit: number | null) => {
    setVersionLimit(limit);
    if (limit !== null && activeNote) {
      try {
        await invoke("trim_note_versions", { noteId: activeNote.id, keep: limit });
        await loadVersions(activeNote.id);
      } catch (e) { console.error(e); }
    }
  };

  const displayedVersions = versionLimit !== null ? versions.slice(0, versionLimit) : versions;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-accent" />
          <span className="text-sm font-medium text-primary">{t("Versions")}</span>
          {versions.length > 0 && (
            <span className="text-xs text-muted">({versions.length})</span>
          )}
        </div>
        <button
          onClick={toggleVersionPanel}
          aria-label={t("Fermer")}
          className="text-muted hover:text-primary transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Version list */}
        <div className={`overflow-y-auto ${selectedVersion ? "max-h-52 border-b border-border" : "flex-1"}`}>
          {versions.length === 0 && (
            <div className="py-8 text-center">
              <Clock size={24} className="text-muted mx-auto mb-2" />
              <p className="text-xs text-muted">{t("Aucune version")}</p>
              <p className="text-xs text-muted mt-1">{t("Les versions s'accumulent automatiquement")}</p>
            </div>
          )}

          {displayedVersions.map((v, i) => (
            <div
              key={v.hash}
              onClick={() => selectVersion(v)}
              className={`flex gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                selectedVersion?.hash === v.hash
                  ? "bg-accent/10"
                  : "hover:bg-hover"
              }`}
            >
              {/* Timeline */}
              <div className="flex flex-col items-center shrink-0 pt-1">
                <div
                  className={`w-2 h-2 rounded-full border ${
                    i === 0
                      ? "bg-accent border-accent"
                      : selectedVersion?.hash === v.hash
                      ? "bg-accent/50 border-accent"
                      : "bg-muted border-border"
                  }`}
                />
                {i < displayedVersions.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-2">
                <p className="text-xs font-medium text-primary truncate">{trVersionMessage(v.message)}</p>
                <p className="text-xs text-muted mt-0.5">{formatDate(v.date)}</p>
                <p className="text-xs text-muted font-mono">{v.short_hash}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Version preview */}
        {selectedVersion && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Controls */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
              <button
                onClick={() => setShowDiff((s) => !s)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  showDiff
                    ? "bg-accent/10 text-accent"
                    : "bg-hover text-secondary hover:text-primary"
                }`}
              >
                {t("Différences")}
              </button>
              <button
                onClick={() => setShowDiff(false)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  !showDiff
                    ? "bg-accent/10 text-accent"
                    : "bg-hover text-secondary hover:text-primary"
                }`}
              >
                {t("Aperçu")}
              </button>
              <div className="flex-1" />
              <button
                onClick={handleRestore}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg text-white transition-colors ${confirmRestore ? "bg-red-500 hover:bg-red-600" : "bg-accent hover:bg-accent-hover"}`}
              >
                <RotateCcw size={11} />
                {confirmRestore ? t("Confirmer la restauration") : t("Restaurer")}
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {isLoading ? (
                <p className="text-xs text-muted text-center py-4">{t("Chargement…")}</p>
              ) : showDiff ? (
                <div className="text-xs leading-relaxed font-mono">
                  {diffParts.map((part, i) => (
                    <span
                      key={i}
                      className={
                        part.added
                          ? "bg-green-500/20 text-green-400"
                          : part.removed
                          ? "bg-red-500/20 text-red-400 line-through"
                          : "text-secondary"
                      }
                    >
                      {part.value}
                    </span>
                  ))}
                </div>
              ) : (
                <div
                  className="text-xs text-secondary leading-relaxed prose-sm"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(versionContent) }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Paramètres ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border px-3 py-3 flex flex-col gap-3">

        {/* Version limit */}
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
            {t("Versions conservées / note")}
          </p>
          <div className="flex gap-1 flex-wrap">
            {VERSION_LIMIT_OPTIONS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => changeVersionLimit(value)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  versionLimit === value
                    ? "bg-accent text-white"
                    : "bg-hover text-secondary hover:bg-active hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {versionLimit !== null && versions.length > versionLimit && (
            <p className="text-[10px] text-muted mt-1">
              {t("{n} version(s) masquée(s)", { n: versions.length - versionLimit })}
            </p>
          )}
        </div>

        {/* Save mode */}
        <div>
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
            {t("Mode de sauvegarde")}
          </p>
          <div className="flex flex-col gap-0.5">
            {([
              { val: "balanced", label: msg("Équilibré"), desc: msg("toutes les 5 s + Ctrl+S") },
              { val: "auto",     label: msg("Automatique"), desc: msg("toutes les 1,5 s") },
              { val: "manual",   label: msg("Manuel uniquement"), desc: msg("Ctrl+S ou bouton") },
            ] as const).map(({ val, label, desc }) => (
              <button
                key={val}
                onClick={() => setSaveMode(val)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                  saveMode === val
                    ? "bg-accent/10 text-accent"
                    : "text-secondary hover:bg-hover"
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 border transition-colors ${
                  saveMode === val ? "bg-accent border-accent" : "border-border"
                }`} />
                <div className="min-w-0">
                  <span className="text-xs font-medium block leading-tight">{t(label)}</span>
                  <span className={`text-[10px] leading-tight ${saveMode === val ? "text-accent/70" : "text-muted"}`}>{t(desc)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
