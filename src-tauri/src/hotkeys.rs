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
        && !ptt_active.swap(true, Ordering::SeqCst)
    {
        app.emit("sidecar-event", r#"{"event":"status","msg":"recording_ptt"}"#).ok();
        send_command(app, json!({"cmd": "start_ptt"}));
        emit_focused_app_async(app.clone());
    }
}

pub fn register_hotkeys(app: &AppHandle) {
    let app = app.clone();

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
                    if ptt1.swap(false, Ordering::SeqCst) {
                        app1.emit("sidecar-event", r#"{"event":"status","msg":"processing"}"#).ok();
                        send_command(&app1, json!({"cmd": "stop_ptt"}));
                    }
                }
                KeyPress(Alt) => {
                    alt1.store(true, Ordering::SeqCst);
                    maybe_start_ptt(&app1, &ctrl1, &alt1, &ptt1);
                }
                KeyRelease(Alt) => {
                    alt1.store(false, Ordering::SeqCst);
                    if ptt1.swap(false, Ordering::SeqCst) {
                        app1.emit("sidecar-event", r#"{"event":"status","msg":"processing"}"#).ok();
                        send_command(&app1, json!({"cmd": "stop_ptt"}));
                    }
                }
                _ => {}
            }
        }) {
            eprintln!("[hotkey] global listener failed: {error:?}");
        }
    });
}
