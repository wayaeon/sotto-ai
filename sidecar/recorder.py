"""Push-to-talk and hands-free recording modes.

Architecture for PTT:
  - Always-on audio pump keeps the mic stream open permanently.
    start_ptt() is instant: just opens a WAV file and flips a flag.
    No thread spawn, no stream init on the hot path.
  - A long-lived _TranscriptionWorker subprocess holds the model in
    memory. Audio paths are sent to it via a multiprocessing Queue.
  - If the worker crashes (ctranslate2 SIGSEGV) the sidecar stays alive
    and respawns the worker on the next PTT.

Hands-free mode is the same pipeline with VAD standing in for the
keypress: the always-on pump feeds raw chunks to a queue, webrtcvad
segments them into utterances, and each finished utterance goes
through the exact same worker subprocess as PTT. This means hands-free
automatically works with whatever model/runtime is currently loaded —
it used to go through RealtimeSTT's AudioToTextRecorder, which is
faster-whisper-only and would silently try (and fail) to load an ONNX
or NeMo model as if it were a CTranslate2 one.
"""
from __future__ import annotations

import multiprocessing
import queue
import threading
import time
import wave
from datetime import datetime
from pathlib import Path
import webrtcvad
from .ipc import IPC, Event
from .hardware import ModelTier, HardwareInfo
from .models import best_available_model, model_dir

_RECORDINGS_DIR  = Path.home() / ".verba" / "recordings"
_SAMPLE_RATE     = 16000
_SAMPLE_WIDTH    = 2       # 16-bit PCM
_CHUNK_SIZE      = 1024
_WORKER_TIMEOUT  = 1800    # allow slow CPU models to finish without unloading
_WORKER_INIT_S   = 120     # seconds to wait for model load (GPU can take ~30 s)

# ── hands-free VAD segmentation ──────────────────────────────────────────────
_VAD_FRAME_MS           = 30
_VAD_FRAME_BYTES        = int(_SAMPLE_RATE * _VAD_FRAME_MS / 1000) * _SAMPLE_WIDTH  # 960 B
_VAD_AGGRESSIVENESS     = 3   # 0 (permissive) .. 3 (aggressive) — webrtcvad's own scale
_HANDSFREE_SILENCE_MS   = 800    # trailing silence that ends an utterance
_HANDSFREE_MIN_SPEECH_MS = 400   # ignore blips shorter than this
# A single 30ms frame passing webrtcvad's classifier is not enough to commit to
# "this is speech" — clicks, hums, and other transients can pass it too. Require
# this many *consecutive* speech frames before starting to record an utterance.
_HANDSFREE_ONSET_MS = 150
_HANDSFREE_SILENCE_FRAMES    = _HANDSFREE_SILENCE_MS // _VAD_FRAME_MS
_HANDSFREE_MIN_SPEECH_FRAMES = _HANDSFREE_MIN_SPEECH_MS // _VAD_FRAME_MS
_HANDSFREE_ONSET_FRAMES      = _HANDSFREE_ONSET_MS // _VAD_FRAME_MS
# Deep enough that a cold worker load (_WORKER_INIT_S, worst case) can't
# overflow the queue and silently drop audio spoken while it's loading.
_PUMP_CHUNK_S           = _CHUNK_SIZE / _SAMPLE_RATE
_HANDSFREE_QUEUE_MAXLEN = int(_WORKER_INIT_S / _PUMP_CHUNK_S)

try:
    import torch
    torch.hub._check_repo_is_trusted = lambda *args, **kwargs: None  # noqa
except Exception:
    pass


def _pcm16_level(data: bytes) -> float:
    """Return RMS level for mono 16-bit PCM bytes, normalized to 0..1."""
    sample_count = len(data) // _SAMPLE_WIDTH
    if sample_count <= 0:
        return 0.0
    total = 0
    usable_bytes = sample_count * _SAMPLE_WIDTH
    for index in range(0, usable_bytes, _SAMPLE_WIDTH):
        sample = int.from_bytes(data[index:index + _SAMPLE_WIDTH], "little", signed=True)
        total += sample * sample
    rms = (total / sample_count) ** 0.5
    return min(1.0, rms / 32768.0)


# ── Module-level worker loop ─────────────────────────────────────────────────

