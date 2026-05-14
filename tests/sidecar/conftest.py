import sys
import io
import pytest


@pytest.fixture
def mock_stdin(monkeypatch):
    def _make(lines: list[str]):
        buf = io.StringIO("\n".join(lines) + "\n")
        monkeypatch.setattr(sys, "stdin", buf)
    return _make


@pytest.fixture
def capture_stdout(capsys):
    return capsys
