import sidecar.recorder as recorder
from sidecar.recorder import _pcm16_level


def test_pcm16_level_is_zero_for_silence():
    assert _pcm16_level(b"\x00\x00" * 128) == 0.0


def test_pcm16_level_reflects_int16_amplitude():
    sample = (12000).to_bytes(2, byteorder="little", signed=True)

    assert 0.3 < _pcm16_level(sample * 128) < 0.4


def test_pcm16_level_ignores_partial_sample_byte():
    sample = (16000).to_bytes(2, byteorder="little", signed=True)

    assert _pcm16_level(sample * 4 + b"\xff") == _pcm16_level(sample * 4)


def test_windows_input_candidates_prefer_a_real_directsound_microphone(monkeypatch):
    class FakePyAudio:
        def get_host_api_info_by_type(self, host_api_type):
            assert host_api_type == 1
            return {"index": 1}

        def get_device_count(self):
            return 4

        def get_device_info_by_index(self, index):
            return [
                {"hostApi": 0, "maxInputChannels": 1, "name": "Microphone Array"},
                {"hostApi": 1, "maxInputChannels": 1, "name": "Primary Sound Capture Driver"},
                {"hostApi": 1, "maxInputChannels": 1, "name": "Microphone Array (AMD Audio Device)"},
                {"hostApi": 1, "maxInputChannels": 0, "name": "Speakers"},
            ][index]

    monkeypatch.setattr(recorder.sys, "platform", "win32")

    candidates = recorder._input_device_candidates(FakePyAudio(), 1)

    assert candidates == [2, None]
