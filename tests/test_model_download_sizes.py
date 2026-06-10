from sidecar import models
import sidecar.runtimes as runtime_dispatch
from sidecar.recorder import Recorder
from sidecar.runtimes import get_adapter, resolve_device
from sidecar.ipc import Event
from pathlib import Path
import re
import sys
import threading
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
    parakeet = models.MODEL_CATALOG["nvidia/parakeet-tdt-0.6b-v3"]
    assert parakeet.repo_id == "istupakov/parakeet-tdt-0.6b-v3-onnx"
    assert parakeet.runtime == "onnx-asr"
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].download_supported is True
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].benchmark_supported is True
    assert models.MODEL_CATALOG["csukuangfj/sherpa-onnx-zipformer-en-2023-04-01"].runtime == "onnx"
    assert models.MODEL_CATALOG["medium.en"].benchmark_supported is True


def test_frontend_model_candidate_ids_match_sidecar_catalog():
    source = Path("src/components/PipelineDebug.tsx").read_text(encoding="utf-8")
    match = re.search(r"const MODEL_CANDIDATES: ModelCandidate\[] = \[(.*?)\];", source, re.S)
    assert match is not None
    frontend_ids = set(re.findall(r'id: "([^"]+)"', match.group(1)))

    assert frontend_ids == set(models.MODEL_CATALOG)


def test_model_catalog_includes_new_research_candidates():
    assert models.MODEL_CATALOG["CohereLabs/cohere-transcribe-03-2026"].runtime == "transformers"
    assert models.MODEL_CATALOG["nvidia/nemotron-speech-streaming-en-0.6b"].runtime == "nemo"
    assert models.MODEL_CATALOG["nvidia/canary-1b-v2"].runtime == "nemo"
    assert models.MODEL_CATALOG["ibm-granite/granite-4.0-1b-speech"].runtime == "transformers"


def test_qwen_asr_runtime_routes_to_transformers_adapter():
    assert get_adapter("qwen-asr").__name__.endswith(".transformers")


def test_optimized_parakeet_runtime_routes_to_onnx_asr_adapter():
    assert get_adapter("onnx-asr").__name__.endswith(".onnx_asr")


def test_non_onnx_models_do_not_claim_npu_execution():
    assert resolve_device("transformers", "npu") == "cpu"
    assert resolve_device("nemo", "npu") == "cpu"
    assert resolve_device("onnx", "npu") == "npu"
    assert resolve_device("onnx-asr", "npu") == "cpu"


def test_recorder_model_switch_failure_does_not_restore_hardware_default(monkeypatch):
    recorder = Recorder.__new__(Recorder)
    recorder._ipc = CapturingIPC()
    recorder._lock = threading.Lock()
    recorder._model_name = "csukuangfj/sherpa-onnx-zipformer-en-2023-04-01"
    recorder._worker_error = None
    recorder._loaded_model_name = recorder._model_name
    recorder._transcription_active = False
    recorder._worker_proc = None
    recorder._recorder = None
    recorder._handsfree = False

    recorder._model_lock = threading.Lock()
    monkeypatch.setattr(recorder, "_stop_worker", lambda: None)
    monkeypatch.setattr(
        recorder,
        "_start_worker",
        lambda: (_ for _ in ()).throw(RuntimeError("runtime load failed")),
    )

    # set_model is now async (request accepted → True); run the load synchronously.
    recorder._requested_model = "mistralai/Voxtral-Mini-4B-Realtime-2602"
    recorder._load_requested_model()

    assert recorder._model_name == "mistralai/Voxtral-Mini-4B-Realtime-2602"
    assert recorder._worker_error == "runtime load failed"
    assert any(event["event"] == "error" and "Model switch failed" in event["msg"] for event in recorder._ipc.events)
    assert recorder._ipc.events[-1] == {"event": "status", "msg": "idle"}


def test_set_model_rejects_unknown_model():
    recorder = Recorder.__new__(Recorder)
    recorder._ipc = CapturingIPC()

    assert recorder.set_model("not/a-real-model") is False
    assert recorder._ipc.events[-1]["event"] == "error"


