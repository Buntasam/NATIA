//! Icône dans la zone de notification (à côté de l'horloge) et lancement avec Windows.
//!
//! Fermer la fenêtre peut la cacher au lieu de quitter (réglage côté interface) :
//! NATIA reste alors active, les rappels continuent de sonner. « Quitter » dans
//! le menu de l'icône passe par l'interface (événement `tray-quit`) pour
//! enregistrer la note en cours avant de fermer.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

pub const QUIT_EVENT: &str = "tray-quit";
/// Argument ajouté au lancement automatique : démarrer caché, dans la zone de notification.
pub const MINIMIZED_ARG: &str = "--minimized";

/// Entrées du menu, gardées pour pouvoir changer leur langue.
struct TrayMenu { open: MenuItem<Wry>, lock: MenuItem<Wry>, quit: MenuItem<Wry> }

pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir NATIA", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Verrouiller", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &lock, &sep, &quit])?;
    app.manage(TrayMenu { open, lock, quit });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("NATIA")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "lock" => crate::system_lock::request_lock(app),
            "quit" => {
                show_main_window(app);
                let _ = app.emit(QUIT_EVENT, ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    if std::env::args().any(|a| a == MINIMIZED_ARG) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    }
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct TrayLabels { open: String, lock: String, quit: String }

/// Appelé par l'interface quand la langue change.
#[tauri::command]
pub fn set_tray_language(app: AppHandle, labels: TrayLabels) -> Result<(), String> {
    let m = app.try_state::<TrayMenu>().ok_or("Menu introuvable")?;
    for (item, text) in [(&m.open, labels.open), (&m.lock, labels.lock), (&m.quit, labels.quit)] {
        item.set_text(text).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let a = app.autolaunch();
    if enabled { a.enable() } else { a.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Fenêtre introuvable")?
        .hide()
        .map_err(|e| e.to_string())
}
