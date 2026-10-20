import { useState } from "react";
import { useStore } from "../../store";
import { Section } from "./SettingsWidgets";
import { SettingsFormProps } from "./types";

export default function AppearanceSettings({ form, set }: Pick<SettingsFormProps, "form" | "set">) {
  const { theme, setTheme } = useStore();
  const [diceEnabled, setDiceEnabled] = useState(() => localStorage.getItem("natia_dice_enabled") === "1");
  return (
    <>
      <Section title="Apparence">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-secondary">Thème</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "light",    label: "Clair",   bg: "#f5f3ee", panel: "#e8e4db", accent: "#d97757", dark: false },
              { key: "dark",     label: "Sombre",  bg: "#242424", panel: "#303030", accent: "#d97757", dark: true  },
              { key: "midnight", label: "Minuit",  bg: "#0d1117", panel: "#1c2128", accent: "#818cf8", dark: true  },
              { key: "ink",      label: "Encre",   bg: "#0a0a0a", panel: "#171717", accent: "#e8b84b", dark: true  },
              { key: "foret",      label: "Forêt",      bg: "#0f1a14", panel: "#192620", accent: "#d97757", dark: true  },
              { key: "brume",      label: "Brume",      bg: "#eeecea", panel: "#dedad6", accent: "#5b7fa6", dark: false },
              { key: "sakura",     label: "Sakura",     bg: "#fdf6f0", panel: "#f1e2d6", accent: "#c97088", dark: false },
              { key: "crepuscule", label: "Crépuscule", bg: "#120d1e", panel: "#1f1535", accent: "#c084fc", dark: true  },
              { key: "ocean",      label: "Océan",      bg: "#071221", panel: "#0e2040", accent: "#22d3ee", dark: true  },
            ] as const).map(({ key, label, bg, panel, accent }) => {
              const active = theme === key;
              return (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                    active ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-border/60"
                  }`}
                  style={{ backgroundColor: bg }}
                  aria-label={`Thème ${label}`}
                >
                  <div className="w-full h-5 rounded-md" style={{ backgroundColor: panel }} />
                  <div className="w-4 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-[10px] font-medium" style={{ color: bg < "#888888" ? "#ffffff99" : "#00000099" }}>{label}</span>
                  {active && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor typography */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Police de l'éditeur</p>
            <p className="text-[10px] text-muted mt-0.5">Famille de caractères des notes</p>
          </div>
          <select value={form.editor_font_family} onChange={(e) => set("editor_font_family", e.target.value)}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value="system">Système</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Taille de la police</p>
            <p className="text-[10px] text-muted mt-0.5">Taille du texte dans l'éditeur</p>
          </div>
          <select value={form.editor_font_size} onChange={(e) => set("editor_font_size", Number(e.target.value))}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value={13}>Petite (13px)</option>
            <option value={15}>Normale (15px)</option>
            <option value={17}>Grande (17px)</option>
            <option value={19}>Très grande (19px)</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Largeur de l'éditeur</p>
            <p className="text-[10px] text-muted mt-0.5">Largeur max du contenu</p>
          </div>
          <select value={form.editor_max_width} onChange={(e) => set("editor_max_width", e.target.value)}
            className="text-xs bg-hover border border-border rounded-lg px-2 py-1.5 text-secondary focus:outline-none focus:border-accent/50">
            <option value="narrow">Étroit (600px)</option>
            <option value="normal">Normal (720px)</option>
            <option value="wide">Large (960px)</option>
            <option value="full">Pleine largeur</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Dé à 20 faces</p>
            <p className="text-[10px] text-muted mt-0.5">Panneau flottant draggable — écran de verrouillage et app</p>
          </div>
          <button
            role="switch"
            aria-checked={diceEnabled}
            onClick={() => {
              const next = !diceEnabled;
              setDiceEnabled(next);
              localStorage.setItem("natia_dice_enabled", next ? "1" : "0");
            }}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${diceEnabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${diceEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </Section>
    </>
  );
}