def test_recording_proceeds_after_previous_model_load_failure(tmp_path, monkeypatch):
    """A failed model load must NOT permanently block recording — the worker
    is retried on the next transcription instead."""
    import sidecar.recorder as recorder_mod

    monkeypatch.setattr(recorder_mod, "_RECORDINGS_DIR", tmp_path)

    recorder = Recorder.__new__(Recorder)
    recorder._ipc = CapturingIPC()
    recorder._lock = threading.Lock()
    recorder._worker_error = "Voxtral runtime unavailable"
    recorder._transcription_active = False
    recorder._recording_active = False
    recorder._current_wf = None
    recorder._last_wav_path = None
    recorder._model_name = "nvidia/parakeet-tdt-0.6b-v3"

    recorder.start_ptt()

    assert recorder._recording_active is True
    assert recorder._ipc.events[-1] == {"event": "status", "msg": "recording_ptt"}
    recorder._current_wf.close()


def test_reselecting_loaded_model_reuses_existing_worker(monkeypatch):
    recorder = Recorder.__new__(Recorder)
    recorder._ipc = CapturingIPC()
    recorder._model_lock = threading.Lock()
    recorder._model_name = "UsefulSensors/moonshine-base"
    recorder._loaded_model_name = recorder._model_name
    recorder._transcription_active = False
    recorder._worker_proc = types.SimpleNamespace(is_alive=lambda: True)

    monkeypatch.setattr(
        recorder,
        "_stop_worker",
        lambda: (_ for _ in ()).throw(AssertionError("loaded worker should be reused")),
    )

    recorder._requested_model = recorder._model_name
    recorder._load_requested_model()
    assert recorder._ipc.events[-1] == {
        "event": "status",
        "msg": "model_selected model=UsefulSensors/moonshine-base",
    }


def test_worker_ready_identifies_confirmed_loaded_model(monkeypatch):
    recorder = Recorder.__new__(Recorder)
    recorder._ipc = CapturingIPC()
    recorder._model_name = "nvidia/parakeet-tdt-0.6b-v3"
    recorder._device = "cpu"
    recorder._worker_error = None
    recorder._loaded_model_name = None
    recorder._task_q = None
    recorder._result_q = None
    recorder._worker_proc = None

    fake_queue = types.SimpleNamespace(get=lambda timeout: (
        "ready",
        {"device": "cpu", "compute_type": "int8", "runtime": "onnx-asr"},
    ))
    fake_context = types.SimpleNamespace(
        Queue=lambda: fake_queue,
        Process=lambda **_kwargs: types.SimpleNamespace(start=lambda: None, is_alive=lambda: True),
    )
    monkeypatch.setattr(recorder, "_ensure_model_downloaded", lambda: None)
    monkeypatch.setattr(recorder, "_get_model_path", lambda: "model-path")
    monkeypatch.setattr(recorder, "_runtime", lambda: "onnx-asr")
    monkeypatch.setattr("sidecar.recorder.multiprocessing.get_context", lambda _method: fake_context)

    recorder._start_worker()

    assert recorder._ipc.events[-1] == {
        "event": "status",
        "msg": "worker_ready model=nvidia/parakeet-tdt-0.6b-v3 device=cpu compute=int8 runtime=onnx-asr",
    }
    assert models.MODEL_CATALOG["Qwen/Qwen3-ASR-1.7B"].runtime == "qwen-asr"
    assert models.MODEL_CATALOG["Qwen/Qwen3-ASR-1.7B"].approx_size_bytes >= 4 * 1024**3
    assert models.MODEL_CATALOG["ibm-granite/granite-4.0-1b-speech"].approx_size_bytes >= 4 * 1024**3
    assert 8 * 1024**3 <= models.MODEL_CATALOG["mistralai/Voxtral-Mini-4B-Realtime-2602"].approx_size_bytes < 9 * 1024**3


def test_voxtral_snapshot_download_skips_duplicate_consolidated_weights():
    repo_id = "mistralai/Voxtral-Mini-4B-Realtime-2602"

    assert models._should_ignore_snapshot_file("consolidated.safetensors", repo_id) is True
    assert models._should_ignore_snapshot_file("model.safetensors", repo_id) is False
    assert models._should_ignore_snapshot_file("consolidated.safetensors", "Qwen/Qwen3-ASR-1.7B") is False


