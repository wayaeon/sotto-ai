from sidecar import models
from sidecar.ipc import Event
import sys
import types
import wave


class CapturingIPC:
    def __init__(self):
        self.events = []

    def send(self, event, **data):
        self.events.append({"event": event.value if isinstance(event, Event) else event, **data})


def test_model_catalog_exposes_approx_sizes():
    assert models.MODEL_DOWNLOAD_SIZES["large-v3-turbo"] >= 3 * 1024**3
    assert models.MODEL_DOWNLOAD_SIZES["tiny"] < models.MODEL_DOWNLOAD_SIZES["base"]


def test_model_catalog_exposes_downloadable_repos_for_all_candidates():
    assert models.MODEL_CATALOG["nvidia/parakeet-tdt-0.6b-v3"].repo_id == "nvidia/parakeet-tdt-0.6b-v3"
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].download_supported is True
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].benchmark_supported is True
    assert models.MODEL_CATALOG["csukuangfj/sherpa-onnx-zipformer-en-2023-04-01"].runtime == "onnx"
    assert models.MODEL_CATALOG["medium.en"].benchmark_supported is True


def test_format_bytes_for_download_events():
    assert models.format_bytes(0) == "0 B"
    assert models.format_bytes(1536) == "1.5 KB"
    assert models.format_bytes(3 * 1024**3) == "3.0 GB"


def test_wav_duration_ms_uses_stdlib_wave(tmp_path):
    wav_path = tmp_path / "sample.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 8000)

    assert models._wav_duration_ms(wav_path) == 500


def test_faster_whisper_partial_model_bin_is_not_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "large-v3-turbo"
    model_path.mkdir()
    (model_path / "model.bin").write_bytes(b"0" * (32 * 1024**2))

    assert models.is_downloaded("large-v3-turbo") is False


def test_faster_whisper_large_model_bin_counts_as_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "tiny"
    model_path.mkdir()
    minimum_size = int(models.MODEL_DOWNLOAD_SIZES["tiny"] * 0.36)
    (model_path / "model.bin").write_bytes(b"0" * minimum_size)

    assert models.is_downloaded("tiny") is True


def test_download_status_payload_marks_missing_model_not_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)

    payload = models.download_status_payload("tiny")

    assert payload["model"] == "tiny"
    assert payload["checked"] is True
    assert payload["downloaded"] is False
    assert payload["percent"] == 0.0
    assert payload["downloaded_label"] == "not downloaded"


def test_download_model_does_not_report_cached_when_required_file_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)

    def fail_http_get(*_args, **_kwargs):
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(models, "_http_get", fail_http_get)
    ipc = CapturingIPC()

    models._download_model("tiny", ipc)

    assert any(
        event["event"] == "error" and "Download incomplete" in event["msg"]
        for event in ipc.events
    )
    assert not any(
        event["event"] == "download_progress"
        and event.get("percent") == 100.0
        and event.get("downloaded_label") == "cached"
        for event in ipc.events
    )


def test_snapshot_download_streams_chunk_progress(tmp_path, monkeypatch):
    local_dir = tmp_path / "UsefulSensors" / "moonshine-base"
    spec = models.MODEL_CATALOG["UsefulSensors/moonshine-base"]
    ipc = CapturingIPC()

    def old_snapshot_download(**_kwargs):
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / "model.safetensors").write_bytes(b"0" * 1000)

    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub",
        types.SimpleNamespace(
            snapshot_download=old_snapshot_download,
            hf_hub_url=lambda repo_id, filename: f"https://example.test/{repo_id}/{filename}",
        ),
    )
    monkeypatch.setattr(
        models,
        "_snapshot_repo_files",
        lambda *_args, **_kwargs: [("model.safetensors", 1000)],
        raising=False,
    )

    def streaming_http_get(_url, dest, token=None, on_chunk=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as file:
            for chunk_size in (250, 250, 500):
                file.write(b"0" * chunk_size)
                if on_chunk:
                    on_chunk(chunk_size)
        return 1000

    monkeypatch.setattr(models, "_http_get", streaming_http_get)

    models._snapshot_download_model("UsefulSensors/moonshine-base", spec, local_dir, ipc)

    in_flight = [
        event for event in ipc.events
        if event["event"] == "download_progress" and 0 < event["percent"] < 100
    ]
    assert len(in_flight) >= 3
    assert [event["bytes_downloaded"] for event in in_flight[:3]] == [250, 500, 1000]
    assert ipc.events[-1]["event"] == "download_progress"
    assert ipc.events[-1]["downloaded_label"] == "cached"
