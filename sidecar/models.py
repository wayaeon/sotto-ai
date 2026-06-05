"""Model paths and download helpers."""
from __future__ import annotations

import os
import time
import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from .hardware import ModelTier

if TYPE_CHECKING:
    from .ipc import IPC

# Models are stored in user data dir
_DATA_DIR = Path(os.environ.get("WISPR_DATA_DIR", Path.home() / ".sotto"))
MODELS_DIR = _DATA_DIR / "models"


@dataclass(frozen=True)
class ModelSpec:
    repo_id: str
    runtime: str
    download_supported: bool
    benchmark_supported: bool
    approx_size_bytes: int = 0


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

MODEL_CATALOG: dict[str, ModelSpec] = {
    "large-v3-turbo": ModelSpec("deepdml/faster-whisper-large-v3-turbo-ct2", "faster-whisper", True, True, int(3.1 * 1024**3)),
    "medium.en": ModelSpec("Systran/faster-whisper-medium.en", "faster-whisper", True, True, int(1.5 * 1024**3)),
    "medium": ModelSpec("Systran/faster-whisper-medium", "faster-whisper", True, True, int(1.5 * 1024**3)),
    "small": ModelSpec("Systran/faster-whisper-small", "faster-whisper", True, True, int(460 * 1024**2)),
    "base": ModelSpec("Systran/faster-whisper-base", "faster-whisper", True, True, int(145 * 1024**2)),
    "tiny": ModelSpec("Systran/faster-whisper-tiny", "faster-whisper", True, True, int(75 * 1024**2)),
    "nvidia/parakeet-tdt-0.6b-v3": ModelSpec("nvidia/parakeet-tdt-0.6b-v3", "nemo", True, True, int(2.4 * 1024**3)),
    "nvidia/parakeet-tdt-0.6b-v2": ModelSpec("nvidia/parakeet-tdt-0.6b-v2", "nemo", True, True, int(2.4 * 1024**3)),
    "nvidia/canary-1b-flash": ModelSpec("nvidia/canary-1b-flash", "nemo", True, True, int(4.0 * 1024**3)),
    "distil-whisper/distil-large-v3.5": ModelSpec("distil-whisper/distil-large-v3.5", "transformers", True, True, int(1.5 * 1024**3)),
    "FunAudioLLM/SenseVoiceSmall": ModelSpec("FunAudioLLM/SenseVoiceSmall", "transformers", True, True, int(500 * 1024**2)),
    "UsefulSensors/moonshine-base": ModelSpec("UsefulSensors/moonshine-base", "transformers", True, True, int(200 * 1024**2)),
    "csukuangfj/sherpa-onnx-zipformer-en-2023-04-01": ModelSpec("csukuangfj/sherpa-onnx-zipformer-en-2023-04-01", "onnx", True, True, int(100 * 1024**2)),
}

MODEL_DOWNLOAD_SIZES: dict[str, int] = {
    model_name: spec.approx_size_bytes
    for model_name, spec in MODEL_CATALOG.items()
}


def format_bytes(bytes_value: int | float | None) -> str:
    if not bytes_value:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(bytes_value)
    unit = 0
    while value >= 1024 and unit < len(units) - 1:
        value /= 1024
        unit += 1
    if unit == 0:
        return f"{int(value)} {units[unit]}"
    return f"{value:.1f} {units[unit]}"


def model_dir(model_name: str) -> Path:
    return MODELS_DIR / model_name


def is_downloaded(model_name: str) -> bool:
    d = model_dir(model_name)
    if not d.exists():
        return False
    spec = MODEL_CATALOG.get(model_name)
    runtime = spec.runtime if spec else "faster-whisper"
    if runtime == "faster-whisper":
        return (d / "model.bin").exists()
    elif runtime == "nemo":
        return any(d.glob("*.nemo"))
    elif runtime == "onnx":
        return any(d.glob("*.onnx"))
    elif runtime == "transformers":
        return (
            (d / "model.safetensors").exists()
            or (d / "pytorch_model.bin").exists()
            or (d / "model.pt").exists()
        )
    return any(d.iterdir())


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


