import math
import struct
import sys
import types
import wave

import pytest

from sidecar.runtimes import onnx_asr


def _write_pcm16_wav(path, *, seconds=0.2, sample_rate=16000, channels=1):
    frame_count = int(seconds * sample_rate)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            sample = int(8000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            frames.extend(struct.pack("<h", sample) * channels)
        wav_file.writeframes(frames)


def test_loads_int8_parakeet_on_cpu_with_numpy_preprocessor(monkeypatch, tmp_path):
    calls = []
    loaded = object()
    fake_module = types.SimpleNamespace(
        load_model=lambda *args, **kwargs: calls.append((args, kwargs)) or loaded
    )
    monkeypatch.setitem(sys.modules, "onnx_asr", fake_module)

    result = onnx_asr.load_model(str(tmp_path), "directml", "int8")

    assert result is loaded
    assert calls == [
        (
            ("nemo-parakeet-tdt-0.6b-v3",),
            {
                "path": str(tmp_path),
                "quantization": "int8",
                "providers": ["CPUExecutionProvider"],
                "preprocessor_config": {"use_numpy_preprocessors": True},
            },
        )
    ]


def test_transcribe_feeds_mono_float32_waveform(tmp_path):
    numpy = pytest.importorskip("numpy")
    wav_path = tmp_path / "clip.wav"
    _write_pcm16_wav(wav_path, seconds=0.2, channels=2)

    captured = {}

    def recognize(waveform, sample_rate=16000, channel=None):
        captured["waveform"] = waveform
        captured["sample_rate"] = sample_rate
        captured["channel"] = channel
        return "hello"

    model = types.SimpleNamespace(recognize=recognize)
    assert onnx_asr.transcribe(model, str(wav_path)) == "hello"
    assert captured["sample_rate"] == 16000
    assert captured["channel"] == "mean"
    assert captured["waveform"].ndim == 1
    assert captured["waveform"].dtype == numpy.float32
    assert captured["waveform"].size == 3200


def test_transcribe_skips_too_short_audio(tmp_path):
    pytest.importorskip("numpy")
    wav_path = tmp_path / "blank.wav"
    _write_pcm16_wav(wav_path, seconds=0.01)
    model = types.SimpleNamespace(recognize=lambda *args, **kwargs: "should not run")
    assert onnx_asr.transcribe(model, str(wav_path)) == ""
