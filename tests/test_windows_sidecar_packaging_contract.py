from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_windows_release_excludes_unused_ml_frameworks():
    spec = (ROOT / "sidecar.spec").read_text(encoding="utf-8")

    assert "WINDOWS_LEAN_EXCLUDES" in spec
    assert "sys.platform == \"win32\"" in spec
    for package in ("torch", "torchaudio", "tensorflow", "keras", "nemo", "transformers", "faster_whisper", "funasr"):
        assert f'"{package}"' in spec
    for adapter in ("sidecar.runtimes.faster_whisper", "sidecar.runtimes.nemo", "sidecar.runtimes.transformers", "sidecar.runtimes.onnx"):
        assert f'"{adapter}"' in spec


def test_windows_dependencies_only_install_the_onnx_parakeet_stack():
    requirements = (ROOT / "sidecar" / "requirements.txt").read_text(encoding="utf-8")

    assert "onnx-asr[hub]==0.11.0" in requirements
    assert "onnxruntime>=1.18" in requirements
    for package in ("faster-whisper", "torch", "torchaudio", "nemo_toolkit", "transformers", "accelerate", "funasr", "mistral-common"):
        line = next(line for line in requirements.splitlines() if line.startswith(package))
        assert 'sys_platform != "win32"' in line


def test_sidecar_bundles_onnx_asr_distribution_metadata_for_frozen_worker():
    spec = (ROOT / "sidecar.spec").read_text(encoding="utf-8")

    assert 'copy_metadata("onnx-asr")' in spec
    assert 'collect_data_files("onnx_asr")' in spec


def test_local_windows_build_rebuilds_sidecar_and_skips_updater_signing():
    script = (ROOT / "build-local.ps1").read_text(encoding="utf-8")

    assert "createUpdaterArtifacts" in script
    assert '"bundle":{"createUpdaterArtifacts":false}}' in script.replace(" ", "")
    assert "pyinstaller" in script.lower()
    assert "sidecar-x86_64-pc-windows-msvc.exe" in script
    assert "onnx-asr" in script
    assert "$env:TAURI_SIGNING_PRIVATE_KEY" not in script
