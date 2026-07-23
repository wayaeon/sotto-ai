from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_windows_startup_avoids_hardware_probe() -> None:
    source = (ROOT / "sidecar" / "main.py").read_text(encoding="utf-8")
    assert 'if sys.platform == "win32":' in source
    assert "detect_hardware()" in source
    assert 'Recorder(ipc=ipc, hw=None, model_name=DEFAULT_MODEL, device="cpu")' in source


def test_windows_recorder_defaults_to_parakeet() -> None:
    source = (ROOT / "sidecar" / "recorder.py").read_text(encoding="utf-8")
    assert "model_name: str | None = None" in source
    assert "self._model_name = model_name or best_available_model(hw.model_name)" in source


def test_windows_warmup_is_owned_by_sidecar() -> None:
    recorder = (ROOT / "sidecar" / "recorder.py").read_text(encoding="utf-8")
    assert "def warmup(self)" in recorder
