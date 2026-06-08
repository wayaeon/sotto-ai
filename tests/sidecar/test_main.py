import io
import types

from sidecar import main


def test_stdin_eof_shuts_down_recorder(monkeypatch):
    recorder = types.SimpleNamespace(shutdown_called=False)
    recorder.shutdown = lambda: setattr(recorder, "shutdown_called", True)
    hw = types.SimpleNamespace(to_dict=lambda: {}, model_name="small")
    ipc = types.SimpleNamespace(send=lambda *_args, **_kwargs: None)

    monkeypatch.setattr(main, "IPC", lambda: ipc)
    monkeypatch.setattr(main, "detect_hardware", lambda: hw)
    monkeypatch.setattr(main, "Recorder", lambda **_kwargs: recorder)
    monkeypatch.setattr(main.sys, "stdin", io.StringIO(""))

    main.main()

    assert recorder.shutdown_called is True
