"""RealtimeSTT wrapper — push-to-talk and hands-free recording modes."""
from __future__ import annotations

import threading
from typing import Callable

from .ipc import IPC, Event
from .hardware import ModelTier
from .models import tier_to_model, model_dir


class Recorder:
    def __init__(self, ipc: IPC, tier: ModelTier) -> None:
        self._ipc = ipc
        self._tier = tier
        self._model_name = tier_to_model(tier)
        self._recorder = None
        self._handsfree = False
        self._lock = threading.Lock()
        self._initial_prompt = ""

    def _get_model_path(self) -> str:
        d = model_dir(self._model_name)
        return str(d) if d.exists() else self._model_name

    def _make_recorder(self):
        from RealtimeSTT import AudioToTextRecorder
        model_path = self._get_model_path()

        def on_realtime_text(text: str) -> None:
            self._ipc.send(Event.WORD, text=text, partial=True)

        def on_full_sentence(text: str) -> None:
            self._ipc.send(Event.SEGMENT_DONE, text=text)

        recorder = AudioToTextRecorder(
            model=model_path,
            language="",
            realtime_processing_pause=0.1,
            on_realtime_transcript_update=on_realtime_text,
            silero_sensitivity=0.4,
            post_speech_silence_duration=0.5,
            min_gap_between_recordings=0,
            enable_realtime_transcription=True,
            initial_prompt=self._initial_prompt or None,
        )
        recorder.on_transcription_start = lambda: self._ipc.send(
            Event.STATUS, msg="recording"
        )
        return recorder

    def start_ptt(self) -> None:
        with self._lock:
            if self._recorder is None:
                self._ipc.send(Event.STATUS, msg="loading_model")
                self._recorder = self._make_recorder()
            self._recorder.start()
            self._ipc.send(Event.STATUS, msg="recording")

    def stop_ptt(self) -> None:
        with self._lock:
            if self._recorder is not None:
                self._recorder.stop()
                self._ipc.send(Event.STATUS, msg="processing")

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
        # .text() blocks until a full sentence is detected, then returns.
        # on_full_sentence (registered in _make_recorder) handles SEGMENT_DONE;
        # passing a second callback here would double-send.
        while self._handsfree and self._recorder is not None:
            self._recorder.text()

    def set_model(self, model_name: str) -> None:
        """Hot-swap the Whisper model. Shuts down the current recorder and re-creates it."""
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
        """Update the Whisper initial_prompt with user dictionary words."""
        self._initial_prompt = ", ".join(words) if words else ""
        # If recorder is running, recreate it so the new prompt takes effect.
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
            self._handsfree = False
            if self._recorder is not None:
                self._recorder.shutdown()
                self._recorder = None
