from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_durable_store_is_registered_and_lives_in_documents() -> None:
    commands = (ROOT / "src-tauri" / "src" / "commands.rs").read_text(encoding="utf-8")
    main = (ROOT / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")
    assert "pub fn load_local_data" in commands
    assert "pub fn save_local_data" in commands
    assert "document_dir" in commands
    assert "commands::load_local_data" in main
    assert "commands::save_local_data" in main


def test_history_can_teach_a_correction_and_features_have_a_real_view() -> None:
    source = (ROOT / "src" / "components" / "Home.tsx").read_text(encoding="utf-8")
    assert '"features"' in source
    assert "Teach Verba" in source
    assert "applyCorrectionToTranscriptions" in source


def test_transcription_history_is_not_trimmed_to_a_small_browser_cache() -> None:
    source = (ROOT / "src" / "lib" / "db.ts").read_text(encoding="utf-8")
    assert "persistLocalData" in source
    assert "slice(-MAX_STORED)" not in source


def test_windows_keeps_parakeet_but_uses_a_fast_provider_probe() -> None:
    source = (ROOT / "sidecar" / "main.py").read_text(encoding="utf-8")
    hardware = (ROOT / "sidecar" / "hardware.py").read_text(encoding="utf-8")
    assert "detect_fast_device()" in source
    assert "def detect_fast_device" in hardware
    assert 'device=detect_fast_device()' in source
    assert 'device="cpu"' not in source
