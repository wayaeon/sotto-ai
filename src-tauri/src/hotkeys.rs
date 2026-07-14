use tauri::{AppHandle, Emitter};
use serde_json::json;
use crate::focus::emit_focused_app_async;
use crate::sidecar::send_command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub fn register_hotkeys(app: &AppHandle) {
    let app = app.clone();

    std::thread::spawn(move || {
        let ctrl_down  = Arc::new(AtomicBool::new(false));
        let ptt_active = Arc::new(AtomicBool::new(false));

        let ctrl1 = ctrl_down.clone();
        let ptt1  = ptt_active.clone();
        let app1  = app.clone();

        rdev::listen(move |event| {
            use rdev::EventType::*;
            use rdev::Key::*;

            match event.event_type {
                KeyPress(ControlLeft) | KeyPress(ControlRight) => {
                    ctrl1.store(true, Ordering::SeqCst);
                }
                KeyRelease(ControlLeft) | KeyRelease(ControlRight) => {
                    ctrl1.store(false, Ordering::SeqCst);
                    if ptt1.swap(false, Ordering::SeqCst) {
                        app1.emit("sidecar-event", r#"{"event":"status","msg":"processing"}"#).ok();
                        send_command(&app1, json!({"cmd": "stop_ptt"}));
                    }
                }
                KeyPress(MetaLeft) | KeyPress(MetaRight) => {
                    if ctrl1.load(Ordering::SeqCst) && !ptt1.load(Ordering::SeqCst) {
                        ptt1.store(true, Ordering::SeqCst);
                        app1.emit("sidecar-event", r#"{"event":"status","msg":"recording_ptt"}"#).ok();
                        send_command(&app1, json!({"cmd": "start_ptt"}));
                        // Off the hotkey thread — can block on a favicon fetch,
                        // must never delay start_ptt itself.
                        emit_focused_app_async(app1.clone());
                    }
                }
                KeyRelease(MetaLeft) | KeyRelease(MetaRight) => {
                    if ptt1.swap(false, Ordering::SeqCst) {
                        app1.emit("sidecar-event", r#"{"event":"status","msg":"processing"}"#).ok();
                        send_command(&app1, json!({"cmd": "stop_ptt"}));
                    }
                }
                _ => {}
            }
        }).ok();
    });
}
