"""Transformers runtime adapter — Distil-Whisper, Moonshine, SenseVoice."""
from __future__ import annotations
import json
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
    config_path = model_dir / "config.json"
    model_type = ""
    if config_path.exists():
        try:
            model_type = json.loads(config_path.read_text(encoding="utf-8")).get("model_type", "")
        except Exception:
            model_type = ""

    # Detect SenseVoice by path name (FunASR format: model.pt + config.yaml, no config.json)
    is_sensevoice = "sensevoice" in str(model_path).lower()

    if is_sensevoice:
        try:
            from funasr import AutoModel
        except ImportError:
            raise ImportError(
                "FunASR is not installed. Run: pip install funasr"
            )
        return ("funasr", AutoModel(model=str(model_dir)))

    try:
        import transformers
        from transformers import pipeline
    except ImportError:
        raise ImportError(
            "Transformers is not installed. Run: pip install transformers accelerate"
        )

    if model_type == "voxtral_realtime":
        if not hasattr(transformers, "VoxtralRealtimeForConditionalGeneration"):
            raise ImportError(
                f"Voxtral Realtime requires a Transformers build with VoxtralRealtime support; installed transformers {transformers.__version__} does not include it."
            )
        from transformers import AutoProcessor, VoxtralRealtimeForConditionalGeneration

        processor = AutoProcessor.from_pretrained(str(model_dir), local_files_only=True)
        load_kwargs = {"local_files_only": True, "low_cpu_mem_usage": True}
        if device == "cuda":
            load_kwargs["device_map"] = "auto"
        model = VoxtralRealtimeForConditionalGeneration.from_pretrained(
            str(model_dir),
            **load_kwargs,
        )
        return ("voxtral", model, processor)

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
    kind, m, *extras = model

    if kind == "funasr":
        results = m.generate(input=str(audio_path))
        if results and isinstance(results, list):
            text = results[0].get("text", "") if isinstance(results[0], dict) else str(results[0])
            return text.strip()
        return ""
    elif kind == "voxtral":
        import torch
        from mistral_common.tokens.tokenizers.audio import Audio

        processor = extras[0]
        audio = Audio.from_file(str(audio_path), strict=False)
        audio.resample(processor.feature_extractor.sampling_rate)
        inputs = processor(audio.audio_array, return_tensors="pt")
        inputs = inputs.to(m.device, dtype=m.dtype)
        duration_s = len(audio.audio_array) / processor.feature_extractor.sampling_rate
        max_new_tokens = max(32, min(256, round(duration_s * 12)))
        with torch.inference_mode():
            outputs = m.generate(
                **inputs,
                do_sample=False,
                use_cache=True,
                max_new_tokens=max_new_tokens,
            )
        decoded = processor.batch_decode(outputs, skip_special_tokens=True)
        return decoded[0].strip() if decoded else ""
    else:
        # Transformers pipeline
        result = m(str(audio_path))
        return result.get("text", "").strip() if isinstance(result, dict) else str(result).strip()
