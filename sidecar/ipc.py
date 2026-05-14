"""JSON-lines IPC protocol between Tauri sidecar and Rust host."""
import json
import sys
from enum import Enum
from typing import Any


class Command(str, Enum):
    START_PTT = "start_ptt"
    STOP_PTT = "stop_ptt"
    TOGGLE_HANDSFREE = "toggle_handsfree"
    DETECT_HARDWARE = "detect_hardware"
    SET_MODEL = "set_model"
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
