"""Push-to-talk and hands-free recording modes.

Architecture for PTT:
  - Always-on audio pump keeps the mic stream open permanently.
    start_ptt() is instant: just opens a WAV file and flips a flag.
    No thread spawn, no stream init on the hot path.
  - A long-lived _TranscriptionWorker subprocess holds faster-whisper in
    memory. Audio paths are sent to it via a multiprocessing Queue.
  - If the worker crashes (ctranslate2 SIGSEGV) the sidecar stays alive
    and respawns the worker on the next PTT.
  - AudioToTextRecorder is used only for hands-free mode.
"""
from __future__ import annotations

import multiprocessing
import queue
import struct
import threading
import time
import wave
from datetime import datetime
from pathlib import Path
from .ipc import IPC, Event
from .hardware import ModelTier
from .models import tier_to_model, model_dir

_RECORDINGS_DIR  = Path.home() / ".verba" / "recordings"
_SAMPLE_RATE     = 16000
_SAMPLE_WIDTH    = 2       # 16-bit PCM
_CHUNK_SIZE      = 1024
_WORKER_TIMEOUT  = 120     # seconds to wait for transcription result
_WORKER_INIT_S   = 120     # seconds to wait for model load (GPU can take ~30 s)
_LEVEL_INTERVAL_S = 0.05

try:
    import torch
    torch.hub._check_repo_is_trusted = lambda *args, **kwargs: None  # noqa
except Exception:
    pass


# ── Module-level worker loop ─────────────────────────────────────────────────

