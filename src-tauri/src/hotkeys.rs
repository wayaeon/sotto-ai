use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use serde_json::json;
use crate::sidecar::send_command;

pub fn register_hotkeys(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Ctrl+Win = push-to-talk (Wispr parity)
    let ptt_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::Space);
    // Ctrl+Win+Shift+Space = hands-free toggle
    let handsfree_shortcut = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SUPER | Modifiers::SHIFT),
        Code::Space,
    );

    let app_ptt = app.clone();
    let app_hf = app.clone();

    app.global_shortcut().on_shortcut(ptt_shortcut, move |_app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed => send_command(&app_ptt, json!({"cmd": "start_ptt"})),
            ShortcutState::Released => send_command(&app_ptt, json!({"cmd": "stop_ptt"})),
        }
    })?;

    app.global_shortcut().on_shortcut(handsfree_shortcut, move |_app, _shortcut, _event| {
        send_command(&app_hf, json!({"cmd": "toggle_handsfree"}));
    })?;

    Ok(())
}
