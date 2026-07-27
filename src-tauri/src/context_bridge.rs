//! Local-only metadata bridge for the optional browser and Cursor companions.
//!
//! It accepts no screen pixels, editor text, or audio. Extensions can only
//! publish a small active-app snapshot to the running Verba process.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::{TcpListener, TcpStream}};

const MAX_REQUEST_BYTES: usize = 8 * 1024;
const PORT: u16 = 38471;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalContext {
    pub source: String,
    pub app: String,
    pub site: Option<String>,
    pub field: Option<String>,
    pub active_file: Option<String>,
}

pub fn start_context_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::bind("127.0.0.1:38471").await else {
            eprintln!("[context] local bridge unavailable on port {PORT}");
            return;
        };
        loop {
            let Ok((stream, _)) = listener.accept().await else { continue };
            let app = app.clone();
            tauri::async_runtime::spawn(async move { handle_connection(stream, app).await });
        }
    });
}

async fn handle_connection(mut stream: TcpStream, app: AppHandle) {
    let mut buffer = vec![0_u8; MAX_REQUEST_BYTES];
    let Ok(read) = stream.read(&mut buffer).await else { return };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let origin = header(&request, "origin").unwrap_or_default();
    if !is_extension_origin(origin) {
        let _ = stream.write_all(&response("403 Forbidden", "")).await;
        return;
    }
    if request.starts_with("OPTIONS ") {
        let _ = stream.write_all(&response("204 No Content", origin)).await;
        return;
    }
    let Some(body) = request.split_once("\r\n\r\n").map(|(_, body)| body) else {
        let _ = stream.write_all(&response("400 Bad Request", origin)).await;
        return;
    };
    let Ok(context) = serde_json::from_str::<ExternalContext>(body) else {
        let _ = stream.write_all(&response("400 Bad Request", origin)).await;
        return;
    };
    let Some(context) = sanitize_context(context) else {
        let _ = stream.write_all(&response("400 Bad Request", origin)).await;
        return;
    };
    app.emit("external-context", context).ok();
    let _ = stream.write_all(&response("204 No Content", origin)).await;
}

fn header<'a>(request: &'a str, name: &str) -> Option<&'a str> {
    request.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name).then_some(value.trim())
    })
}

fn is_extension_origin(origin: &str) -> bool {
    origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
}

fn response(status: &str, origin: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: {origin}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\n\r\n"
    ).into_bytes()
}

fn sanitize_context(mut context: ExternalContext) -> Option<ExternalContext> {
    if !matches!(context.source.as_str(), "browser" | "cursor") || !valid(&context.app, 80) {
        return None;
    }
    context.site = context.site.filter(|value| valid(value, 180));
    context.active_file = context.active_file.filter(|value| valid(value, 512));
    context.field = context.field.filter(|value| matches!(value.as_str(), "email" | "compose" | "text" | "code"));
    Some(context)
}

fn valid(value: &str, max_len: usize) -> bool {
    !value.is_empty() && value.len() <= max_len && value.chars().all(|ch| ch.is_ascii_alphanumeric() || " ._-/:\\".contains(ch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_context_with_untrusted_source_or_field() {
        assert!(sanitize_context(ExternalContext { source: "web".into(), app: "Chrome".into(), site: None, field: None, active_file: None }).is_none());
        assert!(sanitize_context(ExternalContext { source: "browser".into(), app: "Chrome".into(), site: None, field: Some("screen".into()), active_file: None }).is_some());
    }
}
