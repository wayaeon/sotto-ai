"""Transformers runtime adapter — Distil-Whisper, Moonshine, SenseVoice."""
from __future__ import annotations
from typing import Any


def _hf_device(device: str):
    """Convert device string to HuggingFace device format (int or torch.device)."""
    if device == "cuda":
        return 0
    elif device == "directml":
        try:
            import torch_directml
            return torch_directml.device()
        except ImportError:
            return -1
    return -1  # CPU


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    """Load a Transformers model (Distil-Whisper, Moonshine, or SenseVoice).

    SenseVoice uses funasr instead of transformers.

    Args:
        model_path: Path to the model directory
        device: Device to use ("cuda", "directml", "cpu")
        compute_type: Compute type (unused for transformers, kept for API consistency)

    Returns:
        Tuple of (framework_name, model_or_pipeline)
        - ("funasr", AutoModel) for SenseVoice
        - ("pipeline", ASRPipeline) for Transformers models
    """
    from pathlib import Path

    model_dir = Path(model_path)

    # Detect SenseVoice by checking for configuration or model file
    is_sensevoice = any(
        (model_dir / f).exists()
        for f in ("configuration.json", "SenseVoiceSmall.onnx")
    ) and "sensevoice" in str(model_path).lower()

    if is_sensevoice:
        try:
            from funasr import AutoModel
        except ImportError:
            raise ImportError(
                "FunASR is not installed. Run: pip install funasr"
            )
        return ("funasr", AutoModel(model=str(model_dir)))

    try:
        from transformers import pipeline
    except ImportError:
        raise ImportError(
            "Transformers is not installed. Run: pip install transformers accelerate"
        )

    hf_device = _hf_device(device)
    pipe = pipeline(
        "automatic-speech-recognition",
        model=str(model_dir),
        device=hf_device,
    )
    return ("pipeline", pipe)


def transcribe(model: Any, audio_path: str) -> str:
    """Transcribe audio using Transformers (or FunASR for SenseVoice).

    Args:
        model: Tuple of (framework_name, model_or_pipeline)
        audio_path: Path to audio file

    Returns:
        Transcribed text
    """
    kind, m = model

    if kind == "funasr":
        results = m.generate(input=str(audio_path))
        if results and isinstance(results, list):
            text = results[0].get("text", "") if isinstance(results[0], dict) else str(results[0])
            return text.strip()
        return ""
    else:
        # Transformers pipeline
        result = m(str(audio_path))
        return result.get("text", "").strip() if isinstance(result, dict) else str(result).strip()
