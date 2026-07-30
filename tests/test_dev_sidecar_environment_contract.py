from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_debug_sidecar_uses_the_project_virtual_environment():
    source = (ROOT / "src-tauri" / "src" / "sidecar.rs").read_text(encoding="utf-8")

    assert 'join("sidecar").join(".venv").join("Scripts").join("python.exe")' in source
    assert 'shell.command(dev_python)' in source
