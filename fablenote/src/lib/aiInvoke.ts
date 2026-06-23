import { invoke } from "@tauri-apps/api/core";
import { Settings } from "../types";

type History = { role: string; content: string }[];

export async function aiChat(
  settings: Settings,
  system: string,
  message: string,
  ollamaModel?: string,
): Promise<string> {
  if (settings.ai_provider === "claude") {
    return invoke<string>("claude_chat", {
      apiKey: settings.claude_api_key,
      model: settings.claude_model,
      system,
      message,
    });
  }
  if (settings.ai_provider === "openai") {
    return invoke<string>("openai_chat", {
      apiKey: settings.openai_api_key,
      model: settings.openai_model,
      system,
      message,
    });
  }
  if (settings.ai_provider === "gemini") {
    return invoke<string>("gemini_chat", {
      apiKey: settings.gemini_api_key,
      model: settings.gemini_model,
      system,
      message,
    });
  }
  if (settings.ai_provider === "mistral") {
    return invoke<string>("mistral_chat", {
      apiKey: settings.mistral_api_key,
      model: settings.mistral_model,
      system,
      message,
    });
  }
  return invoke<string>("ollama_chat", {
    baseUrl: settings.ollama_url,
    model: ollamaModel ?? settings.default_model,
    system,
    message,
  });
}

export async function aiStream(
  settings: Settings,
  system: string,
  message: string,
  history: History = [],
  ollamaModel?: string,
): Promise<void> {
  if (settings.ai_provider === "claude") {
    return invoke<void>("claude_stream", {
      apiKey: settings.claude_api_key,
      model: settings.claude_model,
      system,
      message,
      history,
    });
  }
  if (settings.ai_provider === "openai") {
    return invoke<void>("openai_stream", {
      apiKey: settings.openai_api_key,
      model: settings.openai_model,
      system,
      message,
      history,
    });
  }
  if (settings.ai_provider === "gemini") {
    return invoke<void>("gemini_stream", {
      apiKey: settings.gemini_api_key,
      model: settings.gemini_model,
      system,
      message,
      history,
    });
  }
  if (settings.ai_provider === "mistral") {
    return invoke<void>("mistral_stream", {
      apiKey: settings.mistral_api_key,
      model: settings.mistral_model,
      system,
      message,
      history,
    });
  }
  return invoke<void>("ollama_stream", {
    baseUrl: settings.ollama_url,
    model: ollamaModel ?? settings.default_model,
    system,
    message,
    history,
  });
}

export function activeModel(settings: Settings, ollamaModel?: string): string {
  if (settings.ai_provider === "claude") return settings.claude_model;
  if (settings.ai_provider === "openai") return settings.openai_model;
  if (settings.ai_provider === "gemini") return settings.gemini_model;
  if (settings.ai_provider === "mistral") return settings.mistral_model;
  return ollamaModel ?? settings.default_model;
}
