"""Model paths and download helpers."""
from __future__ import annotations

import os
import time
import threading
import wave
from fnmatch import fnmatch
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from .hardware import ModelTier

if TYPE_CHECKING:
    from .ipc import IPC

# Models are stored in ~/.verba
_DATA_DIR = Path(os.environ.get("WISPR_DATA_DIR", Path.home() / ".verba"))
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


def _dir_bytes(path: Path) -> int:
    try:
        return sum(
            f.stat().st_size for f in path.rglob("*")
            if f.is_file() and f.suffix != ".incomplete"
        )
    except Exception:
        return 0


def _faster_whisper_model_bin_is_complete(model_name: str, path: Path) -> bool:
    if not path.exists():
        return False
    try:
        size = path.stat().st_size
    except OSError:
        return False
    expected = MODEL_DOWNLOAD_SIZES.get(model_name, 0)
    if expected <= 0:
        return size > 0
    minimum_weight_size = max(16 * 1024**2, int(expected * 0.35))
    return size >= minimum_weight_size


def is_downloaded(model_name: str) -> bool:
    d = model_dir(model_name)
    if not d.exists():
        return False
    spec = MODEL_CATALOG.get(model_name)
    runtime = spec.runtime if spec else "faster-whisper"
    if runtime == "faster-whisper":
        return _faster_whisper_model_bin_is_complete(model_name, d / "model.bin")
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


def download_status_payload(model_name: str) -> dict:
    downloaded = is_downloaded(model_name)
    spec = MODEL_CATALOG.get(model_name)
    bytes_total = spec.approx_size_bytes if spec else MODEL_DOWNLOAD_SIZES.get(model_name, 0)
    d = model_dir(model_name)
    return {
        "model": model_name,
        "percent": 100.0 if downloaded else 0.0,
        "checked": True,
        "downloaded": downloaded,
        "bytes_downloaded": _dir_bytes(d) if downloaded else 0,
        "bytes_total": bytes_total,
        "downloaded_label": "cached" if downloaded else "not downloaded",
        "total_label": format_bytes(bytes_total) if bytes_total else "unknown",
    }


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

_SNAPSHOT_IGNORE_PATTERNS = ["*.msgpack", "flax_model*", "tf_model*", "rust_model*"]


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
            for chunk in r.iter_content(chunk_size=256 * 1024):
                if not chunk:
                    continue
                f.write(chunk)
                bytes_written += len(chunk)
                if on_chunk:
                    on_chunk(len(chunk))
    return bytes_written


def _should_ignore_snapshot_file(filename: str) -> bool:
    return any(fnmatch(filename, pattern) or fnmatch(Path(filename).name, pattern) for pattern in _SNAPSHOT_IGNORE_PATTERNS)


def _snapshot_repo_files(repo_id: str, token: str | None = None) -> list[tuple[str, int | None]]:
    from huggingface_hub import HfApi

    info = HfApi().model_info(repo_id, token=token, files_metadata=True)
    files: list[tuple[str, int | None]] = []
    for sibling in info.siblings:
        filename = sibling.rfilename
        if not filename or _should_ignore_snapshot_file(filename):
            continue
        size = getattr(sibling, "size", None)
        if size is None:
            lfs = getattr(sibling, "lfs", None)
            size = getattr(lfs, "size", None) if lfs else None
        files.append((filename, int(size) if size is not None else None))
    return files


def _download_model(model_name: str, ipc: "IPC", token: str | None = None) -> None:
    from .ipc import Event

    if is_downloaded(model_name):
        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
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
            required = filename == "model.bin"
            if required and _faster_whisper_model_bin_is_complete(model_name, dest):
                downloaded += 1
                bytes_downloaded += dest.stat().st_size
                send_progress()
                continue
            if not required and dest.exists() and dest.stat().st_size > 100:
                downloaded += 1
                bytes_downloaded += dest.stat().st_size
                send_progress()
                continue
            try:
                tmp_dest = dest.with_name(f"{dest.name}.incomplete")
                if tmp_dest.exists():
                    tmp_dest.unlink()
                _http_get(url, tmp_dest, token=token, on_chunk=count_chunk)
                tmp_dest.replace(dest)
                downloaded += 1
                send_progress()
            except Exception as exc:
                if required:
                    raise RuntimeError(f"required file {filename} failed: {exc}") from exc
                # Optional companion files vary by repo.
                downloaded += 1

        if not is_downloaded(model_name):
            ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
            ipc.send(Event.ERROR, msg=f"Download incomplete for {model_name}: required model files are missing or incomplete")
            return

        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))

    except Exception as exc:
        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
        ipc.send(Event.ERROR, msg=f"Download incomplete for {model_name}: {exc}")


def _snapshot_download_model(
    model_name: str,
    spec: ModelSpec,
    local_dir: Path,
    ipc: "IPC",
    token: str | None = None,
) -> None:
    """Download snapshot files directly so IPC receives chunk-level progress."""
    from .ipc import Event
    from huggingface_hub import hf_hub_url

    try:
        repo_files = _snapshot_repo_files(spec.repo_id, token=token)
    except Exception as exc:
        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
        ipc.send(Event.ERROR, msg=f"Download failed for {model_name}: could not list repo files: {exc}")
        return

    known_total = sum(size for _, size in repo_files if size is not None)
    bytes_total = known_total or spec.approx_size_bytes or 0
    bytes_downloaded = 0

    def send_progress() -> None:
        percent = round(bytes_downloaded / bytes_total * 99.0, 1) if bytes_total else 50.0
        percent = min(99.0, max(0.0, percent))
        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model_name,
            percent=percent,
            bytes_downloaded=bytes_downloaded,
            bytes_total=bytes_total,
            downloaded_label=format_bytes(bytes_downloaded),
            total_label=format_bytes(bytes_total) if bytes_total else "unknown",
        )

    def count_chunk(size: int) -> None:
        nonlocal bytes_downloaded
        bytes_downloaded += size
        send_progress()

    try:
        for filename, expected_size in repo_files:
            dest = local_dir / filename
            if dest.exists() and dest.is_file() and (expected_size is None or dest.stat().st_size == expected_size):
                bytes_downloaded += dest.stat().st_size
                send_progress()
                continue

            tmp_dest = dest.with_name(f"{dest.name}.incomplete")
            dest.parent.mkdir(parents=True, exist_ok=True)
            if tmp_dest.exists():
                tmp_dest.unlink()

            url = hf_hub_url(repo_id=spec.repo_id, filename=filename)
            _http_get(url, tmp_dest, token=token, on_chunk=count_chunk)
            if expected_size is not None and tmp_dest.stat().st_size != expected_size:
                raise RuntimeError(f"{filename} downloaded {tmp_dest.stat().st_size} bytes, expected {expected_size}")
            tmp_dest.replace(dest)
    except Exception as exc:
        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
        ipc.send(Event.ERROR, msg=f"Download failed for {model_name}: {exc}")
        return

    if not is_downloaded(model_name):
        ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))
        ipc.send(Event.ERROR, msg=f"Download incomplete for {model_name}: required model files are missing or incomplete")
        return

    ipc.send(Event.DOWNLOAD_PROGRESS, **download_status_payload(model_name))


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
