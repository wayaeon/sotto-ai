use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn spawn_sidecar(app: &AppHandle) {
    let shell = app.shell();
    let result = shell.sidecar("sidecar").expect("sidecar binary not found").spawn();

    match result {
        Ok((mut rx, child)) => {
            app.state::<SidecarState>()
                .child
                .lock()
                .unwrap()
                .replace(child);

            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line = String::from_utf8_lossy(&line).to_string();
                            app_handle.emit("sidecar-event", line).ok();
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar stderr] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(e) => {
                            eprintln!("[sidecar error] {e}");
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("[sidecar] terminated: {status:?}");
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[sidecar] failed to spawn: {e}");
        }
    }
}

pub fn send_command(app: &AppHandle, cmd: serde_json::Value) {
    let state = app.state::<SidecarState>();
    let mut lock = state.child.lock().unwrap();
    if let Some(child) = lock.as_mut() {
        let line = format!("{}\n", cmd);
        child.write(line.as_bytes()).ok();
    }
}