def _worker_loop(model_name: str, model_path: str, runtime: str, device: str, task_q, result_q) -> None:  # type: ignore[type-arg]
    """Long-lived subprocess: loads model once via adapter, transcribes on demand."""
    try:
        from sidecar.runtimes import get_adapter, resolve_device
        device = resolve_device(runtime, device)
        compute_type = "float16" if device == "cuda" else "int8"
        adapter = get_adapter(runtime)
        model = adapter.load_model(model_path, device, compute_type)
        result_q.put(("ready", {"device": device, "compute_type": compute_type, "runtime": runtime}))
    except Exception as exc:  # noqa: BLE001
        result_q.put(("error", f"Worker init failed: {exc}"))
        return

    while True:
        audio_path = task_q.get()
        if audio_path is None:
            return
        try:
            text = adapter.transcribe(model, str(audio_path))
            result_q.put(("ok", text))
        except Exception as exc:  # noqa: BLE001
            result_q.put(("error", str(exc)))


class Recorder:
    def __init__(self, ipc: IPC, hw: "HardwareInfo") -> None:
        self._ipc        = ipc
        self._tier       = hw.tier
        self._device     = hw.device_str
        self._model_name = best_available_model(hw.model_name)
        self._initial_prompt = ""

        # ── always-on audio pump ──────────────────────────────────────────────
        self._pump_thread:   threading.Thread | None = None
        self._shutdown_event = threading.Event()
        self._pump_ready     = threading.Event()   # set when stream is open

        # ── PTT state (protected by _lock) ───────────────────────────────────
        self._lock             = threading.Lock()
        self._recording_active = False
        self._current_wf:      wave.Wave_write | None = None
        self._last_wav_path:   str | None = None
        self._capture_start_ms: float = 0.0

        # ── transcription worker subprocess ───────────────────────────────────
        # _model_lock serializes ALL worker lifecycle operations
        # (_start_worker / _stop_worker / model switches). Without it, the
        # startup set_model from the frontend races the preload thread and
        # both poll/replace the same queues → lost "ready" → 120 s timeout.
        self._model_lock = threading.Lock()
        self._requested_model: str | None = None
        self._worker_proc:  multiprocessing.Process | None = None
        self._task_q:       multiprocessing.Queue | None = None
        self._result_q:     multiprocessing.Queue | None = None
        self._worker_error:  str | None = None
        self._loaded_model_name: str | None = None
        self._transcription_active = False

        # ── hands-free (VAD-segmented, shares the PTT worker) ─────────────────
        self._handsfree       = False
        self._handsfree_queue: "queue.Queue[bytes] | None" = None

        _RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        threading.Thread(target=self._preload, daemon=True).start()

    # ── preload ───────────────────────────────────────────────────────────────

    def _preload(self) -> None:
        """Start the always-on audio pump.

        Deliberately does NOT load a model. The frontend sends set_model
        immediately after the READY event, and that is the single trigger
        for the first model load. Loading here as well caused a race where
        two threads fought over the worker queues and the load timed out.
        """
        try:
            # Start always-on audio pump — keeps mic stream open permanently
            self._pump_thread = threading.Thread(
                target=self._audio_pump, daemon=True
            )
            self._pump_thread.start()
            # Wait for mic device to open (usually <500 ms)
            if not self._pump_ready.wait(timeout=8.0):
                self._ipc.send(Event.ERROR, msg="Audio device did not open within 8 s")
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Preload failed: {e}")

    # ── always-on audio pump ──────────────────────────────────────────────────

    def _audio_pump(self) -> None:
        """Continuously read from mic. Keeps stream warm.
        When _recording_active, writes chunks directly into the open WAV file.
        When _handsfree is on, also feeds chunks to the VAD segmentation queue.
        This makes start_ptt() instant — no stream init on the hot path.
        """
        import pyaudio
        pa = pyaudio.PyAudio()
        try:
            stream = pa.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=_SAMPLE_RATE,
                input=True,
                frames_per_buffer=_CHUNK_SIZE,
            )
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Audio device open failed: {e}")
            pa.terminate()
            return

        self._pump_ready.set()  # signal that stream is open

        while not self._shutdown_event.is_set():
            try:
                data = stream.read(_CHUNK_SIZE, exception_on_overflow=False)
            except Exception:
                time.sleep(0.005)
                continue
            # Write to WAV only when recording
            with self._lock:
                wf = self._current_wf
                hf_queue = self._handsfree_queue
            if wf is not None:
                try:
                    wf.writeframes(data)
                except Exception:
                    pass
            if hf_queue is not None:
                try:
                    hf_queue.put_nowait(data)
                except queue.Full:
                    pass

        stream.stop_stream()
        stream.close()
        pa.terminate()

    # ── model loading ─────────────────────────────────────────────────────────

    def _get_model_path(self) -> str:
        d = model_dir(self._model_name)
        return str(d) if d.exists() else self._model_name

    def _runtime(self) -> str:
        from .models import MODEL_CATALOG

        spec = MODEL_CATALOG.get(self._model_name)
        return spec.runtime if spec else "faster-whisper"

    def _postprocess_transcript(self, text: str) -> str:
        if self._runtime() != "onnx":
            return text.strip()
        from .cleanup import restore_readable_transcript

        return restore_readable_transcript(text)

    def _ensure_model_downloaded(self) -> None:
        from .models import is_downloaded, _download_model
        if not is_downloaded(self._model_name):
            self._ipc.send(Event.STATUS, msg="loading_model")
            _download_model(self._model_name, self._ipc)

    def _start_worker(self) -> None:
        self._worker_error = None
        self._loaded_model_name = None
        self._ensure_model_downloaded()
        model_path = self._get_model_path()

        runtime = self._runtime()

        ctx = multiprocessing.get_context("spawn")
        self._task_q   = ctx.Queue()
        self._result_q = ctx.Queue()
        self._worker_proc = ctx.Process(
            target=_worker_loop,
            args=(self._model_name, model_path, runtime, self._device, self._task_q, self._result_q),
            daemon=False,
            name="verba-transcriber",
        )
        self._worker_proc.start()

        deadline = time.monotonic() + _WORKER_INIT_S
        while time.monotonic() < deadline:
            try:
                status, msg = self._result_q.get(timeout=2)
                if status == "ready":
                    info = msg if isinstance(msg, dict) else {}
                    device  = info.get("device", "cpu")
                    compute = info.get("compute_type", "int8")
                    runtime = info.get("runtime", runtime)
                    self._ipc.send(
                        Event.STATUS,
                        msg=(
                            f"worker_ready model={self._model_name} "
                            f"device={device} compute={compute} runtime={runtime}"
                        ),
                    )
                    self._loaded_model_name = self._model_name
                    return
                elif status == "error":
                    raise RuntimeError(msg)
            except queue.Empty:
                if not self._worker_proc.is_alive():
                    raise RuntimeError(
                        f"Worker exited during init (code {self._worker_proc.exitcode})"
                    )
        raise RuntimeError(f"Worker did not become ready within {_WORKER_INIT_S} s")

    def _ensure_worker(self) -> bool:
        """Make sure a worker for the current model is alive. Always retryable —
        a previous failure never permanently blocks a new attempt."""
        with self._model_lock:
            if (
                self._worker_proc is not None
                and self._worker_proc.is_alive()
                and self._loaded_model_name == self._model_name
            ):
                return True
            if self._worker_proc is not None:
                self._stop_worker()
            self._worker_error = None  # clear stale error — retry instead of refusing
            try:
                self._ipc.send(Event.STATUS, msg="loading_model")
                self._start_worker()
                self._ipc.send(Event.STATUS, msg="idle")
                return True
            except Exception as e:
                self._worker_error = str(e)
                self._ipc.send(Event.ERROR, msg=f"Worker respawn failed: {e}")
                return False

    # ── PTT ───────────────────────────────────────────────────────────────────

    def start_ptt(self) -> None:
        """Instant PTT start — pump is already running, just open WAV and flip flag.

        A previous worker failure does NOT block recording: _fetch_transcription
        retries the worker via _ensure_worker, so the app self-heals instead of
        staying dead until restart.
        """
        if self._transcription_active:
            self._ipc.send(Event.ERROR, msg=f"{self._model_name} is still transcribing the previous recording")
            return
        with self._lock:
            if self._recording_active:
                return  # already recording
            self._capture_start_ms = time.time() * 1000
            ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
            wav_path = _RECORDINGS_DIR / f"{ts}.wav"
            wf       = wave.open(str(wav_path), "wb")
            wf.setnchannels(1)
            wf.setsampwidth(_SAMPLE_WIDTH)
            wf.setframerate(_SAMPLE_RATE)
            self._last_wav_path    = str(wav_path)
            self._current_wf       = wf
            self._recording_active = True
        # Status emitted outside lock — pump already writing
        self._ipc.send(Event.STATUS, msg="recording_ptt")

    def stop_ptt(self) -> None:
        with self._lock:
            if not self._recording_active:
                self._ipc.send(Event.STATUS, msg="idle")
                return
            t_capture_end_ms       = time.time() * 1000
            self._recording_active = False
            wf                     = self._current_wf
            self._current_wf       = None
            audio_path             = self._last_wav_path
            self._ipc.send(Event.STATUS, msg="processing")

        # Close WAV outside lock so pump never blocks on it
        if wf is not None:
            wf.close()
        t_wav_ready_ms = time.time() * 1000

        if audio_path:
            self._ipc.send(Event.AUDIO_RECORDED, audio_path=audio_path)

        timing_ctx = {
            "capture_start_ms":    self._capture_start_ms,
            "capture_end_ms":      t_capture_end_ms,
            "wav_ready_ms":        t_wav_ready_ms,
            "recording_duration_ms": round(t_capture_end_ms - self._capture_start_ms),
            "wav_write_ms":        round(t_wav_ready_ms - t_capture_end_ms),
        }

        self._transcription_active = True
        threading.Thread(
            target=self._fetch_transcription,
            args=(audio_path, timing_ctx),
            daemon=True,
        ).start()

    # ── transcription ─────────────────────────────────────────────────────────

    def _fetch_transcription(
        self, audio_path: str | None = None, timing_ctx: dict | None = None
    ) -> None:
        try:
            if not audio_path or not Path(audio_path).exists():
                return

            if not self._ensure_worker():
                self._ipc.send(Event.ERROR, msg="Transcription worker unavailable")
                return

            assert self._task_q is not None
            assert self._result_q is not None

            t_worker_sent_ms = time.time() * 1000
            self._task_q.put(audio_path)

            deadline = time.monotonic() + _WORKER_TIMEOUT
            while time.monotonic() < deadline:
                try:
                    status, value = self._result_q.get(timeout=2)
                    t_transcription_done_ms = time.time() * 1000
                    if status == "ok":
                        value = self._postprocess_transcript(value)
                        if value:
                            timing: dict = {}
                            if timing_ctx:
                                timing = {
                                    **timing_ctx,
                                    "worker_sent_ms":         round(t_worker_sent_ms),
                                    "transcription_done_ms":  round(t_transcription_done_ms),
                                    "queue_ms":  round(t_worker_sent_ms - timing_ctx.get("wav_ready_ms", t_worker_sent_ms)),
                                    "whisper_ms": round(t_transcription_done_ms - t_worker_sent_ms),
                                }
                            self._ipc.send(
                                Event.SEGMENT_DONE,
                                text=value,
                                audio_path=audio_path,
                                timing=timing,
                            )
                    elif status == "error":
                        self._ipc.send(Event.ERROR, msg=f"Transcription error: {value}")
                    elif status == "ready":
                        continue  # spurious ready from previous respawn
                    return
                except queue.Empty:
                    if not self._worker_proc.is_alive():
                        code = self._worker_proc.exitcode
                        self._worker_proc = None
                        self._ipc.send(
                            Event.ERROR,
                            msg=f"Transcription worker crashed (exit {code}); will respawn",
                        )
                        return

            self._ipc.send(Event.ERROR, msg="Transcription timed out")

        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Transcription error: {e}")
        finally:
            self._transcription_active = False
            self._ipc.send(Event.STATUS, msg="idle")

    # ── hands-free (VAD-segmented, shares the PTT worker) ─────────────────────

    def toggle_handsfree(self) -> None:
        with self._lock:
            self._handsfree = not self._handsfree
            if self._handsfree:
                self._handsfree_queue = queue.Queue(maxsize=_HANDSFREE_QUEUE_MAXLEN)
                threading.Thread(target=self._handsfree_loop, daemon=True).start()
                self._ipc.send(Event.STATUS, msg="handsfree_on")
            else:
                self._handsfree_queue = None
                self._ipc.send(Event.STATUS, msg="handsfree_off")

    def _handsfree_loop(self) -> None:
        """Consume pump audio, segment it with VAD, transcribe each finished
        utterance through the same worker subprocess PTT uses.

        A single 30ms frame passing webrtcvad's classifier is not trusted on
        its own — clicks, hums, and other transients pass it too. Frames only
        get committed to an in-progress utterance once _HANDSFREE_ONSET_FRAMES
        consecutive frames have all classified as speech; anything shorter is
        discarded as noise without ever reaching the worker.
        """
        vad = webrtcvad.Vad(_VAD_AGGRESSIVENESS)
        audio_q = self._handsfree_queue
        frame_buf   = bytearray()
        pending_buf = bytearray()  # tentative onset frames, not yet committed
        speech_buf  = bytearray()  # committed utterance audio
        in_speech   = False
        consecutive_speech = 0
        speech_frames  = 0
        silence_frames = 0

        while self._handsfree and audio_q is not None:
            try:
                chunk = audio_q.get(timeout=0.5)
            except queue.Empty:
                continue
            frame_buf += chunk

            while len(frame_buf) >= _VAD_FRAME_BYTES:
                frame = bytes(frame_buf[:_VAD_FRAME_BYTES])
                del frame_buf[:_VAD_FRAME_BYTES]
                try:
                    is_speech = vad.is_speech(frame, _SAMPLE_RATE)
                except Exception:
                    is_speech = False

                if is_speech:
                    silence_frames = 0
                    if in_speech:
                        speech_buf += frame
                        speech_frames += 1
                    else:
                        pending_buf += frame
                        consecutive_speech += 1
                        if consecutive_speech >= _HANDSFREE_ONSET_FRAMES:
                            # Sustained for long enough — commit the tentative
                            # onset and start recording the utterance for real.
                            in_speech = True
                            speech_buf = bytearray(pending_buf)
                            speech_frames = consecutive_speech
                            pending_buf.clear()
                else:
                    consecutive_speech = 0
                    pending_buf.clear()
                    if in_speech:
                        speech_buf += frame  # trailing silence, natural cutoff
                        silence_frames += 1
                        if silence_frames >= _HANDSFREE_SILENCE_FRAMES:
                            if speech_frames >= _HANDSFREE_MIN_SPEECH_FRAMES:
                                self._transcribe_handsfree_utterance(bytes(speech_buf))
                            in_speech = False
                            speech_buf.clear()
                            speech_frames = 0
                            silence_frames = 0

    def _transcribe_handsfree_utterance(self, pcm: bytes) -> None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        wav_path = _RECORDINGS_DIR / f"handsfree_{ts}.wav"
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(_SAMPLE_WIDTH)
            wf.setframerate(_SAMPLE_RATE)
            wf.writeframes(pcm)

        if self._transcription_active:
            return  # a PTT/handsfree transcription is already in flight
        self._transcription_active = True
        self._fetch_transcription(str(wav_path))

    # ── model/dictionary swap ─────────────────────────────────────────────────

    def set_model(self, model_name: str) -> bool:
        """Request a model switch. Non-blocking: the load runs on a background
        thread (serialized by _model_lock) so the IPC loop stays responsive."""
        from .models import MODEL_CATALOG

        if model_name not in MODEL_CATALOG:
            self._ipc.send(Event.ERROR, msg=f"Unknown model: {model_name}")
            return False

        self._requested_model = model_name  # latest request wins
        threading.Thread(
            target=self._load_requested_model, daemon=True, name="verba-model-load"
        ).start()
        return True

    def _load_requested_model(self) -> None:
        with self._model_lock:
            model_name = self._requested_model
            if model_name is None:
                return

            # Already loaded and alive — confirm and bail, don't kill/restart.
            if (
                model_name == self._loaded_model_name
                and self._worker_proc is not None
                and self._worker_proc.is_alive()
            ):
                self._ipc.send(Event.STATUS, msg=f"model_selected model={model_name}")
                return

            if self._transcription_active:
                self._ipc.send(
                    Event.ERROR,
                    msg=f"Cannot switch models while {self._model_name} is transcribing",
                )
                return

            self._model_name = model_name
            self._stop_worker()
            self._worker_error = None
            try:
                self._ipc.send(Event.STATUS, msg="loading_model")
                self._start_worker()
            except Exception as e:
                self._worker_error = str(e)
                self._ipc.send(Event.ERROR, msg=f"Model switch failed for {model_name}: {e}")
                self._ipc.send(Event.STATUS, msg="idle")
                return

        # Hands-free shares this same worker process, so it automatically
        # picks up the new model on its next utterance — nothing to redo here.
        self._ipc.send(Event.STATUS, msg=f"model_selected model={model_name}")
        self._ipc.send(Event.STATUS, msg="idle")

    def set_dictionary(self, words: list[str]) -> None:
        # Not currently threaded into any runtime adapter's transcribe() call
        # (PTT never used it either) — kept for a future prompt-biasing pass.
        self._initial_prompt = ", ".join(words) if words else ""

    # ── cleanup ──────────────────

    def _stop_worker(self) -> None:
        if self._task_q is not None and self._worker_proc is not None:
            try:
                self._task_q.put(None)
                self._worker_proc.join(timeout=5)
            except Exception:
                pass
            finally:
                if self._worker_proc and self._worker_proc.is_alive():
                    self._worker_proc.terminate()
        self._worker_proc = None
        self._task_q      = None
        self._result_q    = None
        self._loaded_model_name = None

    def shutdown(self) -> None:
        with self._lock:
            self._recording_active = False
            if self._current_wf is not None:
                try:
                    self._current_wf.close()
                except Exception:
                    pass
                self._current_wf = None
            self._handsfree = False
        self._shutdown_event.set()   # stop audio pump
        # Don't deadlock on a load in progress — bounded wait, then force-stop.
        acquired = self._model_lock.acquire(timeout=2)
        try:
            self._stop_worker()
        finally:
            if acquired:
                self._model_lock.release()
