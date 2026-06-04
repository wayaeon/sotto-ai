from sidecar import models
import wave


def test_model_catalog_exposes_approx_sizes():
    assert models.MODEL_DOWNLOAD_SIZES["large-v3-turbo"] >= 3 * 1024**3
    assert models.MODEL_DOWNLOAD_SIZES["tiny"] < models.MODEL_DOWNLOAD_SIZES["base"]


def test_model_catalog_exposes_downloadable_repos_for_all_candidates():
    assert models.MODEL_CATALOG["nvidia/parakeet-tdt-0.6b-v3"].repo_id == "nvidia/parakeet-tdt-0.6b-v3"
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].download_supported is True
    assert models.MODEL_CATALOG["distil-whisper/distil-large-v3.5"].benchmark_supported is False
    assert models.MODEL_CATALOG["csukuangfj/sherpa-onnx-zipformer-en-2023-04-01"].runtime == "onnx"
    assert models.MODEL_CATALOG["medium.en"].benchmark_supported is True


def test_format_bytes_for_download_events():
    assert models.format_bytes(0) == "0 B"
    assert models.format_bytes(1536) == "1.5 KB"
    assert models.format_bytes(3 * 1024**3) == "3.0 GB"


def test_wav_duration_ms_uses_stdlib_wave(tmp_path):
    wav_path = tmp_path / "sample.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 8000)

    assert models._wav_duration_ms(wav_path) == 500
