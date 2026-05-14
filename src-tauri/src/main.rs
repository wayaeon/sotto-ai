#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod hotkeys;
mod injection;
mod license;
mod sidecar;
mod storage;
mod tray;

use sidecar::SidecarState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(SidecarState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_ptt,
            commands::stop_ptt,
            commands::toggle_handsfree,
            commands::ping_sidecar,
            commands::detect_hardware,
            commands::inject_text,
        ])
        .setup(|app| {
            sidecar::spawn_sidecar(&app.handle());
            tray::setup_tray(app)?;
            hotkeys::register_hotkeys(&app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Tauri application");
}
