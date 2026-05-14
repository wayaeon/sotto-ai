use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use serde_json::json;
use crate::sidecar::send_command;

pub fn register_hotkeys(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Ctrl+Shift+F9 = push-to-talk (safe default; user can remap in settings)
    // Avoiding Ctrl+Win+Space which Windows reserves for input language switching
    let ptt_shortcut = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SHIFT),
        Code::F9,
    );
    // Ctrl+Shift+F10 = hands-free toggle
    let handsfree_shortcut = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SHIFT),
        Code::F10,
    );

    let app_ptt = app.clone();
    let app_hf = app.clone();

    if let Err(e) = app.global_shortcut().on_shortcut(ptt_shortcut, move |_app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed => send_command(&app_ptt, json!({"cmd": "start_ptt"})),
            ShortcutState::Released => send_command(&app_ptt, json!({"cmd": "stop_ptt"})),
        }
    }) {
        eprintln!("[hotkeys] PTT shortcut registration failed (already taken?): {e}");
    }

    if let Err(e) = app.global_shortcut().on_shortcut(handsfree_shortcut, move |_app, _shortcut, _event| {
        send_command(&app_hf, json!({"cmd": "toggle_handsfree"}));
    }) {
        eprintln!("[hotkeys] Hands-free shortcut registration failed (already taken?): {e}");
    }

    Ok(())
}
