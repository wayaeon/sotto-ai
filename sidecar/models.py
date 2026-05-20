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


# Maps the short model name (what faster-whisper / RealtimeSTT expects) to its HF repo.
# These are all CTranslate2-quantized models — load directly into faster-whisper.
FASTER_WHISPER_MODELS: dict[str, str] = {
    "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",  # Systran requires auth
    "medium.en":      "Systran/faster-whisper-medium.en",
    "medium":         "Systran/faster-whisper-medium",
    "small":          "Systran/faster-whisper-small",
    "base":           "Systran/faster-whisper-base",
    "tiny":           "Systran/faster-whisper-tiny",
}


def model_dir(model_name: str) -> Path:
    return MODELS_DIR / model_name


def is_downloaded(model_name: str) -> bool:
    d = model_dir(model_name)
    return d.exists() and any(d.iterdir())


def best_available_model(preferred: str) -> str:
    """Return preferred model if downloaded, otherwise the best already-downloaded model."""
    if is_downloaded(preferred):
        return preferred
    # Preference order: best quality first
    fallback_order = ["large-v3-turbo", "medium.en", "medium", "small", "base", "tiny"]
    for name in fallback_order:
        if is_downloaded(name):
            return name
    # Nothing downloaded yet — return preferred so it gets downloaded on demand
    return preferred


def tier_to_model(tier: ModelTier) -> str:
    from .hardware import MODEL_NAMES
    preferred = MODEL_NAMES[tier]
    return best_available_model(preferred)


def download_model_async(model_name: str, ipc: "IPC", token: str | None = None) -> None:
    """Start model download in a background thread, emitting progress events."""
    thread = threading.Thread(
        target=_download_model,
        args=(model_name, ipc, token),
        daemon=True,
    )
    thread.start()


_MODEL_FILES = [
    "model.bin",
    "config.json",
    "tokenizer.json",
    "vocabulary.json",    # newer CT2 models
    "vocabulary.txt",     # older CT2 models (medium.en etc.)
    "preprocessor_config.json",
]


def _http_get(url: str, dest: "Path", token: str | None = None) -> None:
    """Download url → dest with no system proxy (avoids Windows credential forwarding)."""
    import requests

    headers = {"User-Agent": "sotto/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    session = requests.Session()
    session.trust_env = False  # ignore Windows proxy / env vars — prevents 401s

    with session.get(url, headers=headers, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=4 * 1024 * 1024):
                f.write(chunk)


def _download_model(model_name: str, ipc: "IPC", token: str | None = None) -> None:
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

    base_url = f"https://huggingface.co/{repo_id}/resolve/main"
    downloaded = 0

    try:
        for filename in _MODEL_FILES:
            url = f"{base_url}/{filename}"
            dest = local_dir / filename
            if dest.exists() and dest.stat().st_size > 100:
                downloaded += 1
                ipc.send(Event.DOWNLOAD_PROGRESS, model=model_name,
                          percent=round(downloaded / len(_MODEL_FILES) * 100, 1))
                continue
            try:
                _http_get(url, dest, token=token)
                downloaded += 1
                ipc.send(Event.DOWNLOAD_PROGRESS, model=model_name,
                          percent=round(downloaded / len(_MODEL_FILES) * 100, 1))
            except Exception:
                # File doesn't exist in this model's repo — skip it
                downloaded += 1

    except Exception as exc:
        ipc.send(Event.ERROR, msg=f"Download failed: {exc}")
