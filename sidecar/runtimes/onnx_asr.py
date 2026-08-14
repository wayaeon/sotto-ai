"""Optimized ONNX runtime adapter for Parakeet TDT."""
from __future__ import annotations

import wave
from pathlib import Path
from typing import Any

_PARAKEET_MODEL_ID = "nemo-parakeet-tdt-0.6b-v3"
_MAX_AUDIO_SECONDS = 30
_MIN_AUDIO_SECONDS = 0.05


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    import onnx_asr

    # Int8 Parakeet is the Windows dictation path. After macOS support landed,
    # generic onnxruntime + GPU/DirectML providers + onnx-asr's later conv
    # preprocessor started feeding the encoder a bad shape (11 GB Cast, then
    # self-attn broadcast mismatches). Force the stack that used to work:
    # CPU EP, numpy log-mel, int8 weights from the local snapshot.
    del device, compute_type
    return onnx_asr.load_model(
        _PARAKEET_MODEL_ID,
        path=model_path,
        quantization="int8",
        providers=["CPUExecutionProvider"],
        preprocessor_config={"use_numpy_preprocessors": True},
    )


def _load_mono_float32(audio_path: str) -> tuple[Any, int]:
    import numpy as np

    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    with wave.open(str(path), "rb") as wav_file:
        channel_count = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        pcm = wav_file.readframes(frame_count)

    if sample_width != 2:
        raise ValueError(f"Expected 16-bit PCM, got sample width {sample_width}")
    if channel_count < 1:
        raise ValueError("WAV file has no channels")
    if sample_rate <= 0:
        raise ValueError(f"Invalid sample rate: {sample_rate}")

    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    if channel_count > 1:
        usable = (samples.size // channel_count) * channel_count
        samples = samples[:usable].reshape(-1, channel_count).mean(axis=1)
    samples = np.ascontiguousarray(samples.reshape(-1), dtype=np.float32)

    max_samples = int(_MAX_AUDIO_SECONDS * sample_rate)
    if samples.size > max_samples:
        samples = samples[:max_samples]
    return samples, sample_rate


def transcribe(model: Any, audio_path: str) -> str:
    samples, sample_rate = _load_mono_float32(audio_path)
    min_samples = int(_MIN_AUDIO_SECONDS * sample_rate)
    if samples.size < min_samples:
        return ""
    return str(
        model.recognize(samples, sample_rate=sample_rate, channel="mean")
    ).strip()
