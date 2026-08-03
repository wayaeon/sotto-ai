import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_updater_is_configured_for_signed_github_releases():
    config = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    updater = config["plugins"]["updater"]
    assert config["bundle"]["createUpdaterArtifacts"] is True
    assert updater["endpoints"] == [
        "https://github.com/wayaeon/sotto-ai/releases/latest/download/latest.json"
    ]
    assert updater["pubkey"] and "YOUR_" not in updater["pubkey"]

    cargo = (ROOT / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8")
    assert "tauri-plugin-updater" in cargo
    assert "tauri-plugin-process" in cargo

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert "@tauri-apps/plugin-updater" in package["dependencies"]
    assert "@tauri-apps/plugin-process" in package["dependencies"]

    capability = json.loads((ROOT / "src-tauri" / "capabilities" / "default.json").read_text(encoding="utf-8"))
    assert "process:default" in capability["permissions"]
    assert "updater:default" in capability["permissions"]


def test_tagged_releases_publish_signed_updater_artifacts():
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    assert 'tags:' in workflow
    assert '"v*"' in workflow
    assert "TAURI_SIGNING_PRIVATE_KEY" in workflow
    assert "releaseDraft: false" in workflow


def test_runtime_update_flow_is_non_blocking_and_can_relaunch():
    main = (ROOT / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")
    updater = (ROOT / "src" / "lib" / "updater.ts").read_text(encoding="utf-8")
    app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
    notice = (ROOT / "src" / "components" / "UpdateNotice.tsx").read_text(encoding="utf-8")
    assert "tauri_plugin_updater" in main
    assert "tauri_plugin_process" in main
    assert "isTauri" in updater
    assert "downloadAndInstall" in updater
    assert "relaunch" in updater
    assert "setTimeout" in updater
    assert "UpdateNotice" in app
    assert "Install update" in notice
