"""Optimized ONNX runtime adapter for Parakeet TDT."""
from __future__ import annotations

from typing import Any


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    import onnx_asr
    from pathlib import Path

    # CRITICAL: Verify only int8 ONNX files exist for Parakeet.
    # Full-precision encoder-model.onnx causes 11 GB allocations and OOMs.
    model_dir = Path(model_path)
    bad_files = []
    for pattern in ["encoder-model.onnx", "decoder_joint-model.onnx", "*.onnx.data"]:
        bad_files.extend(model_dir.glob(pattern))
    
    if bad_files:
        import os
        for f in bad_files:
            try:
                os.unlink(f)
            except Exception:
                pass
        raise RuntimeError(
            f"Parakeet model directory contained non-int8 files that cause OOM. "
            f"Cleaned {len(bad_files)} file(s). Re-download the model to get int8 weights."
        )

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
