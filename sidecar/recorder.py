"""RealtimeSTT wrapper — push-to-talk and hands-free recording modes."""
from __future__ import annotations

import threading
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

# torch.hub prompts for repo trust via stdin — which we use for IPC.
# Pre-silence the check so it never reads from stdin and crashes the sidecar.
try:
    import torch
    torch.hub._check_repo_is_trusted = lambda *args, **kwargs: None  # noqa
except Exception:
    pass


class Recorder:
    def __init__(self, ipc: IPC, tier: ModelTier) -> None:
        self._ipc = ipc
        self._tier = tier
        self._model_name = tier_to_model(tier)
        self._recorder = None
        self._handsfree = False
        self._lock = threading.Lock()
        self._initial_prompt = ""
        self._recording_active = False  # True only between start_ptt() and stop_ptt()
        self._ptt_stop = threading.Event()
        self._last_wav_path: str | None = None
        self._capture_thread: threading.Thread | None = None
        # Pre-warmed PyAudio stream — kept alive between PTT sessions to eliminate
        # the 1-2s device-open latency on Windows.
        self._pa = None
        self._pa_stream = None
        _RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        threading.Thread(target=self._preload, daemon=True).start()

    # ── model loading ────────────────────────────────────────────────────────

    def _preload(self) -> None:
        """Load model at startup; emits loading_model → idle."""
        try:
            self._ipc.send(Event.STATUS, msg="loading_model")
            with self._lock:
                if self._recorder is None:
                    self._recorder = self._make_recorder(silent=True)
            # Pre-warm the PyAudio stream so the first PTT starts instantly
            self._warm_audio_stream()
            self._ipc.send(Event.STATUS, msg="idle")
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Model preload failed: {e}")
            self._ipc.send(Event.STATUS, msg="idle")

    def _warm_audio_stream(self) -> None:
        """Open (and keep open) the PyAudio input stream to eliminate first-PTT latency."""
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

    def _make_recorder(self, silent: bool = False):
        from RealtimeSTT import AudioToTextRecorder
        self._ensure_model_downloaded()
        model_path = self._get_model_path()
        if not silent:
            self._ipc.send(Event.STATUS, msg="loading_model")
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
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
                # Disable the built-in microphone — we feed audio ourselves
                use_microphone=False,
            )
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Failed to load model '{model_path}': {e}")
            raise
        recorder.on_transcription_start = lambda *args, **kwargs: self._ipc.send(
            Event.STATUS, msg="recording"
        )
        return recorder

    # ── audio capture ────────────────────────────────────────────────────────

    def _ptt_capture(self) -> None:
        """Open PyAudio, capture 16-bit 16 kHz mono while PTT held.

        Writes directly to disk as we go (streaming write) to avoid race
        conditions with the in-memory frame list.  Also feeds each chunk
        into RealtimeSTT for transcription.
        """
        self._last_wav_path = None
        try:
            # Reuse the pre-warmed stream; fall back to opening a new one if needed
            stream = self._pa_stream
            owned = False
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
                owned = True  # we created it, but keep it alive for next PTT

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            wav_path = _RECORDINGS_DIR / f"{ts}.wav"
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(_SAMPLE_WIDTH)
                wf.setframerate(_SAMPLE_RATE)
                while not self._ptt_stop.is_set():
                    data = stream.read(_CHUNK_SIZE, exception_on_overflow=False)
                    wf.writeframes(data)
                    if self._recorder is not None:
                        self._recorder.feed_audio(data)
            self._last_wav_path = str(wav_path)
            # Do NOT close the stream — keep it warm for next PTT
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"PTT capture error: {type(e).__name__}: {e}")

    # _save_frames removed — streaming write in _ptt_capture handles WAV I/O

    # ── transcription ────────────────────────────────────────────────────────

    def _fetch_transcription(self, audio_path: str | None = None) -> None:
        """Blocks until whisper finishes, then sends SEGMENT_DONE."""
        try:
            if self._recorder is None:
                return
            text = self._recorder.text()
            if text and text.strip():
                payload: dict = {"text": text.strip()}
                if audio_path:
                    payload["audio_path"] = audio_path
                self._ipc.send(Event.SEGMENT_DONE, **payload)
        except Exception as e:
            self._ipc.send(Event.ERROR, msg=f"Transcription error: {e}")
        finally:
            self._ipc.send(Event.STATUS, msg="idle")

    # ── PTT ──────────────────────────────────────────────────────────────────

    def start_ptt(self) -> None:
        with self._lock:
            if self._recorder is None:
                self._recorder = self._make_recorder()
            # Reset capture state
            self._last_wav_path = None
            self._ptt_stop.clear()
            self._capture_thread = threading.Thread(target=self._ptt_capture, daemon=True)
            self._recorder.start()
            self._recording_active = True
        # Start audio capture thread outside lock to avoid deadlock
        self._capture_thread.start()
        self._ipc.send(Event.STATUS, msg="recording_ptt")

    def stop_ptt(self) -> None:
        with self._lock:
            if self._recorder is None or not self._recording_active:
                self._ipc.send(Event.STATUS, msg="idle")
                return
            # Signal capture thread to stop and wait for WAV to be flushed
            self._ptt_stop.set()
            self._recording_active = False
            capture_thread = getattr(self, "_capture_thread", None)
            self._recorder.stop()
            self._ipc.send(Event.STATUS, msg="processing")
        # Wait for the capture thread to finish writing the WAV file
        if capture_thread is not None:
            capture_thread.join(timeout=5)
        audio_path = self._last_wav_path
        if audio_path:
            self._ipc.send(Event.AUDIO_RECORDED, audio_path=audio_path)
        threading.Thread(
            target=self._fetch_transcription, args=(audio_path,), daemon=True
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

    def shutdown(self) -> None:
        with self._lock:
            self._ptt_stop.set()
            self._handsfree = False
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
