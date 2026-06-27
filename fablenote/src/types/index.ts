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
  ai_provider: "ollama" | "claude" | "openai" | "gemini" | "mistral" | "claude_cli";
  claude_api_key: string;
  claude_model: string;
  openai_api_key: string;
  openai_model: string;
  gemini_api_key: string;
  gemini_model: string;
  mistral_api_key: string;
  mistral_model: string;
  auto_lock_minutes: number;
  editor_font_size: number;
  editor_font_family: string;
  editor_max_width: string;
  context_messages: number;
  debug_mode: boolean;
  prompt_intensity: "eco" | "low" | "medium" | "high" | "max";
}

export interface PromptVersion {
  id: string;
  prompt_key: string;
  value: string;
  saved_at: string;
}

export interface TrashItem {
  id: string;
  title: string;
  item_type: "note" | "folder";
  folder: string | null;
  deleted_at: string;
  note_count: number | null;
}

export type AiOperation = "correct" | "summarize" | "rename" | "sort";

export interface OllamaModel {
  name: string;
  size: number;
}
