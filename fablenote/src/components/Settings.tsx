import React, { useEffect, useState } from "react";
import { BarChart2, BookOpen, BrainCircuit, Database, FileText, Palette, ScrollText, Search, Shield, Sparkles, Wrench, X } from "lucide-react";
import { useStore } from "../store";
import { Settings as SettingsType } from "../types";
import StatsPanel from "./StatsPanel";
import { Section } from "./settings/SettingsWidgets";
import AiSettings from "./settings/AiSettings";
import AppearanceSettings from "./settings/AppearanceSettings";
import AppSettings from "./settings/AppSettings";
import DataSettings from "./settings/DataSettings";
import MemorySettings from "./settings/MemorySettings";
import PromptsSettings from "./settings/PromptsSettings";
import SecuritySettings from "./settings/SecuritySettings";
import ManualSettings from "./settings/ManualSettings";
import LegalSettings from "./settings/LegalSettings";
import { msg, useT } from "../i18n";

// ─── Catégories de la navigation latérale ─────────────────────────────────────

type SettingsCat = "appearance" | "ai" | "prompts" | "memory" | "security" | "data" | "app" | "legal" | "stats" | "manual";

const NAV: { key: SettingsCat; label: string; desc: string; icon: React.ReactNode; keywords: string }[] = [
  { key: "appearance", label: msg("Apparence"),                 desc: msg("Langue, thème, typographie de l'éditeur, extras"),   icon: <Palette size={14} />,      keywords: msg("langue theme couleur sombre clair police taille largeur editeur de d20 dice") },
  { key: "ai",         label: msg("Intelligence artificielle"), desc: msg("Fournisseur, clés API, modèles et comportement"),       icon: <Sparkles size={14} />,     keywords: msg("ia modele cle api ollama claude openai gemini mistral cli temperature contexte tokens fournisseur connexion historique conversation") },
  { key: "prompts",    label: msg("Prompts"),                   desc: msg("Prompts système des opérations IA"),                    icon: <ScrollText size={14} />,   keywords: msg("prompt correction resume traduction titre tri email continuation bibliotheque historique systeme shadow") },
  { key: "memory",     label: msg("Mémoire IA"),                desc: msg("Mémoire persistante et graphe neuronal"),               icon: <BrainCircuit size={14} />, keywords: msg("memoire graphe noeud neuronal collecte") },
  { key: "security",   label: msg("Sécurité"),                  desc: msg("Mot de passe, chiffrement, verrouillage automatique"),  icon: <Shield size={14} />,       keywords: msg("securite mot de passe pin verrouillage chiffrement aes argon lock recuperation") },
  { key: "data",       label: msg("Données"),                   desc: msg("Export, dossier de données, désinstallation"),          icon: <Database size={14} />,     keywords: msg("export zip sauvegarde donnees dossier desinstaller backup archive import") },
  { key: "app",        label: msg("Application"),               desc: msg("Démarrage, mises à jour, outils de développement"),     icon: <Wrench size={14} />,       keywords: msg("disclaimer avertissement debogage debug developpement demarrage mise a jour fermeture windows") },
  { key: "legal",      label: msg("Confidentialité"),           desc: msg("Conditions d'utilisation, politique de confidentialité, RGPD"), icon: <FileText size={14} />, keywords: msg("rgpd gdpr confidentialite vie privee conditions utilisation cgu cnil droits donnees personnelles licence") },
  { key: "manual",     label: msg("Manuel"),                    desc: msg("Guide d'utilisation : installer une IA, utiliser l'app, sécurité, sauvegardes"), icon: <BookOpen size={14} />, keywords: msg("manuel aide guide tutoriel installation ollama api cle claude cli node modele utilisation raccourcis sauvegarde recuperation") },
  { key: "stats",      label: msg("Statistiques"),              desc: msg("Activité et métriques de tes notes"),                   icon: <BarChart2 size={14} />,    keywords: msg("statistiques graphique mots notes activite tags kpi") },
];

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Settings() {
  const { settings, saveSettings, toggleSettings } = useStore();
  const t = useT();
  const [form, setForm] = useState<SettingsType>({ ...settings });
  const [cat, setCat] = useState<SettingsCat>(() => {
    const saved = localStorage.getItem("natia_settings_cat") as SettingsCat | null;
    return saved && NAV.some((n) => n.key === saved) ? saved : "appearance";
  });
  const [navQuery, setNavQuery] = useState("");
  const [closeAttempt, setCloseAttempt] = useState(false);

  // ── Navigation, recherche et détection de modifications ─────────────────────

  const selectCat = (key: SettingsCat) => {
    setCat(key);
    localStorage.setItem("natia_settings_cat", key);
  };

  const filteredNav = navQuery.trim()
    ? NAV.filter((n) => normalize(`${t(n.label)} ${t(n.desc)} ${t(n.keywords)} ${n.keywords}`).includes(normalize(navQuery)))
    : NAV;

  // Si la catégorie sélectionnée sort du filtre, bascule sur le premier résultat
  useEffect(() => {
    if (filteredNav.length > 0 && !filteredNav.some((n) => n.key === cat)) {
      setCat(filteredNav[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navQuery]);

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  useEffect(() => {
    if (!dirty) setCloseAttempt(false);
  }, [dirty]);

  const requestClose = () => {
    if (dirty) setCloseAttempt(true);
    else toggleSettings();
  };

  // Escape : intercepté ici (capture) pour protéger les modifications non sauvegardées
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (dirty) setCloseAttempt(true);
      else toggleSettings();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dirty, toggleSettings]);

  const set = (key: keyof SettingsType, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => { await saveSettings(form); toggleSettings(); };

  const current = NAV.find((n) => n.key === cat) ?? NAV[0];

  // ── Layout : navigation latérale + contenu + footer ─────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border rounded-xl w-[880px] max-w-[95vw] h-[85vh] max-h-[720px] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-primary">{t("Paramètres")}</h2>
          <button
            onClick={requestClose}
            aria-label={t("Fermer les paramètres")}
            className="text-muted hover:text-primary transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Navigation latérale */}
          <nav className="w-56 shrink-0 border-r border-border flex flex-col bg-sidebar/40">
            <div className="p-3 pb-2 shrink-0">
              <div className="flex items-center gap-2 bg-hover rounded-lg px-2.5 py-1.5">
                <Search size={13} className="text-muted shrink-0" />
                <input
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                  placeholder={t("Chercher un réglage…")}
                  aria-label={t("Chercher un réglage")}
                  className="bg-transparent text-xs text-primary placeholder-muted outline-none w-full"
                />
                {navQuery && (
                  <button onClick={() => setNavQuery("")} aria-label={t("Effacer")} className="text-muted hover:text-primary transition-colors shrink-0">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
              {filteredNav.length === 0 && (
                <p className="text-xs text-muted text-center py-4 px-2">{t("Aucun réglage ne correspond")}</p>
              )}
              {filteredNav.map((item) => {
                const active = cat === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => selectCat(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      active
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-secondary hover:bg-hover hover:text-primary"
                    }`}
                  >
                    <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
                    <span className="truncate">{t(item.label)}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Contenu de la catégorie */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            <div className="pb-1 border-b border-border/50">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <span className="text-accent">{current.icon}</span>
                {t(current.label)}
              </h3>
              <p className="text-xs text-muted mt-1">{t(current.desc)}</p>
            </div>
            {cat === "appearance" && <AppearanceSettings form={form} set={set} />}
            {cat === "ai" && <AiSettings form={form} set={set} setForm={setForm} />}
            {cat === "prompts" && <PromptsSettings form={form} set={set} setForm={setForm} />}
            {cat === "memory" && <MemorySettings />}
            {cat === "security" && <SecuritySettings form={form} set={set} />}
            {cat === "data" && <DataSettings />}
            {cat === "app" && <AppSettings form={form} set={set} />}
            {cat === "legal" && <LegalSettings goTo={selectCat} />}
            {cat === "manual" && <ManualSettings />}
            {cat === "stats" && (
              <Section title={t("Vue d'ensemble")}>
                <StatsPanel />
              </Section>
            )}
          </div>
        </div>

        {/* Footer : état des modifications + actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
          {closeAttempt ? (
            <>
              <span className="flex-1 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                ⚠ {t("Modifications non sauvegardées — que faire ?")}
              </span>
              <button
                onClick={() => setCloseAttempt(false)}
                className="px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
              >
                {t("Continuer l'édition")}
              </button>
              <button
                onClick={toggleSettings}
                className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-400/10 transition-colors"
              >
                {t("Ignorer et fermer")}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                {t("Sauvegarder et fermer")}
              </button>
            </>
          ) : (
            <>
              <span className={`flex-1 text-xs transition-colors ${dirty ? "text-amber-700 dark:text-amber-300" : "text-muted/50"}`}>
                {dirty ? `● ${t("Modifications non sauvegardées")}` : t("Aucune modification en attente")}
              </span>
              <button
                onClick={requestClose}
                className="px-4 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-hover transition-colors"
              >
                {dirty ? t("Annuler") : t("Fermer")}
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty}
                className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40"
              >
                {t("Sauvegarder")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

