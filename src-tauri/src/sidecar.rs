use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use crate::focus::emit_focused_app_async;

#[cfg(debug_assertions)]
use std::path::{Path, PathBuf};

#[cfg(debug_assertions)]
fn dev_python_path(repo_root: &Path) -> PathBuf {
    let interpreter = if cfg!(windows) {
        "sidecar/.venv/Scripts/python.exe"
    } else {
        "sidecar/.venv/bin/python"
    };
    repo_root.join(interpreter)
}

pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
    pub shutting_down: Arc<AtomicBool>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            shutting_down: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn spawn_sidecar(app: &AppHandle) {
    if app.state::<SidecarState>().shutting_down.load(Ordering::SeqCst) {
        return;
    }
    let shell = app.shell();
    let result = {
        #[cfg(debug_assertions)]
        {
            let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("src-tauri should have a repo parent")
                .to_path_buf();
            let dev_python = dev_python_path(&repo_root);

            shell.command(dev_python)
                .args(["-m", "sidecar.main"])
                .current_dir(repo_root)
                .spawn()
        }

        #[cfg(not(debug_assertions))]
        {
            shell.sidecar("sidecar").expect("sidecar binary not found").spawn()
        }
    };

    match result {
        Ok((mut rx, child)) => {
            // Kill any existing sidecar before replacing it to prevent zombie processes
            let state = app.state::<SidecarState>();
            let mut lock = state.child.lock().unwrap();
            if let Some(old_child) = lock.take() {
                let _ = old_child.kill();
            }
            lock.replace(child);
            drop(lock);  // Release lock before spawning async task

            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line = String::from_utf8_lossy(&line).to_string();
                            // Show the pill once the sidecar is done with its first
                            // load attempt — either worker_ready (success) or the idle
                            // that follows a failed/errored load. Guard with is_visible
                            // so subsequent idle events during normal use are ignored.
                            if line.contains("worker_ready") || line.contains("\"idle\"") {
                                if let Some(pill) = app_handle.get_webview_window("pill") {
                                    if !pill.is_visible().unwrap_or(true) {
                                        pill.show().ok();
                                    }
                                }
                            }
                            // A hands-free utterance just started (VAD onset committed
                            // on the Python side) — this is the hands-free equivalent
                            // of the PTT hotkey press, so detect focus here too.
                            if line.contains("handsfree_ptt") || line.contains("wake_dictating") {
                                emit_focused_app_async(app_handle.clone());
                            }
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
                            if app_handle.state::<SidecarState>().shutting_down.load(Ordering::SeqCst) {
                                break;
                            }
                            app_handle
                                .emit("sidecar-event", r#"{"event":"error","msg":"sidecar_crashed"}"#)
                                .ok();
                            // Wait 1.5 s then respawn so we don't tight-loop on a broken binary.
                            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                            spawn_sidecar(&app_handle);
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

pub fn shutdown_sidecar(app: &AppHandle) {
    let state = app.state::<SidecarState>();
    if state.shutting_down.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(mut child) = state.child.lock().unwrap().take() else { return };
    let _ = child.write(b"{\"cmd\":\"quit\"}\n");

    #[cfg(windows)]
    {
        // The Python transcription worker is a child of this process. Kill the
        // tree on host exit so interrupted dev sessions cannot strand a model.
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &child.pid().to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(windows))]
    let _ = child.kill();
}

#[cfg(test)]
mod tests {
    use super::dev_python_path;
    use std::path::Path;

    #[test]
    fn dev_python_path_uses_the_platform_venv_layout() {
        let path = dev_python_path(Path::new("repo"));
        let expected = if cfg!(windows) {
            "repo/sidecar/.venv/Scripts/python.exe"
        } else {
            "repo/sidecar/.venv/bin/python"
        };

        assert_eq!(path.to_string_lossy().replace('\\', "/"), expected);
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
