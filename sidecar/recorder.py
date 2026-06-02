"""Push-to-talk and hands-free recording modes.

Architecture for PTT:
  - A long-lived _TranscriptionWorker subprocess holds faster-whisper in
    memory.  Audio paths are sent to it via a multiprocessing Queue; results
    come back the same way.
  - If the worker crashes (ctranslate2 SIGSEGV / abort) the sidecar process
    stays alive, logs an error, and respawns the worker on the next PTT.
  - AudioToTextRecorder is no longer used for PTT; it is kept only for the
    hands-free mode.
"""
from __future__ import annotations

import multiprocessing
import queue
import threading
import time
import wave
from datetime import datetime
from pathlib import Path
from .ipc import IPC, Event
from .hardware import ModelTier
from .models import tier_to_model, model_dir

_RECORDINGS_DIR = Path.home() / ".sotto" / "recordings"
_SAMPLE_RATE = 16000
_SAMPLE_WIDTH = 2   # 16-bit PCM
_CHUNK_SIZE   = 1024
_WORKER_TIMEOUT  = 120  # seconds to wait for transcription result
_WORKER_INIT_S   = 120  # seconds to wait for model load on GPU (large models take ~30s)

# torch.hub prompts for repo trust via stdin — which we use for IPC.
try:
    import torch
    torch.hub._check_repo_is_trusted = lambda *args, **kwargs: None  # noqa
except Exception:
    pass


# ── Module-level worker loop ─────────────────────────────────────────────────
# Must be at module level so multiprocessing spawn can import it in the
# frozen PyInstaller binary without re-running __main__.

def _worker_loop(model_path: str, task_q, result_q) -> None:  # type: ignore[type-arg]
    """Long-lived subprocess: loads faster-whisper once, transcribes on demand.

    Listens on task_q for audio-file paths (str) or None (shutdown sentinel).
    Puts (status, value) tuples on result_q:
        ("ready", info_dict)  — model loaded, ready to accept tasks
        ("ok",    text)       — successful transcription
        ("error", message)    — Python exception during transcription
    A hard crash (SIGSEGV / abort) produces no result; the parent detects it
    via p.is_alive() / p.exitcode.
    """
    try:
        from faster_whisper import WhisperModel
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model = WhisperModel(model_path, device=device, compute_type=compute_type)
        result_q.put(("ready", {"device": device, "compute_type": compute_type}))
    except Exception as exc:  # noqa: BLE001
        result_q.put(("error", f"Worker init failed: {exc}"))
        return

    while True:
        audio_path = task_q.get()          # blocks until a path arrives
        if audio_path is None:             # shutdown sentinel
            return
        try:
            segments, _ = model.transcribe(str(audio_path), language=None)
            text = " ".join(s.text for s in segments).strip()
            result_q.put(("ok", text))
        except Exception as exc:           # noqa: BLE001
            result_q.put(("error", str(exc)))


