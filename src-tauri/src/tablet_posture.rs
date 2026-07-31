use tauri::{AppHandle, Emitter};

const EVENT: &str = "tablet_posture";

#[cfg(windows)]
fn is_tablet_posture() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CONVERTIBLESLATEMODE};
    unsafe { GetSystemMetrics(SM_CONVERTIBLESLATEMODE) == 0 }
}

#[cfg(not(windows))]
fn is_tablet_posture() -> bool { false }

pub fn start_tablet_posture_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous = None;
        loop {
            let posture = if is_tablet_posture() { "tablet" } else { "laptop" };
            if previous != Some(posture) {
                previous = Some(posture);
                let payload = format!(r#"{{"event":"{EVENT}","posture":"{posture}"}}"#);
                app.emit("sidecar-event", payload).ok();
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
}
