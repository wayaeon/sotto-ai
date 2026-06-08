"""Optimized ONNX runtime adapter for Parakeet TDT."""
from __future__ import annotations

from typing import Any


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    import onnx_asr

    providers = ["CPUExecutionProvider"]
    if device in ("cuda", "directml"):
        try:
            import onnxruntime

            provider = "CUDAExecutionProvider" if device == "cuda" else "DmlExecutionProvider"
            if provider in onnxruntime.get_available_providers():
                providers.insert(0, provider)
        except Exception:
            pass

    return onnx_asr.load_model(
        "nemo-parakeet-tdt-0.6b-v3",
        path=model_path,
        quantization="int8",
        providers=providers,
    )


def transcribe(model: Any, audio_path: str) -> str:
    return str(model.recognize(str(audio_path))).strip()
