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
    import wave
    from pathlib import Path
    
    # Validate audio file before passing to onnx_asr
    audio_file = Path(audio_path)
    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    try:
        with wave.open(str(audio_path), "rb") as wf:
            channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            duration_s = n_frames / framerate if framerate > 0 else 0
            
            # Verify format: 16kHz mono 16-bit PCM
            if channels != 1:
                raise ValueError(f"Expected mono audio (1 channel), got {channels} channels")
            if sample_width != 2:
                raise ValueError(f"Expected 16-bit PCM (sample width 2), got {sample_width}")
            if framerate != 16000:
                raise ValueError(f"Expected 16kHz sample rate, got {framerate}Hz")
            if duration_s < 0.1:
                return ""  # Empty/too-short audio
            if duration_s > 300:
                raise ValueError(f"Audio too long: {duration_s:.1f}s (max 300s)")
    except wave.Error as e:
        raise ValueError(f"Invalid WAV file: {e}")
    
    try:
        result = model.recognize(str(audio_path))
        return str(result).strip()
    except Exception as e:
        # Provide detailed error info for debugging ONNX shape mismatches
        import traceback
        error_detail = traceback.format_exc()
        raise RuntimeError(
            f"onnx_asr transcription failed for {audio_file.name} "
            f"(duration={duration_s:.2f}s, frames={n_frames}): {e}\n{error_detail}"
        )
