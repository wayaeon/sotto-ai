from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_desktop_context_bridge_is_loopback_only_and_emits_validated_metadata():
    source = (ROOT / "src-tauri" / "src" / "context_bridge.rs").read_text(encoding="utf-8")

    assert 'TcpListener::bind("127.0.0.1:38471")' in source
    assert '"external-context"' in source
    assert "sanitize_context" in source
    assert "chrome-extension://" in source


def test_browser_and_cursor_companions_only_publish_metadata_to_the_local_bridge():
    browser = (ROOT / "integrations" / "verba-browser" / "service-worker.js").read_text(encoding="utf-8")
    cursor = (ROOT / "integrations" / "verba-cursor" / "extension.js").read_text(encoding="utf-8")

    assert "127.0.0.1:38471/context" in browser
    assert "activeFile" in cursor
    assert "workspaceFiles" not in cursor
    assert (ROOT / "integrations" / "verba-cursor" / ".vscode" / "launch.json").exists()
