#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod hotkeys;
mod injection;
mod license;
mod sidecar;
mod storage;
mod tray;

use tauri::Manager;
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
            commands::download_model,
            commands::set_model,
            commands::set_dictionary,
            commands::inject_text,
        ])
        .setup(|app| {
            sidecar::spawn_sidecar(&app.handle());
            tray::setup_tray(app)?;
            hotkeys::register_hotkeys(&app.handle())?;

            // Position pill window at bottom-center of primary monitor
            if let Some(pill) = app.get_webview_window("pill") {
                if let Some(monitor) = pill.primary_monitor().ok().flatten() {
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    let screen_w = (size.width as f64 / scale) as i32;
                    let screen_h = (size.height as f64 / scale) as i32;
                    let pill_w = 380_i32;
                    let pill_h = 420_i32;
                    let x = (screen_w - pill_w) / 2;
                    let y = screen_h - pill_h; // pill flush at screen bottom, JS handles taskbar offset
                    let _ = pill.set_position(tauri::PhysicalPosition::new(
                        (x as f64 * scale) as i32,
                        (y as f64 * scale) as i32,
                    ));
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Tauri application");
}
