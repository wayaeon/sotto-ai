"""Wispr Local STT sidecar — entry point and IPC loop."""
from __future__ import annotations

import sys
from sidecar.ipc import IPC, Command, Event
from sidecar.hardware import detect as detect_hardware
from sidecar.recorder import Recorder
from sidecar.models import download_model_async


def main() -> None:
    ipc = IPC()
    ipc.send(Event.READY)

    hw = None
    recorder = None

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        cmd, payload = ipc.parse_full(line)
        if cmd is None:
            ipc.send(Event.ERROR, msg=f"Unknown command: {line!r}")
            continue

        if cmd == Command.PING:
            ipc.send(Event.PONG)

        elif cmd == Command.DETECT_HARDWARE:
            hw = detect_hardware()
            ipc.send(Event.HARDWARE, **hw.to_dict())
            if recorder is None:
                recorder = Recorder(ipc=ipc, tier=hw.tier)

        elif cmd == Command.DOWNLOAD_MODEL:
            if hw is not None:
                download_model_async(hw.model_name, ipc)
            else:
                ipc.send(Event.ERROR, msg="detect_hardware must be called before download_model")

        elif cmd == Command.SET_MODEL:
            model_name = payload.get("model", "")
            if model_name and recorder is not None:
                recorder.set_model(model_name)
            elif not model_name:
                ipc.send(Event.ERROR, msg="set_model requires a 'model' field")

        elif cmd == Command.SET_DICTIONARY:
            words = payload.get("words", [])
            if recorder is not None:
                recorder.set_dictionary(words)

        elif cmd == Command.START_PTT:
            if recorder is not None:
                recorder.start_ptt()
            else:
                ipc.send(Event.ERROR, msg="Hardware not detected yet — send detect_hardware first")

        elif cmd == Command.STOP_PTT:
            if recorder is not None:
                recorder.stop_ptt()

        elif cmd == Command.TOGGLE_HANDSFREE:
            if recorder is not None:
                recorder.toggle_handsfree()

        elif cmd == Command.QUIT:
            if recorder is not None:
                recorder.shutdown()
            break


if __name__ == "__main__":
    main()
