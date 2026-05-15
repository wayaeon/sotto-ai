"""Model paths and download helpers."""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from .hardware import ModelTier

if TYPE_CHECKING:
    from .ipc import IPC

# Models are stored in user data dir
_DATA_DIR = Path(os.environ.get("WISPR_DATA_DIR", Path.home() / ".sotto"))
MODELS_DIR = _DATA_DIR / "models"


FASTER_WHISPER_MODELS: dict[str, str] = {
    "whisper-large-v3-turbo": "Systran/faster-whisper-large-v3-turbo",
    "whisper-medium": "Systran/faster-whisper-medium",
    "moonshine-base": "UsefulSensors/moonshine-base",
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


def download_model_async(model_name: str, ipc: "IPC") -> None:
    """Start model download in a background thread, emitting progress events."""
    thread = threading.Thread(
        target=_download_model,
        args=(model_name, ipc),
        daemon=True,
    )
    thread.start()


def _download_model(model_name: str, ipc: "IPC") -> None:
    from .ipc import Event

    if is_downloaded(model_name):
        ipc.send(Event.DOWNLOAD_PROGRESS, model=model_name, percent=100.0)
        return

    repo_id = FASTER_WHISPER_MODELS.get(model_name)
    if repo_id is None:
        ipc.send(Event.ERROR, msg=f"Unknown model: {model_name}")
        return

    local_dir = model_dir(model_name)
    local_dir.mkdir(parents=True, exist_ok=True)

    try:
        from huggingface_hub import list_repo_files, hf_hub_download

        # Filter to model weight files only (skip .gitattributes etc.)
        all_files = list(list_repo_files(repo_id))
        files = [f for f in all_files if not f.startswith(".") and f != "README.md"]
        total = len(files)

        for i, filename in enumerate(files):
            hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=str(local_dir),
            )
            percent = round((i + 1) / total * 100, 1)
            ipc.send(Event.DOWNLOAD_PROGRESS, model=model_name, percent=percent)

    except Exception as exc:
        ipc.send(Event.ERROR, msg=f"Download failed: {exc}")
