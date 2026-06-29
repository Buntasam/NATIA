use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

mod ai;
mod crypto;
mod db;
mod notes;
mod settings;

// ─── App state ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub db: Mutex<Connection>,
    pub notes_dir: PathBuf,
    pub enc_key: Mutex<Option<[u8; 32]>>,
    pub failed_attempts: Mutex<u32>,
    pub lock_until: Mutex<Option<std::time::Instant>>,
}

// ─── Data types ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteMetadata {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub folder: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub folder: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Version {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub date: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub default_model: String,
    pub ollama_url: String,
    pub global_shadow_prompt: String,
    pub correct_prompt: String,
    pub summary_prompt: String,
    pub rename_prompt: String,
    pub sort_prompt: String,
    pub formalize_prompt: String,
    pub translate_prompt: String,
    pub continue_prompt: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_ai_provider")]
    pub ai_provider: String,
    #[serde(default)]
    pub claude_api_key: String,
    #[serde(default = "default_claude_model")]
    pub claude_model: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default = "default_gemini_model")]
    pub gemini_model: String,
    #[serde(default)]
    pub mistral_api_key: String,
    #[serde(default = "default_mistral_model")]
    pub mistral_model: String,
    #[serde(default)]
    pub auto_lock_minutes: u32,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u32,
    #[serde(default = "default_editor_font_family")]
    pub editor_font_family: String,
    #[serde(default = "default_editor_max_width")]
    pub editor_max_width: String,
    #[serde(default)]
    pub context_messages: u32,
    #[serde(default)]
    pub debug_mode: bool,
    #[serde(default = "default_prompt_intensity")]
    pub prompt_intensity: String,
}

