import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, Edit2, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  provider: string;
  key_value: string;
  color: string;
  model: string;
}

const PROVIDERS = ["OpenAI", "Anthropic", "Mistral", "Groq", "Gemini", "Cohere", "Autre"];

function detectProvider(key: string): string {
  if (key.startsWith("sk-ant-")) return "Anthropic";
  if (key.startsWith("AIza")) return "Gemini";
  if (key.startsWith("gsk_")) return "Groq";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "Mistral";
  if (key.startsWith("sk-")) return "OpenAI";
  return "";
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  Anthropic: [
    { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — rapide · économique" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6 — équilibré · recommandé" },
    { value: "claude-opus-4-8", label: "Opus 4.8 — puissant · plus lent" },
  ],
  OpenAI: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini — rapide · économique" },
    { value: "gpt-4o", label: "GPT-4o — équilibré · recommandé" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo — puissant" },
    { value: "o1-mini", label: "o1 Mini — raisonnement" },
  ],
  Gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash — rapide · recommandé" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash — économique" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro — puissant" },
  ],
  Mistral: [
    { value: "mistral-small-latest", label: "Mistral Small — rapide · économique" },
    { value: "mistral-medium-latest", label: "Mistral Medium — équilibré" },
    { value: "mistral-large-latest", label: "Mistral Large — puissant" },
  ],
  Groq: [
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B — ultra rapide" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B — équilibré" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
};

function defaultModelForProvider(provider: string): string {
  const models = PROVIDER_MODELS[provider];
  return models?.[0]?.value ?? "";
}

const blank = (): Omit<ApiKey, "id"> => ({
  name: "",
  provider: "OpenAI",
  key_value: "",
  color: COLORS[0],
  model: PROVIDER_MODELS["OpenAI"][0].value,
});

function mask(k: string) {
  if (k.length <= 8) return "••••••••";
  return k.slice(0, 4) + "••••••••" + k.slice(-4);
}

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { reload(); }, []);

  const reload = async () => setKeys(await invoke<ApiKey[]>("get_api_keys"));

  const startAdd = () => { setForm(blank()); setEditId("new"); setShowKey(false); };
  const startEdit = (k: ApiKey) => { setForm({ name: k.name, provider: k.provider, key_value: k.key_value, color: k.color, model: k.model }); setEditId(k.id); setShowKey(false); };
  const cancel = () => setEditId(null);

  const save = async () => {
    if (!form.name.trim() || !form.key_value.trim()) return;
    const id = editId === "new" ? crypto.randomUUID() : editId!;
    await invoke("upsert_api_key", { key: { id, ...form } });
    await reload();
    setEditId(null);
  };

  const del = async (id: string) => {
    await invoke("delete_api_key", { id });
    await reload();
  };

  return (
    <div className="flex flex-col gap-2">
      {keys.length === 0 && editId === null && (
        <p className="text-xs text-muted italic py-1">Aucune clé API enregistrée.</p>
      )}

      {keys.map((k) =>
        editId === k.id ? (
          <Form key={k.id} form={form} setForm={setForm} showKey={showKey} setShowKey={setShowKey} onSave={save} onCancel={cancel} />
        ) : (
          <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-hover border border-border group">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: k.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary truncate">{k.name}</p>
              <p className="text-[10px] text-muted">{k.provider} · {mask(k.key_value)}</p>
            </div>
            <button onClick={() => startEdit(k)} title="Modifier" className="p-1 text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
              <Edit2 size={13} />
            </button>
            <button onClick={() => del(k.id)} title="Supprimer" className="p-1 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 size={13} />
            </button>
          </div>
        )
      )}

      {editId === "new" && (
        <Form form={form} setForm={setForm} showKey={showKey} setShowKey={setShowKey} onSave={save} onCancel={cancel} />
      )}

      {editId === null && (
        <button
          onClick={startAdd}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted hover:text-primary hover:border-accent/40 transition-colors text-sm"
        >
          <Plus size={13} />
          Ajouter une clé API
        </button>
      )}
    </div>
  );
}

function Form({ form, setForm, showKey, setShowKey, onSave, onCancel }: {
  form: Omit<ApiKey, "id">;
  setForm: React.Dispatch<React.SetStateAction<Omit<ApiKey, "id">>>;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleKeyChange = (key: string) => {
    const detected = detectProvider(key);
    setForm((f) => ({
      ...f,
      key_value: key,
      ...(detected ? { provider: detected, model: defaultModelForProvider(detected) } : {}),
      ...(detected && !f.name ? { name: detected } : {}),
    }));
  };
  const ok = form.name.trim() && form.key_value.trim();

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-lg border border-accent/30 bg-accent/5">
      <div className="flex gap-2">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Nom (ex : Clé OpenAI perso)"
          className="flex-1 bg-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent/50 placeholder-muted"
        />
        <select
          value={form.provider}
          onChange={(e) => {
            const p = e.target.value;
            setForm((f) => ({ ...f, provider: p, model: defaultModelForProvider(p) }));
          }}
          className="bg-hover border border-border rounded-lg px-2 py-1.5 text-sm text-primary outline-none"
        >
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {PROVIDER_MODELS[form.provider] && (
        <div className="relative">
          <select
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
            className="w-full bg-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none appearance-none"
          >
            {PROVIDER_MODELS[form.provider].map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      )}

      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={form.key_value}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-hover border border-border rounded-lg px-2.5 py-1.5 pr-20 text-sm text-primary outline-none focus:border-accent/50 placeholder-muted font-mono"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors"
        >
          {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
          {showKey ? "Masquer" : "Afficher"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Couleur :</span>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => set("color", c)}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
              style={{
                backgroundColor: c,
                outline: c === form.color ? "2px solid currentColor" : "1px solid rgba(0,0,0,0.15)",
                outlineOffset: c === form.color ? "2px" : "0",
                color: c,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!ok}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs transition-colors"
        >
          <Check size={12} /> Enregistrer
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-hover hover:bg-active text-muted text-xs transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}
