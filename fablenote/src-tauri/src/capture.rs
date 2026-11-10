//! Capture rapide : `Ctrl+Alt+N`, depuis n'importe quelle application, ouvre une petite
//! fenêtre pour noter une idée ou une tâche, même quand NATIA est cachée près de l'horloge.
//!
//! La fenêtre ne fait que saisir : elle envoie le texte à la fenêtre principale
//! (événement `quick-capture`), qui l'enregistre comme le reste et sait si l'app est
//! verrouillée. Rien n'est écrit sans mot de passe.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SHORTCUT: &str = "ctrl+alt+n";
const LABEL: &str = "capture";

/// Plugin du raccourci global : appuyer sur `SHORTCUT` montre la fenêtre de capture.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed { show(app); }
        })
        .build()
}

/// Enregistre le raccourci. Déjà pris par une autre application : NATIA démarre quand même.
pub fn register(app: &AppHandle) {
    if let Err(e) = app.global_shortcut().register(SHORTCUT) {
        eprintln!("capture rapide : raccourci {SHORTCUT} indisponible ({e})");
    }
}

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#capture".into()))
        .title("NATIA — Capture rapide")
        .inner_size(540.0, 200.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .build();
    if let Err(e) = built { eprintln!("capture rapide : {e}"); }
}

/// « Ouvrir NATIA » depuis la fenêtre de capture (app verrouillée, par exemple).
#[tauri::command]
pub fn open_main_window(app: AppHandle) {
    crate::tray::show_main_window(&app);
}