def benchmark_model_async(
    model_name: str,
    audio_path: str,
    ipc: "IPC",
    reference_text: str | None = None,
    sample_label: str | None = None,
    mode: str = "cold",
) -> None:
    """Benchmark one faster-whisper-compatible model against an existing WAV."""
    thread = threading.Thread(
        target=_benchmark_model,
        args=(model_name, audio_path, ipc, reference_text, sample_label, mode),
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


def _http_get(
    url: str,
    dest: "Path",
    token: str | None = None,
    on_chunk: Callable[[int], None] | None = None,
) -> int:
    """Download url → dest with no system proxy (avoids Windows credential forwarding)."""
    import requests

    headers = {"User-Agent": "sotto/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    session = requests.Session()
    session.trust_env = False  # ignore Windows proxy / env vars — prevents 401s

    bytes_written = 0
    with session.get(url, headers=headers, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=4 * 1024 * 1024):
                if not chunk:
                    continue
                f.write(chunk)
                bytes_written += len(chunk)
                if on_chunk:
                    on_chunk(len(chunk))
    return bytes_written


def _download_model(model_name: str, ipc: "IPC", token: str | None = None) -> None:
    from .ipc import Event

    if is_downloaded(model_name):
        ipc.send(Event.DOWNLOAD_PROGRESS, model=model_name, percent=100.0)
        return

    spec = MODEL_CATALOG.get(model_name)
    if spec is None:
        ipc.send(Event.ERROR, msg=f"Unknown model: {model_name}")
        return
    if not spec.download_supported:
        ipc.send(Event.ERROR, msg=f"Download is not wired for model: {model_name}")
        return

    local_dir = model_dir(model_name)
    local_dir.mkdir(parents=True, exist_ok=True)

    if spec.runtime != "faster-whisper":
        _snapshot_download_model(model_name, spec, local_dir, ipc, token=token)
        return

    base_url = f"https://huggingface.co/{spec.repo_id}/resolve/main"
    downloaded = 0
    bytes_total = MODEL_DOWNLOAD_SIZES.get(model_name, 0)
    bytes_downloaded = 0

    def send_progress() -> None:
        percent = round(bytes_downloaded / bytes_total * 100, 1) if bytes_total else round(downloaded / len(_MODEL_FILES) * 100, 1)
        percent = min(100.0, max(0.0, percent))
        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model_name,
            percent=percent,
            bytes_downloaded=bytes_downloaded,
            bytes_total=bytes_total,
            downloaded_label=format_bytes(bytes_downloaded),
            total_label=format_bytes(bytes_total),
        )

    def count_chunk(size: int) -> None:
        nonlocal bytes_downloaded
        bytes_downloaded += size
        send_progress()

    try:
        for filename in _MODEL_FILES:
            url = f"{base_url}/{filename}"
            dest = local_dir / filename
            if dest.exists() and dest.stat().st_size > 100:
                downloaded += 1
                bytes_downloaded += dest.stat().st_size
                send_progress()
                continue
            try:
                _http_get(url, dest, token=token, on_chunk=count_chunk)
                downloaded += 1
                send_progress()
            except Exception:
                # File doesn't exist in this model's repo — skip it
                downloaded += 1

        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model_name,
            percent=100.0,
            bytes_downloaded=bytes_downloaded,
            bytes_total=bytes_total,
            downloaded_label="cached",
            total_label=format_bytes(bytes_total),
        )

    except Exception as exc:
        ipc.send(Event.ERROR, msg=f"Download failed: {exc}")


