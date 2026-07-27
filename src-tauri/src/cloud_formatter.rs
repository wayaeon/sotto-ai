//! Optional OpenRouter polish. The API key never crosses into the webview.

use serde::Deserialize;
use serde_json::json;
use std::{fs, path::PathBuf, time::Duration};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL: &str = "openai/gpt-5-nano";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFormatRequest {
    pub text: String,
    pub profile: String,
    pub app: Option<String>,
    pub site: Option<String>,
    pub field: Option<String>,
    pub active_file: Option<String>,
}

struct CloudConfig {
    api_key: String,
    model: String,
}

pub async fn format(request: CloudFormatRequest) -> Result<String, String> {
    let config = load_config().ok_or("Cloud formatting is not configured")?;
    if request.text.trim().is_empty() {
        return Ok(String::new());
    }
    let context = [
        request.app.as_deref().map(|value| format!("app={value}")),
        request.site.as_deref().map(|value| format!("site={value}")),
        request.field.as_deref().map(|value| format!("field={value}")),
        request.active_file.as_deref().map(|value| format!("active_file={value}")),
    ].into_iter().flatten().collect::<Vec<_>>().join(", ");
    let prompt = format!(
        "Return only the polished dictated text. Preserve meaning; never invent facts. Profile: {}. Context: {}. Text: {}",
        request.profile,
        if context.is_empty() { "none" } else { &context },
        request.text,
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "Cloud formatter unavailable")?;
    let response = client
        .post(OPENROUTER_URL)
        .bearer_auth(config.api_key)
        .json(&json!({
            "model": config.model,
            "messages": [
                {"role": "system", "content": "You format voice dictation for direct insertion. Do not add explanations, Markdown fences, or commentary."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "max_completion_tokens": 180,
            "reasoning": { "effort": "minimal", "exclude": true },
            "provider": {"data_collection": "deny", "sort": "latency"}
        }))
        .send()
        .await
        .map_err(|_| "Cloud formatter timed out")?;
    if !response.status().is_success() {
        return Err("Cloud formatter request failed".into());
    }
    let payload: serde_json::Value = response.json().await.map_err(|_| "Cloud formatter response was invalid")?;
    payload["choices"][0]["message"]["content"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Cloud formatter returned no text".into())
}

fn load_config() -> Option<CloudConfig> {
    let key = std::env::var("OPENROUTER_API_KEY").ok().or_else(|| env_value("OPENROUTER_API_KEY"))?;
    if key.trim().is_empty() { return None; }
    let model = std::env::var("OPENROUTER_MODEL").ok().or_else(|| env_value("OPENROUTER_MODEL"))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    Some(CloudConfig { api_key: key, model })
}

fn env_value(name: &str) -> Option<String> {
    env_paths().into_iter().find_map(|path| {
        let contents = fs::read_to_string(path).ok()?;
        contents.lines().find_map(|line| {
            let (key, value) = line.trim().split_once('=')?;
            (key == name).then(|| value.trim().to_string())
        })
    })
}

fn env_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(current) = std::env::current_dir() {
        paths.push(current.join(".env"));
        if let Some(parent) = current.parent() { paths.push(parent.join(".env")); }
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() { paths.push(parent.join(".env")); }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_model_is_used_when_the_env_omits_one() {
        assert_eq!(DEFAULT_MODEL, "openai/gpt-5-nano");
    }
}
