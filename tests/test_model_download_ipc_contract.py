from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_sidecar_dispatches_every_download_command_it_advertises():
    ipc = (ROOT / "sidecar/ipc.py").read_text(encoding="utf-8")
    main = (ROOT / "sidecar/main.py").read_text(encoding="utf-8")
    for command in ("DOWNLOAD_MODEL", "PAUSE_DOWNLOAD_MODEL", "CHECK_DOWNLOADS"):
        assert f'{command} = "' in ipc
        assert f"Command.{command}" in main
    assert "download_model_async" in main
    assert "pause_download_model" in main
    assert "download_states" in main


def test_models_module_exposes_a_public_download_state_snapshot():
    models = (ROOT / "sidecar/models.py").read_text(encoding="utf-8")
    assert "def download_states()" in models
    assert '"downloaded"' in models
    assert '"active"' in models
    assert '"paused"' in models


def test_sidecar_emits_a_downloads_state_event():
    ipc = (ROOT / "sidecar/ipc.py").read_text(encoding="utf-8")
    assert 'DOWNLOADS_STATE = "downloads_state"' in ipc


def test_rust_forwards_download_commands_to_the_sidecar():
    rust = (ROOT / "src-tauri/src/commands.rs").read_text(encoding="utf-8")
    main_rs = (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8")
    for command in ("download_model", "pause_download_model", "check_downloads"):
        assert f"pub fn {command}" in rust
        assert f"commands::{command}," in main_rs
        assert '{"cmd": "' + command + '"' in rust


def test_frontend_wrappers_exist_for_the_download_commands():
    tauri = (ROOT / "src/lib/tauri.ts").read_text(encoding="utf-8")
    assert 'invoke("download_model", { model })' in tauri
    assert 'invoke("pause_download_model", { model })' in tauri
    assert 'invoke("check_downloads")' in tauri
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert 'case "downloads_state"' in hook


def test_models_tab_offers_manual_downloads_with_progress_and_pause():
    tab = (ROOT / "src/components/settings/ModelsTab.tsx").read_text(encoding="utf-8")
    assert "downloadModel" in tab
    assert "pauseDownloadModel" in tab
    assert "checkDownloads" in tab
    assert "downloadStates" in tab
