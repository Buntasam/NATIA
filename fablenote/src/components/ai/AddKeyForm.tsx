import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Plus } from "lucide-react";
import { useT } from "../../i18n";
import { COLORS, PROVIDER_MODELS, defaultModelForProvider, detectProvider } from "./shared";

/** Ajout d'une connexion par clé API : le service est reconnu à la forme de la clé. */
export function AddKeyForm({ onAdded, onCancel }: { onAdded: (id: string) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [addKeyForm, setAddKeyForm] = useState({ name: "", provider: "", key_value: "", color: COLORS[0], model: "" });
  const [addKeySaving, setAddKeySaving] = useState(false);

  return (
    <div className="mx-3 mb-2 flex flex-col gap-2 p-3 rounded-lg border border-accent/30 bg-accent/5">
      <div className="relative">
        <input
          type="password"
          value={addKeyForm.key_value}
          onChange={(e) => {
            const key = e.target.value;
            const detected = detectProvider(key);
            setAddKeyForm((f) => ({
              ...f, key_value: key,
              ...(detected ? { provider: detected, model: defaultModelForProvider(detected) } : {}),
              ...(detected && !f.name ? { name: detected } : {}),
            }));
          }}
          placeholder={t("Colle ta clé API (sk-ant-..., sk-..., AIza...)")}
          className="w-full bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 placeholder-muted font-mono"
        />
        {addKeyForm.provider && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-accent font-medium">{addKeyForm.provider}</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={addKeyForm.name}
          onChange={(e) => setAddKeyForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t("Nom de la connexion")}
          className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 placeholder-muted"
        />
        <div className="flex gap-1 items-center">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setAddKeyForm((f) => ({ ...f, color: c }))}
              className="w-4 h-4 rounded-full transition-transform hover:scale-110 shrink-0"
              style={{ backgroundColor: c, outline: c === addKeyForm.color ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
            />
          ))}
        </div>
      </div>
      {PROVIDER_MODELS[addKeyForm.provider] && (
        <select
          value={addKeyForm.model}
          onChange={(e) => setAddKeyForm((f) => ({ ...f, model: e.target.value }))}
          className="w-full bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none"
        >
          {PROVIDER_MODELS[addKeyForm.provider].map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button
          disabled={!addKeyForm.key_value.trim() || !addKeyForm.name.trim() || addKeySaving}
          onClick={async () => {
            if (!addKeyForm.key_value.trim() || !addKeyForm.name.trim()) return;
            setAddKeySaving(true);
            try {
              const id = crypto.randomUUID();
              await invoke("upsert_api_key", { key: { id, ...addKeyForm } });
              await onAdded(id);
            } finally { setAddKeySaving(false); }
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs transition-colors"
        >
          {addKeySaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          {t("Ajouter")}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-hover text-muted text-xs transition-colors">{t("Annuler")}</button>
      </div>
    </div>
  );
}
