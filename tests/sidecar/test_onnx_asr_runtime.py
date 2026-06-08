import sys
import types

from sidecar.runtimes import onnx_asr


def test_loads_int8_parakeet_from_local_model_directory(monkeypatch, tmp_path):
    calls = []
    loaded = object()
    fake_module = types.SimpleNamespace(
        load_model=lambda *args, **kwargs: calls.append((args, kwargs)) or loaded
    )
    monkeypatch.setitem(sys.modules, "onnx_asr", fake_module)

    result = onnx_asr.load_model(str(tmp_path), "cpu", "int8")

    assert result is loaded
    assert calls == [
        (
            ("nemo-parakeet-tdt-0.6b-v3",),
            {
                "path": str(tmp_path),
                "quantization": "int8",
                "providers": ["CPUExecutionProvider"],
            },
        )
    ]


def test_transcribe_uses_onnx_asr_recognize():
    model = types.SimpleNamespace(recognize=lambda path: f"text from {path}")

    assert onnx_asr.transcribe(model, "sample.wav") == "text from sample.wav"
