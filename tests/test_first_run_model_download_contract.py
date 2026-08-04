from pathlib import Path
import threading

from sidecar.recorder import Recorder


ROOT = Path(__file__).resolve().parents[1]


def test_first_run_parakeet_download_has_real_progress_instead_of_generic_warming():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    store = (ROOT / "src" / "stores" / "appStore.ts").read_text(encoding="utf-8")
    step = (ROOT / "src" / "components" / "setup" / "ModelStep.tsx").read_text(encoding="utf-8")

    assert 'case "download_progress"' in hook
    assert "setModelDownload" in hook
    assert "modelDownload" in store
    assert "Downloading Parakeet" in step
    assert "downloadedLabel" in step


def test_startup_registers_cached_model_without_loading_worker(monkeypatch):
    class IPC:
        def __init__(self):
            self.events = []

        def send(self, event, **data):
            self.events.append({"event": getattr(event, "value", event), **data})

    recorder = Recorder.__new__(Recorder)
    recorder._ipc = IPC()
    recorder._model_name = "nvidia/parakeet-tdt-0.6b-v3"
    recorder._model_download_lock = threading.Lock()

    import sidecar.models as models
    monkeypatch.setattr(models, "is_downloaded", lambda _model: True)
    monkeypatch.setattr(models, "_download_model", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("cached model should not download")))

    recorder._register_model()

    assert recorder._ipc.events[-1] == {
        "event": "status",
        "msg": "model_registered model=nvidia/parakeet-tdt-0.6b-v3",
    }


def test_frontend_accepts_startup_model_registration():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    assert "model_registering" in hook
    assert "model_registered" in hook
