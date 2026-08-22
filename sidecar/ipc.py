"""JSON-lines IPC protocol between Tauri sidecar and Rust host."""
import json
import sys
from enum import Enum
from typing import Any


class Command(str, Enum):
    START_PTT = "start_ptt"
    STOP_PTT = "stop_ptt"
    TOGGLE_HANDSFREE = "toggle_handsfree"
    SET_WAKE_PHRASE_ENABLED = "set_wake_phrase_enabled"
    DETECT_HARDWARE = "detect_hardware"
    DOWNLOAD_MODEL = "download_model"
    PAUSE_DOWNLOAD_MODEL = "pause_download_model"
    SET_MODEL = "set_model"
    RETRY_WORKER = "retry_worker"
    BENCHMARK_MODEL = "benchmark_model"
    SET_DICTIONARY = "set_dictionary"
    SET_FILLER_CONFIG = "set_filler_config"
    CHECK_DOWNLOADS = "check_downloads"
    PING = "ping"
    QUIT = "quit"


class Event(str, Enum):
    READY = "ready"
    WORD = "word"
    SEGMENT_DONE = "segment_done"
    ERROR = "error"
    PONG = "pong"
    STATUS = "status"
    HARDWARE = "hardware"
    DOWNLOAD_PROGRESS = "download_progress"
    DOWNLOADS_STATE = "downloads_state"
    BENCHMARK_RESULT = "benchmark_result"
    AUDIO_RECORDED = "audio_recorded"
    AUDIO_LEVEL = "audio_level"


class IPC:
    def send(self, event: Event, **data: Any) -> None:
        msg = {"event": event.value, **data}
        print(json.dumps(msg), flush=True)

    def parse(self, line: str) -> Command | None:
        try:
            obj = json.loads(line.strip())
            cmd_str = obj.get("cmd", "")
            return Command(cmd_str)
        except (json.JSONDecodeError, ValueError):
            return None

    def parse_full(self, line: str) -> tuple[Command | None, dict]:
        try:
            obj = json.loads(line.strip())
            cmd_str = obj.get("cmd", "")
            return Command(cmd_str), obj
        except (json.JSONDecodeError, ValueError):
            return None, {}
