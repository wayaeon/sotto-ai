from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_windows_build_uses_nsis_and_real_launch_at_login():
    config = (ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8")
    general = (ROOT / "src" / "components" / "settings" / "GeneralTab.tsx").read_text(encoding="utf-8")
    main = (ROOT / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")

    assert '"nsis"' in config
    assert '"installMode": "currentUser"' in config
    assert "@tauri-apps/plugin-autostart" in general
    assert "tauri_plugin_autostart::init" in main
