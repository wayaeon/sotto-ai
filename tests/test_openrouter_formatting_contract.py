from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_openrouter_key_stays_in_rust_and_cloud_format_has_a_local_fallback_path():
    rust = (ROOT / "src-tauri" / "src" / "cloud_formatter.rs").read_text(encoding="utf-8")
    commands = (ROOT / "src-tauri" / "src" / "commands.rs").read_text(encoding="utf-8")
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")

    assert "OPENROUTER_API_KEY" in rust
    assert "https://openrouter.ai/api/v1/chat/completions" in rust
    assert "data_collection" in rust
    assert '"effort": "minimal"' in rust
    assert "cloud_format" in commands
    assert "cloudFormat(" in hook
    assert "finish(formatted);\n\n          void cloudFormat({" in hook
    assert ".catch(() => {})" in hook
