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
                _ => {}
            }
        }) {
            eprintln!("[hotkey] global listener failed: {error:?}");
        }
    });

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        eprintln!("[hotkey] raw rdev listener disabled on macOS; use the native capsule/menu bar controls");
    }
}