def test_optimized_parakeet_snapshot_download_uses_int8_onnx_only():
    repo_id = "istupakov/parakeet-tdt-0.6b-v3-onnx"

    assert models._should_ignore_snapshot_file("encoder-model.onnx", repo_id) is True
    assert models._should_ignore_snapshot_file("decoder_joint-model.onnx", repo_id) is True
    assert models._should_ignore_snapshot_file("encoder-model.int8.onnx", repo_id) is False
    assert models._should_ignore_snapshot_file("decoder_joint-model.int8.onnx", repo_id) is False


def test_format_bytes_for_download_events():
    assert models.format_bytes(0) == "0 B"
    assert models.format_bytes(1536) == "1.5 KB"
    assert models.format_bytes(3 * 1024**3) == "3.000 GB"
    assert models.format_bytes(3 * 1024**3 + 123 * 1024**2) == "3.120 GB"


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


def test_qwen_asr_weight_file_counts_as_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "Qwen" / "Qwen3-ASR-1.7B"
    model_path.mkdir(parents=True)
    (model_path / "model.safetensors").write_bytes(b"0")

    assert models.is_downloaded("Qwen/Qwen3-ASR-1.7B") is True


def test_qwen_asr_sharded_safetensors_count_as_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "Qwen" / "Qwen3-ASR-1.7B"
    model_path.mkdir(parents=True)
    (model_path / "model-00001-of-00002.safetensors").write_bytes(b"0")
    (model_path / "model-00002-of-00002.safetensors").write_bytes(b"0")
    (model_path / "model.safetensors.index.json").write_text("{}", encoding="utf-8")

    assert models.is_downloaded("Qwen/Qwen3-ASR-1.7B") is True


def test_transformers_sharded_safetensors_count_as_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "ibm-granite" / "granite-4.0-1b-speech"
    model_path.mkdir(parents=True)
    (model_path / "model-00001-of-00003.safetensors").write_bytes(b"0")
    (model_path / "model-00002-of-00003.safetensors").write_bytes(b"0")
    (model_path / "model-00003-of-00003.safetensors").write_bytes(b"0")
    (model_path / "model.safetensors.index.json").write_text("{}", encoding="utf-8")

    assert models.is_downloaded("ibm-granite/granite-4.0-1b-speech") is True


def test_incomplete_snapshot_weights_do_not_count_as_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    model_path = tmp_path / "mistralai" / "Voxtral-Mini-4B-Realtime-2602"
    model_path.mkdir(parents=True)
    (model_path / "model.safetensors.incomplete").write_bytes(b"0")

    assert models.is_downloaded("mistralai/Voxtral-Mini-4B-Realtime-2602") is False


