import { invoke } from "@tauri-apps/api/core";
import { OllamaModel } from "../types";

export async function fetchModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const names = await invoke<string[]>("ollama_models", { baseUrl });
    return names.map((name) => ({ name, size: 0 }));
  } catch {
    return [];
  }
}

export async function chat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  return invoke<string>("ollama_chat", {
    baseUrl,
    model,
    system: systemPrompt,
    message: userMessage,
  });
}