def _worker_loop(model_path: str, task_q, result_q) -> None:  # type: ignore[type-arg]
    """Long-lived subprocess: loads faster-whisper once, transcribes on demand."""
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
        audio_path = task_q.get()
        if audio_path is None:
            return
        try:
            segments, _ = model.transcribe(
                str(audio_path),
                language=None,
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            text = " ".join(s.text for s in segments).strip()
            result_q.put(("ok", text))
        except Exception as exc:  # noqa: BLE001
            result_q.put(("error", str(exc)))


def _pcm16_level(data: bytes) -> float:
    """Return normalized RMS level for little-endian signed 16-bit PCM."""
    sample_bytes = len(data) - (len(data) % 2)
    if sample_bytes <= 0:
        return 0.0

    total = 0
    count = sample_bytes // 2
    for (sample,) in struct.iter_unpack("<h", data[:sample_bytes]):
        total += sample * sample

    rms = (total / count) ** 0.5
    return min(1.0, rms / 32768.0)


class Recorder:
    def __init__(self, ipc: IPC, tier: ModelTier) -> None:
        self._ipc        = ipc
        self._tier       = tier
        self._model_name = tier_to_model(tier)
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
        self._last_level_sent_s: float = 0.0

        # ── transcription worker subprocess ───────────────────────────────────
        self._worker_proc:  multiprocessing.Process | None = None
        self._task_q:       multiprocessing.Queue | None = None
        self._result_q:     multiprocessing.Queue | None = None

        # ── hands-free (AudioToTextRecorder) ─────────────────────────────────
        self._recorder  = None
        self._handsfree = False

        _RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        threading.Thread(target=self._preload, daemon=True).start()

    # ── preload ───────────────────────────────────────────────────────────────

    def _preload(self) -> None:
        """Start always-on pump → load model worker → signal ready."""
        try:
            self._ipc.send(Event.STATUS, msg="loading_model")

            # Start always-on audio pump — keeps mic stream open permanently
            self._pump_thread = threading.Thread(
                target=self._audio_pump, daemon=True
            )
            self._pump_thread.start()
            # Wait for mic device to open (usually <500 ms)
            if not self._pump_ready.wait(timeout=8.0):
                self._ipc.send(Event.ERROR, msg="Audio device did not open within 8 s")

            self._start_worker()
            self._ipc.send(Event.STATUS, msg="idle")
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Preload failed: {e}")
            self._ipc.send(Event.STATUS, msg="idle")

    # ── always-on audio pump ──────────────────────────────────────────────────

    def _audio_pump(self) -> None:
        """Continuously read from mic. Keeps stream warm.
        When _recording_active, writes chunks directly into the open WAV file.
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
            if wf is not None:
                try:
                    wf.writeframes(data)
                except Exception:
                    pass
                now = time.monotonic()
                if now - self._last_level_sent_s >= _LEVEL_INTERVAL_S:
                    self._last_level_sent_s = now
                    self._ipc.send(Event.AUDIO_LEVEL, level=round(_pcm16_level(data), 4))

        stream.stop_stream()
        stream.close()
        pa.terminate()

    # ── model loading ─────────────────────────────────────────────────────────

    def _get_model_path(self) -> str:
        d = model_dir(self._model_name)
        return str(d) if d.exists() else self._model_name

    def _ensure_model_downloaded(self) -> None:
        from .models import is_downloaded, _download_model
        if not is_downloaded(self._model_name):
            self._ipc.send(Event.STATUS, msg="loading_model")
            _download_model(self._model_name, self._ipc)

    def _start_worker(self) -> None:
        self._ensure_model_downloaded()
        model_path = self._get_model_path()

        ctx = multiprocessing.get_context("spawn")
        self._task_q   = ctx.Queue()
        self._result_q = ctx.Queue()
        self._worker_proc = ctx.Process(
            target=_worker_loop,
            args=(model_path, self._task_q, self._result_q),
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
                    self._ipc.send(
                        Event.STATUS,
                        msg=f"worker_ready device={device} compute={compute}",
                    )
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
        if self._worker_proc is not None and self._worker_proc.is_alive():
            return True
        try:
            self._ipc.send(Event.STATUS, msg="loading_model")
            self._start_worker()
            self._ipc.send(Event.STATUS, msg="idle")
            return True
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Worker respawn failed: {e}")
            return False

    # ── hands-free (AudioToTextRecorder) ─────────────────────────────────────

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
                use_microphone=True,
            )
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Failed to load model '{model_path}': {e}")
            raise
        return recorder

    # ── PTT ───────────────────────────────────────────────────────────────────

    def start_ptt(self) -> None:
        """Instant PTT start — pump is already running, just open WAV and flip flag."""
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
        self._ipc.send(Event.AUDIO_LEVEL, level=0.0)

        timing_ctx = {
            "capture_start_ms":    self._capture_start_ms,
            "capture_end_ms":      t_capture_end_ms,
            "wav_ready_ms":        t_wav_ready_ms,
            "recording_duration_ms": round(t_capture_end_ms - self._capture_start_ms),
            "wav_write_ms":        round(t_wav_ready_ms - t_capture_end_ms),
        }

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
            self._ipc.send(Event.STATUS, msg="idle")

    # ── hands-free ────────────────────────────────────────────────────────────

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
            time.sleep(0.01)  # prevent busy-wait

    # ── model/dictionary swap ─────────────────────────────────────────────────

    def set_model(self, model_name: str) -> None:
        with self._lock:
            self._model_name = model_name
            was_handsfree = self._handsfree
            self._handsfree = False
            old_recorder = self._recorder
            self._recorder = None
            self._stop_worker()

        # Blocking I/O outside lock — start new worker and recorder
        try:
            self._start_worker()
            if old_recorder is not None:
                try:
                    old_recorder.shutdown()
                except Exception:
                    pass
                new_recorder = self._make_recorder()
            else:
                new_recorder = None
        except Exception as e:
            with self._lock:
                self._recorder = old_recorder
                self._handsfree = was_handsfree
            raise

        # Re-acquire lock to install new recorder and restore handsfree if needed
        with self._lock:
            self._recorder = new_recorder
            if was_handsfree and self._recorder is not None:
                self._handsfree = True
                threading.Thread(target=self._handsfree_loop, daemon=True).start()

    def set_dictionary(self, words: list[str]) -> None:
        self._initial_prompt = ", ".join(words) if words else ""
        with self._lock:
            if self._recorder is None:
                return
            was_handsfree = self._handsfree
            self._handsfree = False
            old_recorder = self._recorder
            self._recorder = None

        # Blocking I/O outside lock
        try:
            old_recorder.shutdown()
            new_recorder = self._make_recorder()
        except Exception:
            with self._lock:
                self._recorder = old_recorder
                self._handsfree = was_handsfree
            raise

        # Re-acquire lock to install and restore state
        with self._lock:
            self._recorder = new_recorder
            if was_handsfree:
                self._handsfree = True
                threading.Thread(target=self._handsfree_loop, daemon=True).start()

    # ── cleanup ───────────────────────────────────────────────────────────────

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
        self._stop_worker()
        if self._recorder is not None:
            self._recorder.shutdown()
            self._recorder = None