def test_download_status_ignores_repo_specific_duplicate_snapshot_files(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(models, "_module_available", lambda _name: True)
    model_path = tmp_path / "mistralai" / "Voxtral-Mini-4B-Realtime-2602"
    model_path.mkdir(parents=True)
    (model_path / "model.safetensors").write_bytes(b"0" * 100)
    (model_path / "consolidated.safetensors").write_bytes(b"0" * 1000)
    (model_path / "model.safetensors.incomplete").write_bytes(b"0" * 10000)

    payload = models.download_status_payload("mistralai/Voxtral-Mini-4B-Realtime-2602")

    assert payload["downloaded"] is True
    assert payload["bytes_downloaded"] == 100


def test_download_status_for_optimized_parakeet_counts_onnx_weights(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(models, "_module_available", lambda _name: True)
    model_path = tmp_path / "nvidia" / "parakeet-tdt-0.6b-v3"
    model_path.mkdir(parents=True)
    (model_path / "encoder-model.int8.onnx").write_bytes(b"0" * 1000)
    (model_path / "decoder_joint-model.int8.onnx").write_bytes(b"0" * 100)

    payload = models.download_status_payload("nvidia/parakeet-tdt-0.6b-v3")

    assert payload["downloaded"] is True
    assert payload["bytes_downloaded"] == 1100


def test_download_status_payload_marks_missing_model_not_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(models, "_module_available", lambda _name: True)

    payload = models.download_status_payload("tiny")

    assert payload["model"] == "tiny"
    assert payload["checked"] is True
    assert payload["downloaded"] is False
    assert payload["percent"] == 0.0
    assert payload["downloaded_label"] == "not downloaded"
    assert payload["benchmark_available"] is True


def test_benchmark_availability_reports_missing_onnx_asr_runtime(monkeypatch):
    monkeypatch.setattr(models, "_module_available", lambda name: name != "onnx_asr")

    available, reason = models.benchmark_availability("nvidia/parakeet-tdt-0.6b-v3")

    assert available is False
    assert reason == "Missing optimized Parakeet ONNX runtime"


def test_benchmark_availability_reports_missing_transformers_runtime(monkeypatch):
    monkeypatch.setattr(models, "_module_available", lambda name: name != "transformers")

    available, reason = models.benchmark_availability("UsefulSensors/moonshine-base")

    assert available is False
    assert reason == "Missing Transformers runtime"


def test_benchmark_availability_reports_missing_funasr_runtime(monkeypatch):
    monkeypatch.setattr(models, "_module_available", lambda name: name != "funasr")

    available, reason = models.benchmark_availability("FunAudioLLM/SenseVoiceSmall")

    assert available is False
    assert reason == "Missing FunASR runtime"


def test_benchmark_availability_reports_missing_qwen_asr_runtime(monkeypatch):
    monkeypatch.setattr(models, "_module_available", lambda _name: False)

    available, reason = models.benchmark_availability("Qwen/Qwen3-ASR-1.7B")

    assert available is False
    assert reason == "Missing Qwen ASR runtime"


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


def test_benchmark_model_attempts_runtime_load_and_reports_real_error(tmp_path, monkeypatch):
    wav_path = tmp_path / "sample.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 1600)

    monkeypatch.setattr(models, "is_downloaded", lambda _model_name: True)
    monkeypatch.setattr(
        runtime_dispatch,
        "get_adapter",
        lambda _runtime: types.SimpleNamespace(
            load_model=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("runtime load failed")),
            transcribe=lambda *_args, **_kwargs: "",
        ),
    )
    ipc = CapturingIPC()

    models._benchmark_model("nvidia/parakeet-tdt-0.6b-v3", str(wav_path), ipc)

    assert ipc.events
    assert ipc.events[0]["event"] == "error"
    assert ipc.events[0]["msg"].startswith("Benchmark failed for nvidia/parakeet-tdt-0.6b-v3:")


def test_snapshot_download_reports_resolving_before_repo_listing(tmp_path, monkeypatch):
    local_dir = tmp_path / "UsefulSensors" / "moonshine-base"
    spec = models.MODEL_CATALOG["UsefulSensors/moonshine-base"]
    ipc = CapturingIPC()

    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub",
        types.SimpleNamespace(
            hf_hub_url=lambda repo_id, filename: f"https://example.test/{repo_id}/{filename}",
        ),
    )

    def repo_files_after_progress(*_args, **_kwargs):
        assert ipc.events
        assert ipc.events[-1]["event"] == "download_progress"
        assert ipc.events[-1]["percent"] == 0.0
        assert ipc.events[-1]["downloaded_label"] == "resolving"
        return [("model.safetensors", 1000)]

    monkeypatch.setattr(models, "_snapshot_repo_files", repo_files_after_progress, raising=False)

    def streaming_http_get(_url, dest, token=None, on_chunk=None, wait_if_paused=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as file:
            file.write(b"0" * 1000)
            if on_chunk:
                on_chunk(1000)
        return 1000

    monkeypatch.setattr(models, "_http_get", streaming_http_get)

    models._snapshot_download_model("UsefulSensors/moonshine-base", spec, local_dir, ipc)


def test_snapshot_download_reports_failed_when_repo_listing_fails(tmp_path, monkeypatch):
    local_dir = tmp_path / "UsefulSensors" / "moonshine-base"
    spec = models.MODEL_CATALOG["UsefulSensors/moonshine-base"]
    ipc = CapturingIPC()

    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub",
        types.SimpleNamespace(
            hf_hub_url=lambda repo_id, filename: f"https://example.test/{repo_id}/{filename}",
        ),
    )
    monkeypatch.setattr(
        models,
        "_snapshot_repo_files",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("metadata timed out")),
        raising=False,
    )

    models._snapshot_download_model("UsefulSensors/moonshine-base", spec, local_dir, ipc)

    assert ipc.events[0]["event"] == "download_progress"
    assert ipc.events[0]["downloaded_label"] == "resolving"
    assert any(
        event["event"] == "download_progress" and event.get("failed") is True
        for event in ipc.events
    )
    assert ipc.events[-1]["event"] == "error"
    assert "could not list repo files" in ipc.events[-1]["msg"]


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

    def streaming_http_get(_url, dest, token=None, on_chunk=None, wait_if_paused=None):
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


