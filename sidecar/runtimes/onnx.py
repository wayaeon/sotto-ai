"""ONNX runtime adapter — sherpa-onnx Zipformer."""
from __future__ import annotations
from pathlib import Path
from typing import Any


def _get_provider(device: str) -> str:
    """Convert device string to sherpa-onnx provider name."""
    if device == "cuda":
        return "cuda"
    elif device == "directml":
        return "directml"
    elif device == "npu":
        return "npu"
    return "cpu"


def _find_file(d: Path, patterns: list[str]) -> str | None:
    """Find first matching file from patterns in directory."""
    for pattern in patterns:
        matches = list(d.glob(pattern))
        if matches:
            return str(matches[0])
    return None


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    """Load a sherpa-onnx Zipformer model.

    Args:
        model_path: Path to the model directory
        device: Device to use ("cuda", "directml", "npu", "cpu")
        compute_type: Compute type (unused for ONNX, kept for API consistency)

    Returns:
        sherpa_onnx.OfflineRecognizer instance
    """
    try:
        import sherpa_onnx
    except ImportError:
        raise ImportError(
            "sherpa-onnx is not installed. Run: pip install sherpa-onnx onnxruntime-directml"
        )

    d = Path(model_path)
    provider = _get_provider(device)

    # Find model files
    encoder = _find_file(d, ["encoder*.onnx", "encoder*.int8.onnx"])
    decoder = _find_file(d, ["decoder*.onnx"])
    joiner  = _find_file(d, ["joiner*.onnx", "joiner*.int8.onnx"])
    tokens  = _find_file(d, ["tokens.txt"])

    if not all([encoder, decoder, joiner, tokens]):
        raise FileNotFoundError(
            f"Zipformer model files missing in {model_path}. "
            f"Expected encoder, decoder, joiner .onnx files and tokens.txt"
        )

    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=encoder,
        decoder=decoder,
        joiner=joiner,
        tokens=tokens,
        provider=provider,
        num_threads=4,
    )
    return recognizer


def transcribe(model: Any, audio_path: str) -> str:
    """Transcribe audio using sherpa-onnx.

    Args:
        model: sherpa_onnx.OfflineRecognizer instance
        audio_path: Path to audio file

    Returns:
        Transcribed text
    """
    import wave
    import numpy as np

    # Read WAV file
    with wave.open(str(audio_path), "rb") as wf:
        sample_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    # Convert to float32 normalized samples [-1, 1]
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

    # Transcribe
    stream = model.create_stream()
    stream.accept_waveform(sample_rate, samples)
    model.decode_stream(stream)
    return stream.result.text.strip()
