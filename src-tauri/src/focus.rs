//! Detects the app (and, for browsers, the site) the user is dictating into.
//!
//! Two-tier: always try to get the focused process's own icon (fully local,
//! no network). If that process is a known browser, additionally try to read
//! its address bar via UI Automation and fetch the site's favicon from
//! icons.duckduckgo.com (only the domain is sent, e.g. "github.com" — never
//! the full URL or page content). This tier needs network access and is
//! inherently more fragile (UI Automation trees differ per browser and shift
//! across updates), so any failure — including being offline — falls back to
//! the browser's own icon instead of showing nothing.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::io::Cursor;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

/// Detects the focused app off the calling thread and emits the result to
/// every window. Emits twice for browsers: the local app icon lands first
/// (fast — no network, no UI Automation traversal) so the pill never waits
/// on the slow path just to show *something*, then a second event follows
/// with the site-specific favicon if that resolves. Must never be called
/// from a thread that needs to stay responsive (the hotkey listener thread,
/// the sidecar's stdout loop) since the favicon phase can block on network.
pub fn emit_focused_app_async(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(exe_path) = focused_process_path() else { return };
        let file_name = exe_path
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or(&exe_path)
            .to_string();
        let app_icon = extract_app_icon(&exe_path);
        let browser = BROWSER_EXES
            .iter()
            .find(|(exe, _)| file_name.eq_ignore_ascii_case(exe));

        let fast_name = match browser {
            Some((_, label)) => label.to_string(),
            None => file_name.strip_suffix(".exe").unwrap_or(&file_name).to_string(),
        };
        app.emit(
            "focused-app",
            FocusedApp { name: fast_name, icon_data_uri: app_icon, kind: "app" },
        )
        .ok();

        if browser.is_some() {
            if let Some(site) = detect_browser_site() {
                app.emit("focused-app", site).ok();
            }
        }
    });
}

#[derive(Serialize, Clone)]
pub struct FocusedApp {
    pub name: String,
    pub icon_data_uri: Option<String>,
    pub kind: &'static str, // "app" | "site"
}

const BROWSER_EXES: &[(&str, &str)] = &[
    ("chrome.exe", "Chrome"),
    ("msedge.exe", "Edge"),
    ("firefox.exe", "Firefox"),
    ("zen.exe", "Zen"),
    ("brave.exe", "Brave"),
];

fn focused_process_path() -> Option<String> {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; MAX_PATH as usize];
        let mut len = buf.len() as u32;
        let result = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        result.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

fn extract_app_icon(exe_path: &str) -> Option<String> {
    let rgba = windows_icons::get_icon_by_path(exe_path);
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return None;
    }
    rgba_to_data_uri(rgba.into_raw(), width, height)
}

fn rgba_to_data_uri(pixels: Vec<u8>, width: u32, height: u32) -> Option<String> {
    let img = image::RgbaImage::from_raw(width, height, pixels)?;
    let mut png_bytes: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .ok()?;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(png_bytes)))
}

/// Reads the current URL from a Chromium-based browser's address bar via UI
/// Automation and fetches the site's favicon. Firefox/Zen use a different
/// accessibility tree shape that isn't covered here — falls through to the
/// browser-icon fallback in detect_focused_app for those.
fn detect_browser_site() -> Option<FocusedApp> {
    let url = read_chromium_address_bar()?;
    let domain = extract_domain(&url)?;
    let favicon = fetch_favicon(&domain);
    Some(FocusedApp {
        name: domain,
        icon_data_uri: favicon,
        kind: "site",
    })
}

fn read_chromium_address_bar() -> Option<String> {
    use uiautomation::UIAutomation;

    let automation = UIAutomation::new().ok()?;
    let root = automation.get_root_element().ok()?;
    // Chromium address bars expose AutomationId "omnibox" or a
    // "Address and search bar" name — try both since it varies by version.
    let matcher = automation
        .create_matcher()
        .from(root)
        .filter_fn(Box::new(|e: &uiautomation::UIElement| {
            let id_hit = e.get_automation_id().map(|s| s == "omnibox").unwrap_or(false);
            let name_hit = e
                .get_name()
                .map(|s| s.to_lowercase().contains("address and search"))
                .unwrap_or(false);
            Ok(id_hit || name_hit)
        }))
        .depth(20);
    let element = matcher.find_first().ok()?;
    let value_pattern = element
        .get_pattern::<uiautomation::patterns::UIValuePattern>()
        .ok()?;
    let text = value_pattern.get_value().ok()?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

fn extract_domain(url_or_text: &str) -> Option<String> {
    let trimmed = url_or_text.trim();
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let domain = without_scheme.split(['/', '?', '#']).next()?;
    if domain.is_empty() || domain.contains(' ') || !domain.contains('.') {
        return None; // looks like a search query typed in the omnibox, not a URL
    }
    Some(domain.to_string())
}

/// Only the bare domain is sent here (e.g. "github.com"), never the full URL,
/// query string, or page content. Requires network; any failure here
/// (offline included) is caught by the caller and falls back to the
/// browser's own local icon.
fn fetch_favicon(domain: &str) -> Option<String> {
    let url = format!("https://icons.duckduckgo.com/ip3/{domain}.ico");
    let response = reqwest::blocking::get(&url).ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().ok()?;
    let img = image::load_from_memory(&bytes).ok()?.to_rgba8();
    rgba_to_data_uri(img.as_raw().clone(), img.width(), img.height())
}
