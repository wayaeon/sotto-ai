use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use serde_json::json;
use crate::sidecar::send_command;

pub fn register_hotkeys(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Ctrl+Win (hold to record, release to stop).
    // MetaLeft is the Left Windows key treated as a key, CONTROL as modifier.
    let ptt_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::MetaLeft);

    // Ctrl+Win+Space = toggle hands-free.
    // CONTROL | META are modifiers, Space is the key.
    let handsfree_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::META), Code::Space);

    let app_ptt = app.clone();
    let app_hf  = app.clone();

    if let Err(e) = app.global_shortcut().on_shortcut(ptt_shortcut, move |_app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed  => send_command(&app_ptt, json!({"cmd": "start_ptt"})),
            ShortcutState::Released => send_command(&app_ptt, json!({"cmd": "stop_ptt"})),
        }
    }) {
        eprintln!("[hotkeys] PTT shortcut (Ctrl+Win) failed: {e}");
    }

    if let Err(e) = app.global_shortcut().on_shortcut(handsfree_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            send_command(&app_hf, json!({"cmd": "toggle_handsfree"}));
        }
    }) {
        eprintln!("[hotkeys] Hands-free shortcut (Ctrl+Win+Space) failed: {e}");
    }

    Ok(())
}
