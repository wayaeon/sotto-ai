use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager,
};

pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let quit     = MenuItem::with_id(app, "quit",     "Quit Sotto",  true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…",  true, None::<&str>)?;
    let menu     = Menu::with_items(app, &[&settings, &quit])?;

    let icon = Image::from_path(
        app.path().resource_dir()
            .unwrap_or_default()
            .join("icons/32x32.png"),
    )
    .unwrap_or_else(|_| app.default_window_icon().cloned().unwrap_or_else(|| Image::from_bytes(&[]).unwrap()));

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit"     => app.exit(0),
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
