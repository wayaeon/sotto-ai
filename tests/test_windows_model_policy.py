from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_windows_startup_uses_a_fast_provider_probe_without_switching_models() -> None:
    source = (ROOT / "sidecar" / "main.py").read_text(encoding="utf-8")
    assert 'if sys.platform == "win32":' in source
    assert "detect_fast_device()" in source
    assert 'Recorder(ipc=ipc, hw=None, model_name=DEFAULT_MODEL, device=detect_fast_device())' in source


def test_windows_recorder_defaults_to_parakeet() -> None:
    source = (ROOT / "sidecar" / "recorder.py").read_text(encoding="utf-8")
    assert "model_name: str | None = None" in source
    assert "self._model_name = model_name or best_available_model(hw.model_name)" in source


def test_windows_model_warmup_is_owned_by_sidecar() -> None:
    recorder = (ROOT / "sidecar" / "recorder.py").read_text(encoding="utf-8")
    assert "def preload_worker(self)" in recorder
    assert "self.preload_worker()" in recorder
