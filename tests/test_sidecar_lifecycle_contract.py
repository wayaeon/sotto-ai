from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_host_exit_stops_sidecar_tree_without_respawning_it():
    sidecar = (ROOT / "src-tauri/src/sidecar.rs").read_text(encoding="utf-8")
    main = (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8")
    assert "shutting_down" in sidecar
    assert "pub fn shutdown_sidecar" in sidecar
    assert "taskkill" in sidecar
    assert "RunEvent::ExitRequested" in main
    assert "shutdown_sidecar" in main
