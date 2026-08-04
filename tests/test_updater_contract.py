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


def test_update_status_is_visible_in_general_settings():
    updater = (ROOT / "src" / "lib" / "updater.ts").read_text(encoding="utf-8")
    home = (ROOT / "src" / "components" / "Home.tsx").read_text(encoding="utf-8")
    assert "UpdateStatus" in updater
    assert "readUpdateStatus" in updater
    assert "lastUpdatedAt" in updater
    assert "Update status" in home
    assert "Pending update" in home


def test_update_status_exposes_manual_check_and_failures():
    updater = (ROOT / "src" / "lib" / "updater.ts").read_text(encoding="utf-8")
    home = (ROOT / "src" / "components" / "Home.tsx").read_text(encoding="utf-8")
    assert "checkError" in updater
    assert "Checking for updates" in home
    assert "Check for updates" in home


def test_update_checks_repeat_while_app_is_open():
    updater = (ROOT / "src" / "lib" / "updater.ts").read_text(encoding="utf-8")
    assert "setInterval" in updater
    assert "clearInterval" in updater


def test_update_checks_retry_after_startup_and_resume():
    updater = (ROOT / "src" / "lib" / "updater.ts").read_text(encoding="utf-8")
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    assert "visibilitychange" in updater
    assert "online" in updater
    assert "checking" in updater
    assert "macos-15-intel" in workflow
    assert "macos-13" not in workflow
