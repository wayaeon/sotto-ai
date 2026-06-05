"""Faster-Whisper runtime adapter — CTranslate2 quantized Whisper models."""
from __future__ import annotations
from typing import Any


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    """Load a faster-whisper WhisperModel.

    Args:
        model_path: Path to the model directory
        device: Device to use ("cuda" or "cpu"). Other values fall back to "cpu"
        compute_type: Compute type (e.g., "float16", "int8")

    Returns:
        WhisperModel instance
    """
    from faster_whisper import WhisperModel

    # faster-whisper does NOT support directml or npu — fall back to cpu
    effective_device = device if device in ("cuda", "cpu") else "cpu"
    return WhisperModel(model_path, device=effective_device, compute_type=compute_type)


def transcribe(model: Any, audio_path: str) -> str:
    """Transcribe audio using faster-whisper.

    Args:
        model: WhisperModel instance
        audio_path: Path to audio file

    Returns:
        Transcribed text
    """
    segments, _ = model.transcribe(
        str(audio_path),
        language=None,
        beam_size=1,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    return " ".join(s.text for s in segments).strip()
