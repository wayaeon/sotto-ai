use tauri::{AppHandle, Emitter};
use serde_json::json;
use crate::focus::emit_focused_app_async;
use crate::sidecar::send_command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn maybe_start_ptt(
    app: &AppHandle,
    ctrl_down: &AtomicBool,
    alt_down: &AtomicBool,
    ptt_active: &AtomicBool,
) {
    if ctrl_down.load(Ordering::SeqCst)
        && alt_down.load(Ordering::SeqCst)
    {
        start_ptt(app, ptt_active);
    }
}

fn start_ptt(app: &AppHandle, ptt_active: &AtomicBool) {
    if !ptt_active.swap(true, Ordering::SeqCst) {
        app.emit("sidecar-event", r#"{"event":"status","msg":"recording_ptt"}"#).ok();
        send_command(app, json!({"cmd": "start_ptt"}));
        emit_focused_app_async(app.clone());
    }
}

fn stop_ptt(app: &AppHandle, ptt_active: &AtomicBool) {
    if ptt_active.swap(false, Ordering::SeqCst) {
        app.emit("sidecar-event", r#"{"event":"status","msg":"processing"}"#).ok();
        send_command(app, json!({"cmd": "stop_ptt"}));
    }
}

pub fn register_hotkeys(app: &AppHandle) {
    let app = app.clone();

    // ponytail: keep the raw event tap on Windows only; macOS Spotlight and
    // rdev both install global event taps, and the overlap can terminate the
    // WebView process. The macOS capsule/menu-bar controls remain available.
    #[cfg(not(target_os = "macos"))]
    std::thread::spawn(move || {
        let ctrl_down  = Arc::new(AtomicBool::new(false));
        let alt_down   = Arc::new(AtomicBool::new(false));
        let ptt_active = Arc::new(AtomicBool::new(false));

        let ctrl1 = ctrl_down.clone();
        let alt1  = alt_down.clone();
        let ptt1  = ptt_active.clone();
        let app1  = app.clone();

        if let Err(error) = rdev::listen(move |event| {
            use rdev::EventType::*;
            use rdev::Key::*;

            match event.event_type {
                KeyPress(ControlLeft) | KeyPress(ControlRight) => {
                    ctrl1.store(true, Ordering::SeqCst);
                    maybe_start_ptt(&app1, &ctrl1, &alt1, &ptt1);
                }
                KeyRelease(ControlLeft) | KeyRelease(ControlRight) => {
                    ctrl1.store(false, Ordering::SeqCst);
                    stop_ptt(&app1, &ptt1);
                }
                KeyPress(Alt) => {
                    alt1.store(true, Ordering::SeqCst);
                    maybe_start_ptt(&app1, &ctrl1, &alt1, &ptt1);
                }
                KeyRelease(Alt) => {
                    alt1.store(false, Ordering::SeqCst);
                    stop_ptt(&app1, &ptt1);
                }
                KeyPress(Space) => {
                    // Deliberate hands-free arm/disarm (advertised as
                    // Ctrl+Alt+Space). Only meaningful outside an active PTT
                    // hold — starting a hold disarms hands-free on the
                    // sidecar side, so never toggle mid-recording.
                    if ctrl1.load(Ordering::SeqCst)
                        && alt1.load(Ordering::SeqCst)
                        && !ptt_active.load(Ordering::SeqCst)
                    {
                        send_command(&app1, json!({"cmd": "toggle_handsfree"}));
                    }
                }
                _ => {}
            }
        }) {
            eprintln!("[hotkey] global listener failed: {error:?}");
        }
    });

    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

        let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
        let shortcut_for_handler = shortcut.clone();
        let ptt_active = Arc::new(AtomicBool::new(false));
        let ptt_for_handler = ptt_active.clone();
        let app_for_handler = app.clone();

        if let Err(error) = app.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |_, active_shortcut, event| {
                    if active_shortcut != &shortcut_for_handler {
                        return;
                    }
                    match event.state() {
                        ShortcutState::Pressed => start_ptt(&app_for_handler, &ptt_for_handler),
                        ShortcutState::Released => stop_ptt(&app_for_handler, &ptt_for_handler),
                    }
                })
                .build(),
        ) {
            eprintln!("[hotkey] native macOS shortcut plugin failed: {error:?}");
            return;
        }

        if let Err(error) = app.global_shortcut().register(shortcut) {
            eprintln!("[hotkey] native macOS shortcut registration failed: {error:?}");
        } else {
            eprintln!("[hotkey] native macOS PTT registered: Control+Option+Space");
        }
    }
}
