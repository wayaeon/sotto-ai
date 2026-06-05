"""NeMo runtime adapter — Parakeet TDT v2/v3, Canary 1B Flash."""
from __future__ import annotations
from pathlib import Path
from typing import Any


def _get_torch_device(device: str):
    """Get PyTorch device for the specified device string."""
    try:
        import torch
        if device == "cuda":
            return torch.device("cuda")
        elif device == "directml":
            import torch_directml
            return torch_directml.device()
        else:
            return torch.device("cpu")
    except ImportError:
        import torch
        return torch.device("cpu")


def _find_nemo_file(model_path: str) -> str:
    """Find the largest .nemo file in the model directory (weights file)."""
    d = Path(model_path)
    nemo_files = list(d.glob("*.nemo"))
    if not nemo_files:
        raise FileNotFoundError(f"No .nemo file found in {model_path}")
    return str(max(nemo_files, key=lambda p: p.stat().st_size))


def load_model(model_path: str, device: str, compute_type: str) -> Any:
    """Load a NeMo ASR model.

    Supports Parakeet TDT v2/v3, Canary 1B Flash, and generic ASRModel.

    Args:
        model_path: Path to the model directory
        device: Device to use ("cuda", "directml", "cpu")
        compute_type: Compute type (unused for NeMo, kept for API consistency)

    Returns:
        NeMo ASR model instance
    """
    try:
        import nemo.collections.asr as nemo_asr
    except ImportError:
        raise ImportError(
            "NeMo is not installed. Run: pip install nemo_toolkit[asr]"
        )

    nemo_file = _find_nemo_file(model_path)
    torch_device = _get_torch_device(device)

    # Try EncDecRNNTBPEModel (Parakeet TDT), fall back to generic ASRModel
    try:
        model = nemo_asr.models.EncDecRNNTBPEModel.restore_from(
            nemo_file, map_location=torch_device
        )
    except Exception:
        try:
            model = nemo_asr.models.EncDecMultiTaskModel.restore_from(
                nemo_file, map_location=torch_device
            )
        except Exception:
            model = nemo_asr.models.ASRModel.restore_from(
                nemo_file, map_location=torch_device
            )

    model.eval()
    return model


def transcribe(model: Any, audio_path: str) -> str:
    """Transcribe audio using NeMo.

    Args:
        model: NeMo ASR model instance
        audio_path: Path to audio file

    Returns:
        Transcribed text
    """
    results = model.transcribe([str(audio_path)])
    if results and hasattr(results[0], "text"):
        return results[0].text.strip()
    return str(results[0]).strip() if results else ""
