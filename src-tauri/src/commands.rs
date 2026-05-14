use tauri::AppHandle;
use serde_json::json;
use crate::sidecar::send_command;
use crate::injection::Injector;

#[tauri::command]
pub fn start_ptt(app: AppHandle) {
    send_command(&app, json!({"cmd": "start_ptt"}));
}

#[tauri::command]
pub fn stop_ptt(app: AppHandle) {
    send_command(&app, json!({"cmd": "stop_ptt"}));
}

#[tauri::command]
pub fn toggle_handsfree(app: AppHandle) {
    send_command(&app, json!({"cmd": "toggle_handsfree"}));
}

#[tauri::command]
pub fn ping_sidecar(app: AppHandle) {
    send_command(&app, json!({"cmd": "ping"}));
}

#[tauri::command]
pub fn detect_hardware(app: AppHandle) {
    send_command(&app, json!({"cmd": "detect_hardware"}));
}

#[tauri::command]
pub fn inject_text(text: String) -> Result<(), String> {
    let injector = Injector::new().map_err(|e| e.to_string())?;
    injector.inject(&text).map_err(|e| e.to_string())
}
