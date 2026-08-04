# -*- mode: python ; coding: utf-8 -*-

import sys
from PyInstaller.utils.hooks import collect_data_files, copy_metadata


# Windows ships one transcription engine: int8 ONNX Parakeet.  The source tree
# still contains experimental adapters, but putting their ML stacks in every
# installed app bloats the sidecar by hundreds of MB for no production benefit.
WINDOWS_LEAN_EXCLUDES = [
    "torch",
    "torch_directml",
    "torchaudio",
    "torchvision",
    "torchmetrics",
    "lightning",
    "pytorch_lightning",
    "tensorflow",
    "keras",
    "tensorboard",
    "nemo",
    "transformers",
    "accelerate",
    "faster_whisper",
    "ctranslate2",
    "funasr",
    "mistral_common",
    "sentence_transformers",
    "sidecar.runtimes.faster_whisper",
    "sidecar.runtimes.nemo",
    "sidecar.runtimes.transformers",
    "sidecar.runtimes.onnx",
] if sys.platform == "win32" else []


a = Analysis(
    ['sidecar/main.py'],
    pathex=[],
    binaries=[],
    # onnx-asr reads its own version with importlib.metadata at worker startup.
    # Frozen apps do not include dist-info unless it is copied explicitly.
    # onnx-asr loads its filter-bank data at runtime; metadata alone is not
    # enough for a frozen worker.
    datas=copy_metadata("onnx-asr") + collect_data_files("onnx_asr"),
    hiddenimports=[],
    hookspath=['sidecar/hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=WINDOWS_LEAN_EXCLUDES,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