def _snapshot_download_model(
    model_name: str,
    spec: ModelSpec,
    local_dir: Path,
    ipc: "IPC",
    token: str | None = None,
) -> None:
    from .ipc import Event

    bytes_total = spec.approx_size_bytes or 0
    state = {"bytes_done": 0}

    def _emit(pct: float) -> None:
        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model_name,
            percent=pct,
            bytes_downloaded=state["bytes_done"],
            bytes_total=bytes_total,
            downloaded_label=format_bytes(state["bytes_done"]),
            total_label=format_bytes(bytes_total) if bytes_total else "unknown",
        )

    _emit(2.0)

    try:
        from huggingface_hub import snapshot_download
        from tqdm.auto import tqdm as _BaseTqdm

        class _ProgressTqdm(_BaseTqdm):
            def update(self, n=1):
                super().update(n)
                if n and n > 0:
                    state["bytes_done"] += n
                    pct = min(99.0, state["bytes_done"] / bytes_total * 97 + 2.0) if bytes_total else 50.0
                    _emit(pct)

        try:
            snapshot_download(
                repo_id=spec.repo_id,
                local_dir=str(local_dir),
                token=token,
                tqdm_class=_ProgressTqdm,
            )
        except TypeError:
            # huggingface_hub < 0.16 doesn't have tqdm_class
            snapshot_download(repo_id=spec.repo_id, local_dir=str(local_dir), token=token)

        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model_name,
            percent=100.0,
            bytes_total=bytes_total,
            downloaded_label="cached",
            total_label=format_bytes(bytes_total) if bytes_total else "unknown",
        )
    except Exception as exc:
        ipc.send(Event.ERROR, msg=f"Download failed for {model_name}: {exc}")


def _benchmark_model(
    model_name: str,
    audio_path: str,
    ipc: "IPC",
    reference_text: str | None = None,
    sample_label: str | None = None,
    mode: str = "cold",
) -> None:
    from .ipc import Event
    from .benchmark import score_transcript

    spec = MODEL_CATALOG.get(model_name)
    if spec is None:
        ipc.send(Event.ERROR, msg=f"Unknown model: {model_name}")
        return

    if not spec.benchmark_supported:
        ipc.send(Event.ERROR, msg=f"Benchmark not supported for model: {model_name}")
        return

    path = Path(audio_path)
    if not path.exists():
        ipc.send(Event.ERROR, msg=f"Benchmark audio not found: {audio_path}")
        return

    if not is_downloaded(model_name):
        ipc.send(Event.ERROR, msg=f"Download model before benchmarking: {model_name}")
        return

    try:
        from .runtimes import get_adapter
        try:
            import ctranslate2
            has_cuda = ctranslate2.get_cuda_device_count() > 0
        except Exception:
            has_cuda = False

        # Determine device using same priority as live pipeline
        device = "cpu"
        if has_cuda:
            device = "cuda"
        else:
            try:
                import onnxruntime
                if "DmlExecutionProvider" in onnxruntime.get_available_providers():
                    device = "directml"
            except Exception:
                pass

        compute_type = "float16" if device == "cuda" else "int8"
        model_path_str = str(model_dir(model_name))

        adapter = get_adapter(spec.runtime)

        load_start = time.perf_counter()
        model = adapter.load_model(model_path_str, device, compute_type)
        load_ms = round((time.perf_counter() - load_start) * 1000)

        audio_duration_ms = _wav_duration_ms(path)

        transcribe_start = time.perf_counter()
        text = adapter.transcribe(model, str(path))
        transcribe_ms = round((time.perf_counter() - transcribe_start) * 1000)
        rtf = round(transcribe_ms / max(audio_duration_ms, 1), 3)
        score = score_transcript(reference_text, text)

        ipc.send(
            Event.BENCHMARK_RESULT,
            model=model_name,
            runtime=spec.runtime,
            device=device,
            compute_type=compute_type,
            mode=mode,
            sample_label=sample_label,
            reference_text=reference_text,
            load_ms=load_ms,
            transcribe_ms=transcribe_ms,
            audio_duration_ms=audio_duration_ms,
            rtf=rtf,
            text=text,
            **score,
        )
    except Exception as exc:
        ipc.send(Event.ERROR, msg=f"Benchmark failed for {model_name}: {exc}")


def _wav_duration_ms(path: Path) -> int:
    """Return duration for recorder-produced WAV files without extra native deps."""
    with wave.open(str(path), "rb") as wav:
        frames = wav.getnframes()
        rate = wav.getframerate()
    return round(frames / max(rate, 1) * 1000)