fn default_temperature() -> f64 { 0.7 }
fn default_prompt_intensity() -> String { "medium".to_string() }
fn default_ai_provider() -> String { "ollama".to_string() }
fn default_editor_font_size() -> u32 { 16 }
fn default_editor_font_family() -> String { "system".to_string() }
fn default_editor_max_width() -> String { "normal".to_string() }
fn default_claude_model() -> String { "claude-haiku-4-5-20251001".to_string() }
fn default_openai_model() -> String { "gpt-4o-mini".to_string() }
fn default_gemini_model() -> String { "gemini-2.0-flash".to_string() }
fn default_mistral_model() -> String { "mistral-small-latest".to_string() }

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_model: "gemma3:1b".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            global_shadow_prompt: "Tu es NATIA, un assistant de prise de notes expert. Sois direct, précis et utile. Réponds TOUJOURS en français sauf si une autre langue est explicitement demandée. Ne te présente pas, ne conclus pas avec des formules de politesse — va directement à l'essentiel.".to_string(),
            correct_prompt: "Tu es un correcteur orthographique professionnel. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. INTERDIT : reformuler, changer le style, réorganiser les idées, ajouter ou supprimer du contenu. Retourne SEULEMENT le texte corrigé, sans guillemets, sans commentaire, sans introduction. Texte à corriger :".to_string(),
            summary_prompt: "Rédige un résumé en 2 à 3 phrases en français. Capture uniquement les idées essentielles. Réponds SEULEMENT avec le résumé, sans introduction, sans \"Résumé :\", sans commentaire. Texte :".to_string(),
            rename_prompt: "Génère un titre de note en français de 3 à 5 mots. Le titre doit refléter le sujet central. Réponds avec le titre UNIQUEMENT : sans guillemets, sans point final, sans explication. Texte :".to_string(),
            sort_prompt: "Analyse ces notes et assigne chacune à un dossier thématique. Utilise des sous-dossiers avec / pour plus de précision (ex: Travail/Projets). Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans bloc de code : [{\"id\":\"uuid\",\"folder\":\"NomDossier\"}]".to_string(),
            formalize_prompt: "Transforme ce texte en email professionnel en français. Structure obligatoire : \"Bonjour,\" (saut de ligne), corps clair et structuré, \"Cordialement,\" (saut de ligne), prénom/nom si mentionné sinon omis. Réponds UNIQUEMENT avec l'email, sans guillemets, sans commentaire :".to_string(),
            translate_prompt: "Traduis le texte suivant en respectant strictement le style, le registre et le ton de l'original. Réponds UNIQUEMENT avec la traduction, sans introduction, sans commentaire, sans guillemets. Texte :".to_string(),
            continue_prompt: "Continue ce texte de façon fluide et cohérente. Respecte strictement le style, le registre et le ton de l'auteur. Écris 80 à 150 mots. Réponds UNIQUEMENT avec le texte à ajouter, en continuant directement là où le texte s'arrête, sans en-tête ni commentaire. Texte :".to_string(),
            temperature: 0.7,
            ai_provider: "ollama".to_string(),
            claude_api_key: String::new(),
            claude_model: "claude-haiku-4-5-20251001".to_string(),
            openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".to_string(),
            gemini_api_key: String::new(),
            gemini_model: "gemini-2.0-flash".to_string(),
            mistral_api_key: String::new(),
            mistral_model: "mistral-small-latest".to_string(),
            auto_lock_minutes: 0,
            editor_font_size: 16,
            editor_font_family: "system".to_string(),
            editor_max_width: "normal".to_string(),
            context_messages: 0,
            debug_mode: false,
            prompt_intensity: "medium".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptVersion {
    pub id: String,
    pub prompt_key: String,
    pub value: String,
    pub saved_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrashItem {
    pub id: String,
    pub title: String,
    pub item_type: String,
    pub folder: Option<String>,
    pub deleted_at: String,
    pub note_count: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReminderItem {
    pub note_id: String,
    pub note_title: String,
    pub due_date: String,
    pub done: bool,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub key_value: String,
    pub color: String,
    pub model: String,
}

// ─── Entry point ──────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("cannot resolve app data dir");
            let notes_dir = data_dir.join("notes");
            std::fs::create_dir_all(&notes_dir).expect("cannot create notes dir");
            db::init_git(&notes_dir);

            let db_path = data_dir.join("natia.db");
            let conn = Connection::open(&db_path).expect("cannot open database");
            db::init_db(&conn).expect("cannot init database");

            app.manage(AppState {
                db: Mutex::new(conn),
                notes_dir,
                enc_key: Mutex::new(None),
                failed_attempts: Mutex::new(0),
                lock_until: Mutex::new(None),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes::get_all_notes,
            notes::get_note,
            notes::create_note,
            notes::update_note,
            notes::rename_note,
            notes::delete_note,
            notes::get_versions,
            notes::get_version_content,
            notes::restore_version,
            notes::trim_note_versions,
            notes::get_folders,
            notes::create_folder,
            notes::delete_folder,
            notes::rename_folder,
            notes::move_note,
            notes::get_trash,
            notes::restore_from_trash,
            notes::permanent_delete_item,
            notes::empty_trash,
            notes::reveal_data_dir,
            notes::export_zip,
            notes::save_zip_to_path,
            notes::export_note_to_path,
            notes::search_notes,
            notes::get_global_stats,
            notes::get_all_reminders,
            settings::get_settings,
            settings::update_settings,
            settings::get_prompt_versions,
            settings::delete_prompt_version,
            settings::get_api_keys,
            settings::upsert_api_key,
            settings::delete_api_key,
            settings::get_colors,
            settings::set_color,
            settings::delete_color,
            settings::has_password,
            settings::get_password_type,
            settings::setup_password,
            settings::verify_password,
            settings::change_password,
            settings::remove_password,
            settings::lock_app,
            settings::set_window_theme,
            ai::ollama_test_simple,
            ai::ollama_chat,
            ai::ollama_models,
            ai::ollama_stream,
            ai::ollama_pull,
            ai::claude_chat,
            ai::claude_stream,
            ai::generate_image,
            ai::openai_chat,
            ai::openai_stream,
            ai::gemini_chat,
            ai::gemini_stream,
            ai::mistral_chat,
            ai::mistral_stream,
            ai::connection_chat,
            ai::connection_stream,
            ai::check_claude_cli,
            ai::claude_cli_chat,
            ai::claude_cli_stream,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}
