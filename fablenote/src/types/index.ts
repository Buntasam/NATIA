export interface NoteMetadata {
  id: string;
  title: string;
  tags: string[];
  folder: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteMetadata {
  content: string;
}

export interface Version {
  hash: string;
  short_hash: string;
  message: string;
  date: string;
}

export interface Settings {
  default_model: string;
  ollama_url: string;
  global_shadow_prompt: string;
  correct_prompt: string;
  summary_prompt: string;
  rename_prompt: string;
  sort_prompt: string;
  formalize_prompt: string;
  translate_prompt: string;
  continue_prompt: string;
  temperature: number;
}

export interface PromptVersion {
  id: string;
  prompt_key: string;
  value: string;
  saved_at: string;
}

export type AiOperation = "correct" | "summarize" | "rename" | "sort";

export interface OllamaModel {
  name: string;
  size: number;
}
