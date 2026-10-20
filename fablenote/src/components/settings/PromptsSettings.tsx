import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookMarked, ChevronDown, Clock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { DEFAULT_SETTINGS, useStore } from "../../store";
import { PromptVersion, Settings as SettingsType } from "../../types";
import { Section } from "./SettingsWidgets";
import { PROMPT_FIELDS, PROMPT_PRESETS } from "./promptPresets";
import { SettingsFormProps } from "./types";
import { locale, useLang, useT } from "../../i18n";
import { promptIn } from "../../i18n/prompts";

interface ShadowLibEntry { id: string; name: string; value: string; }

const LIB_KEY = "shadow_prompt_library";
const LEGACY_LIB_KEY = "natia_shadow_prompt_library";

async function loadLib(): Promise<ShadowLibEntry[]> {
  const raw = await invoke<string | null>("get_user_data", { name: LIB_KEY });
  const legacy = localStorage.getItem(LEGACY_LIB_KEY);
  if (legacy !== null) {
    if (!raw) await saveLib(JSON.parse(legacy));
    localStorage.removeItem(LEGACY_LIB_KEY);
    if (!raw) return JSON.parse(legacy);
  }
  return raw ? JSON.parse(raw) : [];
}

function saveLib(entries: ShadowLibEntry[]): Promise<void> {
  return invoke<void>("set_user_data", { name: LIB_KEY, value: JSON.stringify(entries) })
    .catch((e) => console.error("saveLib:", e));
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(locale(), {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function PromptsSettings({ form, set, setForm }: SettingsFormProps) {
  const { settings } = useStore();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const localDefault = (key: keyof SettingsType) => promptIn(DEFAULT_SETTINGS[key] as string, lang);
  const [openDefault, setOpenDefault] = useState<string | null>(null);
  const [allReset, setAllReset] = useState(false);
  const [shadowLib, setShadowLib] = useState<ShadowLibEntry[]>([]);
  useEffect(() => { loadLib().then(setShadowLib).catch((e) => console.error("loadLib:", e)); }, []);
  const [libSaveName, setLibSaveName] = useState("");
  const [libSaveOpen, setLibSaveOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);

  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const addToLib = () => {
    if (!libSaveName.trim()) return;
    const next = [{ id: crypto.randomUUID(), name: libSaveName.trim(), value: form.global_shadow_prompt }, ...shadowLib];
    setShadowLib(next);
    saveLib(next);
    setLibSaveName(""); setLibSaveOpen(false);
  };

  const removeFromLib = (id: string) => {
    const next = shadowLib.filter(e => e.id !== id);
    setShadowLib(next);
    saveLib(next);
  };

  const isUnsaved = (key: keyof SettingsType) => form[key] !== settings[key];

  const resetPrompt = (key: keyof SettingsType) => { set(key, localDefault(key)); setOpenDefault(null); };

  const resetAllPrompts = () => {
    setForm((f) => ({
      ...f,
      global_shadow_prompt: localDefault("global_shadow_prompt"),
      correct_prompt:        localDefault("correct_prompt"),
      summary_prompt:        localDefault("summary_prompt"),
      rename_prompt:         localDefault("rename_prompt"),
      sort_prompt:           localDefault("sort_prompt"),
      formalize_prompt:      localDefault("formalize_prompt"),
      translate_prompt:      localDefault("translate_prompt"),
      continue_prompt:       localDefault("continue_prompt"),
    }));
    setOpenDefault(null); setHistoryKey(null);
    setAllReset(true); setTimeout(() => setAllReset(false), 2000);
  };

  const openHistory = async (key: string) => {
    if (historyKey === key) { setHistoryKey(null); return; }
    setHistoryKey(key); setPreviewId(null); setLoadingHistory(true);
    try { const v = await invoke<PromptVersion[]>("get_prompt_versions", { promptKey: key }); setVersions(v); }
    finally { setLoadingHistory(false); }
  };

  const restoreVersion = (v: PromptVersion) => {
    set(v.prompt_key as keyof SettingsType, v.value);
    setHistoryKey(null); setPreviewId(null);
  };

  const deleteVersion = async (id: string) => {
    await invoke("delete_prompt_version", { id });
    setVersions((vs) => vs.filter((v) => v.id !== id));
  };
  return (
    <>
      <Section title={t("Prompts système")}>
        <div className="flex flex-col gap-7">
          {PROMPT_FIELDS.map(({ key, label, rows }) => (
            <div key={key}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={key} className="text-sm text-secondary flex items-center gap-2">
                  {t(label)}
                  {isUnsaved(key) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-500 border border-amber-400/20 font-medium">{t("non sauvegardé")}</span>
                  )}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openHistory(key)} className={`flex items-center gap-1 text-[10px] transition-colors ${historyKey === key ? "text-accent" : "text-muted hover:text-primary"}`}>
                    <Clock size={10} />{t("Historique")}
                  </button>
                  <button onClick={() => setOpenDefault(openDefault === key ? null : key)} className={`flex items-center gap-1 text-[10px] transition-colors ${openDefault === key ? "text-accent" : "text-muted hover:text-primary"}`}>
                    <ChevronDown size={10} className={`transition-transform ${openDefault === key ? "rotate-180" : ""}`} />
                    {t("Défaut")}
                  </button>
                </div>
              </div>

              {/* Presets */}
              {PROMPT_PRESETS[key] && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {PROMPT_PRESETS[key].map((preset) => (
                    <button key={preset.label} onClick={() => set(key, promptIn(preset.value, lang))} title={promptIn(preset.value, lang)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${form[key] === promptIn(preset.value, lang) ? "bg-accent/15 border-accent/40 text-accent" : "bg-hover border-border text-muted hover:text-primary hover:border-border/80"}`}>
                      {t(preset.label)}
                    </button>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <textarea
                id={key} value={form[key] as string} onChange={(e) => set(key, e.target.value)} rows={rows}
                className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 transition-colors resize-none font-mono"
              />

              {/* Default preview */}
              {openDefault === key && (
                <div className="mt-1.5 rounded-lg border border-border bg-panel p-3 flex flex-col gap-2">
                  <p className="text-[10px] text-muted uppercase tracking-wider">{t("Valeur par défaut")}</p>
                  <pre className="text-[11px] text-secondary/80 whitespace-pre-wrap font-mono leading-relaxed break-all">{localDefault(key)}</pre>
                  <button onClick={() => resetPrompt(key)} className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hover border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors">
                    <RotateCcw size={10} />{t("Restaurer ce prompt")}
                  </button>
                </div>
              )}

              {/* History panel */}
              {historyKey === key && (
                <div className="mt-1.5 rounded-lg border border-border bg-panel overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Clock size={11} className="text-accent" />
                    <span className="text-xs font-medium text-secondary">{t("Historique des versions")}</span>
                  </div>
                  {loadingHistory ? (
                    <p className="text-xs text-muted px-3 py-4 text-center">{t("Chargement…")}</p>
                  ) : versions.length === 0 ? (
                    <p className="text-xs text-muted px-3 py-4 text-center italic">{t("Aucune version sauvegardée")}</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto">
                      {versions.map((v, i) => (
                        <div key={v.id} className="flex flex-col px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-hover/50 transition-colors group">
                          <div className="flex items-start gap-2.5">
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-accent" : "bg-border"}`} />
                              {i < versions.length - 1 && <div className="w-px flex-1 min-h-[20px] bg-border/60 mt-0.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] text-muted font-mono">{fmtDate(v.saved_at)}</span>
                                {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">{t("actuel")}</span>}
                              </div>
                              <p className="text-[11px] text-secondary/70 font-mono truncate cursor-pointer hover:text-secondary transition-colors" onClick={() => setPreviewId(previewId === v.id ? null : v.id)}>
                                {v.value.slice(0, 80)}{v.value.length > 80 ? "…" : ""}
                              </p>
                              {previewId === v.id && (
                                <pre className="mt-1.5 text-[10px] text-secondary/80 font-mono whitespace-pre-wrap leading-relaxed bg-hover rounded p-2 max-h-28 overflow-y-auto">{v.value}</pre>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {i !== 0 && (
                                  <button onClick={() => restoreVersion(v)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors">
                                    <RotateCcw size={9} />{t("Restaurer")}
                                  </button>
                                )}
                                <button onClick={() => deleteVersion(v.id)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded text-muted hover:text-red-400 transition-colors">
                                  <Trash2 size={9} />{t("Supprimer")}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shadow prompt library — only for global_shadow_prompt */}
              {key === "global_shadow_prompt" && (
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <button onClick={() => setLibOpen(v => !v)} className="flex items-center gap-1.5 text-[10px] text-muted hover:text-primary transition-colors">
                      <BookMarked size={10} />
                      {t("Bibliothèque")}{shadowLib.length > 0 ? ` (${shadowLib.length})` : ""}
                      <ChevronDown size={10} className={`transition-transform ${libOpen ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={() => { setLibSaveOpen(v => !v); setLibSaveName(""); }} className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors">
                      <Plus size={10} />{t("Sauvegarder")}
                    </button>
                  </div>

                  {libSaveOpen && (
                    <div className="flex gap-1.5 mb-2">
                      <input
                        value={libSaveName}
                        onChange={e => setLibSaveName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addToLib()}
                        placeholder={t("Nom du prompt (ex : Assistant créatif)")}
                        className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
                        autoFocus
                      />
                      <button onClick={addToLib} disabled={!libSaveName.trim()} className="px-2.5 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-xs text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">OK</button>
                      <button onClick={() => { setLibSaveOpen(false); setLibSaveName(""); }} className="px-2 py-1.5 rounded-lg bg-hover border border-border text-xs text-muted hover:text-primary transition-colors">✕</button>
                    </div>
                  )}

                  {libOpen && (
                    shadowLib.length === 0 ? (
                      <p className="text-[10px] text-muted italic py-1">{t("Aucun prompt sauvegardé · cliquez sur « Sauvegarder » pour en ajouter un")}</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {shadowLib.map(entry => (
                          <div key={entry.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-hover border border-border group hover:border-accent/30 transition-colors">
                            <button onClick={() => set("global_shadow_prompt", entry.value)} className="flex-1 text-left min-w-0">
                              <p className="text-xs text-secondary group-hover:text-primary transition-colors font-medium truncate">{entry.name}</p>
                              <p className="text-[10px] text-muted font-mono truncate mt-0.5">{entry.value.slice(0, 70)}{entry.value.length > 70 ? "…" : ""}</p>
                            </button>
                            <button onClick={() => removeFromLib(entry.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all shrink-0">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Reset all */}
          <div className="pt-1 border-t border-border">
            <button onClick={resetAllPrompts} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 hover:bg-red-400/15 hover:border-red-400/30 transition-colors">
              <RotateCcw size={11} />
              {allReset ? t("Tous les prompts ont été réinitialisés ✓") : t("Tout réinitialiser aux valeurs par défaut")}
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}
