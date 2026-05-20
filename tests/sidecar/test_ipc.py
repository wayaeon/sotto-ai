import json
import pytest
from sidecar.ipc import IPC, Command, Event


def test_send_event_writes_json_line(capsys):
    ipc = IPC()
    ipc.send(Event.READY)
    captured = capsys.readouterr()
    msg = json.loads(captured.out.strip())
    assert msg["event"] == "ready"


def test_send_event_with_data(capsys):
    ipc = IPC()
    ipc.send(Event.WORD, text="hello", partial=True)
    captured = capsys.readouterr()
    msg = json.loads(captured.out.strip())
    assert msg["event"] == "word"
    assert msg["text"] == "hello"
    assert msg["partial"] is True


def test_send_audio_recorded_event(capsys):
    ipc = IPC()
    ipc.send(Event.AUDIO_RECORDED, audio_path="C:\\tmp\\sample.wav")
    captured = capsys.readouterr()
    msg = json.loads(captured.out.strip())
    assert msg["event"] == "audio_recorded"
    assert msg["audio_path"] == "C:\\tmp\\sample.wav"


def test_parse_command_start_ptt():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "start_ptt"}')
    assert cmd == Command.START_PTT


def test_parse_command_stop_ptt():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "stop_ptt"}')
    assert cmd == Command.STOP_PTT


def test_parse_command_toggle_handsfree():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "toggle_handsfree"}')
    assert cmd == Command.TOGGLE_HANDSFREE


def test_parse_command_ping():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "ping"}')
    assert cmd == Command.PING


def test_parse_unknown_command_returns_none():
    ipc = IPC()
    result = ipc.parse('{"cmd": "unknown_xyz"}')
    assert result is None


def test_parse_malformed_json_returns_none():
    ipc = IPC()
    result = ipc.parse("not json {{")
    assert result is None
