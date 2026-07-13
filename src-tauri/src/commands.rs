use tauri::{AppHandle, Emitter};
use serde_json::json;
use crate::sidecar::send_command;
use crate::injection::Injector;

#[tauri::command]
pub fn open_url(url: String) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", &url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
}

#[tauri::command]
pub fn open_path(path: String) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", "", &path]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
}

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
pub fn set_model(app: AppHandle, model: String) {
    send_command(&app, json!({"cmd": "set_model", "model": model}));
}

#[tauri::command]
pub fn benchmark_model(app: AppHandle, model: String, audio_path: Option<String>) {
    send_command(&app, json!({"cmd": "benchmark_model", "model": model, "audio_path": audio_path}));
}

#[tauri::command]
pub fn set_dictionary(app: AppHandle, words: Vec<String>) {
    send_command(&app, json!({"cmd": "set_dictionary", "words": words}));
}

#[tauri::command]
pub fn inject_text(app: AppHandle, text: String) -> Result<(), String> {
    let t_start = std::time::Instant::now();
    let injector = Injector::new().map_err(|e| e.to_string())?;
    let pasted = injector.inject(&text).map_err(|e| e.to_string())?;
    let inject_ms = t_start.elapsed().as_millis() as u64;
    // Emit to ALL windows from Rust — guaranteed cross-window broadcast
    app.emit("inject-done", json!({ "inject_ms": inject_ms, "pasted": pasted })).ok();
    Ok(())
}