class Recorder:
    def __init__(self, ipc: IPC, tier: ModelTier) -> None:
        self._ipc = ipc
        self._tier = tier
        self._model_name = tier_to_model(tier)
        self._initial_prompt = ""

        # PTT state
        self._recording_active = False
        self._ptt_stop = threading.Event()
        self._last_wav_path: str | None = None
        self._capture_thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._capture_start_ms: float = 0.0

        # Persistent transcription worker subprocess
        self._worker_proc: multiprocessing.Process | None = None
        self._task_q: multiprocessing.Queue | None = None
        self._result_q: multiprocessing.Queue | None = None

        # Hands-free mode (AudioToTextRecorder)
        self._recorder = None
        self._handsfree = False

        # Pre-warmed PyAudio stream
        self._pa = None
        self._pa_stream = None

        _RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        threading.Thread(target=self._preload, daemon=True).start()

    # ── model loading ────────────────────────────────────────────────────────

    def _preload(self) -> None:
        """Warm audio device + spawn transcription worker; emit loading_model → idle."""
        try:
            self._ipc.send(Event.STATUS, msg="loading_model")
            self._warm_audio_stream()
            self._start_worker()          # blocks until worker signals "ready"
            self._ipc.send(Event.STATUS, msg="idle")
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Preload failed: {e}")
            self._ipc.send(Event.STATUS, msg="idle")

    def _warm_audio_stream(self) -> None:
        try:
            import pyaudio
            if self._pa is None:
                self._pa = pyaudio.PyAudio()
            if self._pa_stream is None or not self._pa_stream.is_active():
                self._pa_stream = self._pa.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=_SAMPLE_RATE,
                    input=True,
                    frames_per_buffer=_CHUNK_SIZE,
                )
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Audio pre-warm failed: {e}")
            self._pa = None
            self._pa_stream = None

    def _get_model_path(self) -> str:
        d = model_dir(self._model_name)
        return str(d) if d.exists() else self._model_name

    def _ensure_model_downloaded(self) -> None:
        from .models import is_downloaded, _download_model
        if not is_downloaded(self._model_name):
            self._ipc.send(Event.STATUS, msg="loading_model")
            _download_model(self._model_name, self._ipc)

    def _start_worker(self) -> None:
        """Spawn the transcription worker subprocess and wait for it to be ready."""
        self._ensure_model_downloaded()
        model_path = self._get_model_path()

        ctx = multiprocessing.get_context("spawn")
        self._task_q = ctx.Queue()
        self._result_q = ctx.Queue()
        self._worker_proc = ctx.Process(
            target=_worker_loop,
            args=(model_path, self._task_q, self._result_q),
            daemon=False,
            name="sotto-transcriber",
        )
        self._worker_proc.start()

        # Wait for the worker to finish loading the model (up to 120 s)
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            try:
                status, msg = self._result_q.get(timeout=2)
                if status == "ready":
                    info = msg if isinstance(msg, dict) else {}
                    device = info.get("device", "cpu")
                    compute = info.get("compute_type", "int8")
                    self._ipc.send(Event.STATUS, msg=f"worker_ready device={device} compute={compute}")
                    return
                elif status == "error":
                    raise RuntimeError(msg)
            except queue.Empty:
                if not self._worker_proc.is_alive():
                    raise RuntimeError(
                        f"Worker exited during init (code {self._worker_proc.exitcode})"
                    )
        raise RuntimeError("Worker did not become ready within 120 s")

    def _ensure_worker(self) -> bool:
        """Return True if the worker is alive, respawning it if it crashed."""
        if self._worker_proc is not None and self._worker_proc.is_alive():
            return True
        # Worker is dead — try to respawn
        try:
            self._ipc.send(Event.STATUS, msg="loading_model")
            self._start_worker()
            self._ipc.send(Event.STATUS, msg="idle")
            return True
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Worker respawn failed: {e}")
            return False

    # ── AudioToTextRecorder (hands-free only) ────────────────────────────────

    def _make_recorder(self, silent: bool = False):
        from RealtimeSTT import AudioToTextRecorder
        self._ensure_model_downloaded()
        model_path = self._get_model_path()
        if not silent:
            self._ipc.send(Event.STATUS, msg="loading_model")
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        try:
            recorder = AudioToTextRecorder(
                model=model_path,
                language="",
                device=device,
                compute_type=compute_type,
                silero_sensitivity=0.4,
                post_speech_silence_duration=0.5,
                min_gap_between_recordings=0,
                enable_realtime_transcription=False,
                initial_prompt=self._initial_prompt or None,
                use_microphone=True,  # hands-free uses the mic directly
            )
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Failed to load model '{model_path}': {e}")
            raise
        return recorder

    # ── audio capture ────────────────────────────────────────────────────────

    def _ptt_capture(self) -> None:
        """Capture 16-bit 16 kHz mono while PTT is held, writing directly to WAV."""
        self._last_wav_path = None
        try:
            stream = self._pa_stream
            if stream is None or not stream.is_active():
                import pyaudio
                if self._pa is None:
                    self._pa = pyaudio.PyAudio()
                stream = self._pa.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=_SAMPLE_RATE,
                    input=True,
                    frames_per_buffer=_CHUNK_SIZE,
                )
                self._pa_stream = stream

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            wav_path = _RECORDINGS_DIR / f"{ts}.wav"
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(_SAMPLE_WIDTH)
                wf.setframerate(_SAMPLE_RATE)
                while not self._ptt_stop.is_set():
                    data = stream.read(_CHUNK_SIZE, exception_on_overflow=False)
                    wf.writeframes(data)
            self._last_wav_path = str(wav_path)
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"PTT capture error: {type(e).__name__}: {e}")

    # ── transcription ────────────────────────────────────────────────────────

    def _fetch_transcription(self, audio_path: str | None = None, timing_ctx: dict | None = None) -> None:
        """Send audio_path to the persistent worker; collect the result.

        If the worker is dead, respawn it.  If ctranslate2 crashes mid-call
        (worker exits with non-zero code) the sidecar stays alive.
        """
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

            # Poll for result, checking worker liveness every 2 s
            deadline = time.monotonic() + _WORKER_TIMEOUT
            while time.monotonic() < deadline:
                try:
                    status, value = self._result_q.get(timeout=2)
                    t_transcription_done_ms = time.time() * 1000
                    if status == "ok":
                        if value:
                            timing: dict = {}
                            if timing_ctx:
                                timing = {
                                    **timing_ctx,
                                    "worker_sent_ms": round(t_worker_sent_ms),
                                    "transcription_done_ms": round(t_transcription_done_ms),
                                    "queue_ms": round(t_worker_sent_ms - timing_ctx.get("wav_ready_ms", t_worker_sent_ms)),
                                    "whisper_ms": round(t_transcription_done_ms - t_worker_sent_ms),
                                }
                            self._ipc.send(
                                Event.SEGMENT_DONE, text=value, audio_path=audio_path, timing=timing
                            )
                    elif status == "error":
                        self._ipc.send(Event.ERROR, msg=f"Transcription error: {value}")
                    elif status == "ready":
                        # Spurious ready from a previous respawn — ignore, keep waiting
                        continue
                    return
                except queue.Empty:
                    # Check worker is still alive
                    if not self._worker_proc.is_alive():
                        code = self._worker_proc.exitcode
                        self._worker_proc = None
                        self._ipc.send(
                            Event.ERROR,
                            msg=f"Transcription worker crashed (exit {code}); will respawn on next PTT",
                        )
                        return

            self._ipc.send(Event.ERROR, msg="Transcription timed out")

        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Transcription error: {e}")
        finally:
            self._ipc.send(Event.STATUS, msg="idle")

    # ── PTT ──────────────────────────────────────────────────────────────────

    def start_ptt(self) -> None:
        with self._lock:
            self._capture_start_ms = time.time() * 1000
            self._last_wav_path = None
            self._ptt_stop.clear()
            self._capture_thread = threading.Thread(target=self._ptt_capture, daemon=True)
            self._recording_active = True
        self._capture_thread.start()
        self._ipc.send(Event.STATUS, msg="recording_ptt")

    def stop_ptt(self) -> None:
        with self._lock:
            if not self._recording_active:
                self._ipc.send(Event.STATUS, msg="idle")
                return
            t_capture_end_ms = time.time() * 1000
            self._ptt_stop.set()
            self._recording_active = False
            capture_thread = self._capture_thread
            self._ipc.send(Event.STATUS, msg="processing")

        if capture_thread is not None:
            capture_thread.join(timeout=5)

        t_wav_ready_ms = time.time() * 1000

        audio_path = self._last_wav_path
        if audio_path:
            self._ipc.send(Event.AUDIO_RECORDED, audio_path=audio_path)

        timing_ctx = {
            "capture_start_ms": self._capture_start_ms,
            "capture_end_ms": t_capture_end_ms,
            "wav_ready_ms": t_wav_ready_ms,
            "recording_duration_ms": round(t_capture_end_ms - self._capture_start_ms),
            "wav_write_ms": round(t_wav_ready_ms - t_capture_end_ms),
        }

        threading.Thread(
            target=self._fetch_transcription, args=(audio_path, timing_ctx), daemon=True
        ).start()

    # ── hands-free ───────────────────────────────────────────────────────────

    def toggle_handsfree(self) -> None:
        with self._lock:
            self._handsfree = not self._handsfree
            if self._handsfree:
                if self._recorder is None:
                    self._recorder = self._make_recorder()
                threading.Thread(target=self._handsfree_loop, daemon=True).start()
                self._ipc.send(Event.STATUS, msg="handsfree_on")
            else:
                if self._recorder is not None:
                    self._recorder.stop()
                self._ipc.send(Event.STATUS, msg="handsfree_off")

    def _handsfree_loop(self) -> None:
        while self._handsfree and self._recorder is not None:
            text = self._recorder.text()
            if text and text.strip():
                self._ipc.send(Event.SEGMENT_DONE, text=text.strip())

    # ── model/dictionary swap ─────────────────────────────────────────────────

    def set_model(self, model_name: str) -> None:
        with self._lock:
            self._model_name = model_name
            # Restart worker with new model
            self._stop_worker()
            self._start_worker()
            # Restart hands-free recorder if active
            if self._recorder is not None:
                was_handsfree = self._handsfree
                self._handsfree = False
                self._recorder.shutdown()
                self._recorder = None
                self._recorder = self._make_recorder()
                if was_handsfree:
                    self._handsfree = True
                    threading.Thread(target=self._handsfree_loop, daemon=True).start()

    def set_dictionary(self, words: list[str]) -> None:
        self._initial_prompt = ", ".join(words) if words else ""
        # Dictionary is passed as initial_prompt; only affects hands-free recorder
        with self._lock:
            if self._recorder is not None:
                was_handsfree = self._handsfree
                self._handsfree = False
                self._recorder.shutdown()
                self._recorder = None
                self._recorder = self._make_recorder()
                if was_handsfree:
                    self._handsfree = True
                    threading.Thread(target=self._handsfree_loop, daemon=True).start()

    # ── cleanup ───────────────────────────────────────────────────────────────

    def _stop_worker(self) -> None:
        if self._task_q is not None and self._worker_proc is not None:
            try:
                self._task_q.put(None)          # sentinel → graceful shutdown
                self._worker_proc.join(timeout=5)
            except Exception:
                pass
            finally:
                if self._worker_proc.is_alive():
                    self._worker_proc.terminate()
        self._worker_proc = None
        self._task_q = None
        self._result_q = None

    def shutdown(self) -> None:
        with self._lock:
            self._ptt_stop.set()
            self._handsfree = False
            self._stop_worker()
            if self._recorder is not None:
                self._recorder.shutdown()
                self._recorder = None
            if self._pa_stream is not None:
                try:
                    self._pa_stream.stop_stream()
                    self._pa_stream.close()
                except Exception:
                    pass
                self._pa_stream = None
            if self._pa is not None:
                try:
                    self._pa.terminate()
                except Exception:
                    pass
                self._pa = None
