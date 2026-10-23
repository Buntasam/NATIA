import { invoke } from "@tauri-apps/api/core";
import { Settings } from "../types";
import { useLang } from "../i18n";
import { promptIn } from "../i18n/prompts";

type History = { role: string; content: string }[];

const INTENSITY: Record<string, string> = {
  eco: "[CONSIGNE DE LONGUEUR : Réponds en 1 à 2 phrases maximum. Sois ultra-concis, va à l'essentiel.]",
  low: "[CONSIGNE DE LONGUEUR : Réponds en 3 à 5 phrases maximum. Reste concis et direct.]",
  high: "[CONSIGNE DE LONGUEUR : Développe ta réponse avec des détails pertinents et des exemples si utile. Tu peux aller jusqu'à 300 mots.]",
  max: "[CONSIGNE DE LONGUEUR : Réponse exhaustive et structurée. Utilise des sections, des exemples, une analyse complète. Ne te limite pas dans la longueur.]",
};

function applyIntensity(system: string, intensity?: string): string {
  // medium (ou inconnu) : pas de contrainte ajoutée
  const rule = intensity ? INTENSITY[intensity] : undefined;
  return rule ? `${system}\n\n${promptIn(rule, useLang.getState().lang)}` : system;
}

export async function aiChat(
  settings: Settings,
  system: string,
  message: string,
  ollamaModel?: string,
): Promise<string> {
  const temperature = settings.temperature ?? 0.7;
  const sys = applyIntensity(system, settings.prompt_intensity);
  if (settings.ai_provider === "claude") {
    return invoke<string>("claude_chat", {
      apiKey: settings.claude_api_key,
      model: settings.claude_model,
      system: sys,
      message,
      temperature,
    });
  }
  if (settings.ai_provider === "openai") {
    return invoke<string>("openai_chat", {
      apiKey: settings.openai_api_key,
      model: settings.openai_model,
      system: sys,
      message,
      temperature,
    });
  }
  if (settings.ai_provider === "gemini") {
    return invoke<string>("gemini_chat", {
      apiKey: settings.gemini_api_key,
      model: settings.gemini_model,
      system: sys,
      message,
      temperature,
    });
  }
  if (settings.ai_provider === "mistral") {
    return invoke<string>("mistral_chat", {
      apiKey: settings.mistral_api_key,
      model: settings.mistral_model,
      system: sys,
      message,
      temperature,
    });
  }
  if (settings.ai_provider === "claude_cli") {
    return invoke<string>("claude_cli_chat", { system: sys, message });
  }
  if (settings.ai_provider === "local") {
    return invoke<string>("llm_chat", { modelId: settings.local_model, system: sys, message, temperature });
  }
  return invoke<string>("ollama_chat", {
    baseUrl: settings.ollama_url,
    model: ollamaModel ?? settings.default_model,
    system: sys,
    message,
    temperature,
  });
}

export async function aiStream(
  settings: Settings,
  system: string,
  message: string,
  history: History = [],
  ollamaModel?: string,
): Promise<void> {
  const temperature = settings.temperature ?? 0.7;
  const sys = applyIntensity(system, settings.prompt_intensity);
  if (settings.ai_provider === "claude") {
    return invoke<void>("claude_stream", {
      apiKey: settings.claude_api_key,
      model: settings.claude_model,
      system: sys,
      message,
      temperature,
      history,
    });
  }
  if (settings.ai_provider === "openai") {
    return invoke<void>("openai_stream", {
      apiKey: settings.openai_api_key,
      model: settings.openai_model,
      system: sys,
      message,
      temperature,
      history,
    });
  }
  if (settings.ai_provider === "gemini") {
    return invoke<void>("gemini_stream", {
      apiKey: settings.gemini_api_key,
      model: settings.gemini_model,
      system: sys,
      message,
      temperature,
      history,
    });
  }
  if (settings.ai_provider === "mistral") {
    return invoke<void>("mistral_stream", {
      apiKey: settings.mistral_api_key,
      model: settings.mistral_model,
      system: sys,
      message,
      temperature,
      history,
    });
  }
  if (settings.ai_provider === "claude_cli") {
    return invoke<void>("claude_cli_stream", { system: sys, message, history });
  }
  if (settings.ai_provider === "local") {
    return invoke<void>("llm_stream", { modelId: settings.local_model, system: sys, message, temperature, history });
  }
  return invoke<void>("ollama_stream", {
    baseUrl: settings.ollama_url,
    model: ollamaModel ?? settings.default_model,
    system: sys,
    message,
    temperature,
    history,
  });
}

export function activeModel(settings: Settings, ollamaModel?: string): string {
  if (settings.ai_provider === "claude") return settings.claude_model;
  if (settings.ai_provider === "openai") return settings.openai_model;
  if (settings.ai_provider === "gemini") return settings.gemini_model;
  if (settings.ai_provider === "mistral") return settings.mistral_model;
  if (settings.ai_provider === "claude_cli") return "claude (CLI)";
  if (settings.ai_provider === "local") return settings.local_model || "—";
  return ollamaModel ?? settings.default_model;
}