def test_snapshot_download_accepts_sharded_weight_manifest(tmp_path, monkeypatch):
    local_dir = tmp_path / "Qwen" / "Qwen3-ASR-1.7B"
    spec = models.MODEL_CATALOG["Qwen/Qwen3-ASR-1.7B"]
    ipc = CapturingIPC()

    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub",
        types.SimpleNamespace(
            hf_hub_url=lambda repo_id, filename: f"https://example.test/{repo_id}/{filename}",
        ),
    )
    monkeypatch.setattr(
        models,
        "_snapshot_repo_files",
        lambda *_args, **_kwargs: [
            ("model-00001-of-00002.safetensors", 600),
            ("model-00002-of-00002.safetensors", 400),
            ("model.safetensors.index.json", 20),
        ],
        raising=False,
    )

    def streaming_http_get(_url, dest, token=None, on_chunk=None, wait_if_paused=None):
        sizes = {
            "model-00001-of-00002.safetensors": 600,
            "model-00002-of-00002.safetensors": 400,
            "model.safetensors.index.json": 20,
        }
        dest.parent.mkdir(parents=True, exist_ok=True)
        size = sizes[dest.name.removesuffix(".incomplete")]
        with open(dest, "wb") as file:
            file.write(b"0" * size)
        if on_chunk:
            on_chunk(size)
        return size

    monkeypatch.setattr(models, "_http_get", streaming_http_get)

    models._snapshot_download_model("Qwen/Qwen3-ASR-1.7B", spec, local_dir, ipc)

    assert ipc.events[-1]["event"] == "download_progress"
    assert ipc.events[-1]["downloaded"] is True


def test_pause_download_model_marks_active_download_paused():
    ipc = CapturingIPC()
    model_name = "tiny"
    try:
        models._ACTIVE_DOWNLOADS.add(model_name)
        models._DOWNLOAD_PAUSES[model_name] = threading.Event()
        models._DOWNLOAD_LAST_PROGRESS[model_name] = {
            "model": model_name,
            "percent": 42.0,
            "bytes_downloaded": 42,
            "bytes_total": 100,
        }

        models.pause_download_model(model_name, ipc)

        assert models._DOWNLOAD_PAUSES[model_name].is_set()
        assert ipc.events[-1]["event"] == "download_progress"
        assert ipc.events[-1]["model"] == model_name
        assert ipc.events[-1]["percent"] == 42.0
        assert ipc.events[-1]["paused"] is True
    finally:
        models._ACTIVE_DOWNLOADS.discard(model_name)
        models._DOWNLOAD_PAUSES.pop(model_name, None)
        models._DOWNLOAD_LAST_PROGRESS.pop(model_name, None)


def test_download_model_async_resumes_active_paused_download_without_new_thread(monkeypatch):
    ipc = CapturingIPC()
    model_name = "tiny"
    pause_event = threading.Event()
    pause_event.set()

    def fail_if_thread_starts(*_args, **_kwargs):
        raise AssertionError("resume should not spawn a duplicate download thread")

    monkeypatch.setattr(models.threading, "Thread", fail_if_thread_starts)

    try:
        models._ACTIVE_DOWNLOADS.add(model_name)
        models._DOWNLOAD_PAUSES[model_name] = pause_event
        models._DOWNLOAD_LAST_PROGRESS[model_name] = {
            "model": model_name,
            "percent": 42.0,
            "bytes_downloaded": 42,
            "bytes_total": 100,
        }

        models.download_model_async(model_name, ipc)

        assert not pause_event.is_set()
        assert ipc.events[-1]["event"] == "download_progress"
        assert ipc.events[-1]["model"] == model_name
        assert ipc.events[-1]["paused"] is False
    finally:
        models._ACTIVE_DOWNLOADS.discard(model_name)
        models._DOWNLOAD_PAUSES.pop(model_name, None)
        models._DOWNLOAD_LAST_PROGRESS.pop(model_name, None)
