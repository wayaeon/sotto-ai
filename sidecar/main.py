"""Verba STT sidecar — entry point and IPC loop."""
from __future__ import annotations

import sys
from sidecar.ipc import IPC, Command, Event
from sidecar.hardware import detect as detect_hardware
from sidecar.recorder import Recorder
from sidecar.models import benchmark_model_async, MODEL_CATALOG


def main() -> None:
    ipc = IPC()

    # Detect hardware and create recorder immediately — no IPC handshake needed
    hw = detect_hardware()
    ipc.send(Event.HARDWARE, **hw.to_dict())
    recorder = Recorder(ipc=ipc, hw=hw)

    ipc.send(Event.READY)

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
            # Re-send cached result — hardware doesn't change at runtime
            ipc.send(Event.HARDWARE, **hw.to_dict())

        elif cmd == Command.SET_MODEL:
            model_name = payload.get("model", "")
            if model_name and recorder is not None:
                try:
                    recorder.set_model(model_name)
                except Exception as exc:
                    ipc.send(Event.ERROR, msg=f"Model switch failed for {model_name}: {exc}")
                    ipc.send(Event.STATUS, msg="idle")
            elif not model_name:
                ipc.send(Event.ERROR, msg="set_model requires a 'model' field")

        elif cmd == Command.BENCHMARK_MODEL:
            model_name = payload.get("model", "")
            audio_path = payload.get("audio_path") or payload.get("audioPath") or ""
            if not model_name:
                ipc.send(Event.ERROR, msg="benchmark_model requires a 'model' field")
            elif not audio_path:
                ipc.send(Event.ERROR, msg="Record audio before running a benchmark")
            else:
                benchmark_model_async(model_name, audio_path, ipc)

        elif cmd == Command.SET_DICTIONARY:
            words = payload.get("words", [])
            if recorder is not None:
                recorder.set_dictionary(words)

        elif cmd == Command.START_PTT:
            recorder.start_ptt()

        elif cmd == Command.STOP_PTT:
            recorder.stop_ptt()

        elif cmd == Command.TOGGLE_HANDSFREE:
            recorder.toggle_handsfree()

        elif cmd == Command.QUIT:
            recorder.shutdown()
            break

    # Rust closes stdin when the app exits or replaces the sidecar. Ensure the
    # loaded model worker does not survive that parent connection.
    recorder.shutdown()


if __name__ == "__main__":
    # REQUIRED for PyInstaller + torch.multiprocessing.
    # Without this, frozen-binary spawn workers re-run main() instead of their
    # actual worker function, causing infinite hardware/ready event loops and
    # preventing AudioToTextRecorder from ever initialising correctly.
    import multiprocessing
    multiprocessing.freeze_support()
    multiprocessing.set_start_method("spawn", force=True)
    main()
