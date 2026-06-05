from sidecar.recorder import _pcm16_level


def test_pcm16_level_is_zero_for_silence():
    assert _pcm16_level(b"\x00\x00" * 128) == 0.0


def test_pcm16_level_reflects_int16_amplitude():
    sample = (12000).to_bytes(2, byteorder="little", signed=True)

    assert 0.3 < _pcm16_level(sample * 128) < 0.4


def test_pcm16_level_ignores_partial_sample_byte():
    sample = (16000).to_bytes(2, byteorder="little", signed=True)

    assert _pcm16_level(sample * 4 + b"\xff") == _pcm16_level(sample * 4)
