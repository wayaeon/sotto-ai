"""Model paths and download helpers."""
from __future__ import annotations

import os
from pathlib import Path
from .hardware import ModelTier

# Models are stored in user data dir
_DATA_DIR = Path(os.environ.get("WISPR_DATA_DIR", Path.home() / ".wispr-local"))
MODELS_DIR = _DATA_DIR / "models"


FASTER_WHISPER_MODELS: dict[str, str] = {
    "whisper-large-v3-turbo": "Systran/faster-whisper-large-v3-turbo",
    "whisper-medium": "Systran/faster-whisper-medium",
    "moonshine-base": "UsefulSensors/moonshine-base",  # via transformers
    "parakeet-tdt-1.1b": "nvidia/parakeet-tdt-1.1b",
}


def model_dir(model_name: str) -> Path:
    return MODELS_DIR / model_name


def is_downloaded(model_name: str) -> bool:
    d = model_dir(model_name)
    return d.exists() and any(d.iterdir())


def tier_to_model(tier: ModelTier) -> str:
    from .hardware import MODEL_NAMES
    return MODEL_NAMES[tier]
