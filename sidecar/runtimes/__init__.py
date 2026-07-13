"""Runtime adapter dispatch."""
from __future__ import annotations
from typing import Any


def resolve_device(runtime: str, device: str) -> str:
    """Return the device the runtime can actually use on this machine."""
    if runtime == "onnx":
        return device
    if runtime == "onnx-asr" and device == "npu":
        return "cpu"
    if device == "npu":
        return "cpu"
    if device == "directml":
        try:
            import torch_directml  # noqa: F401
        except ImportError:
            return "cpu"
    return device


def get_adapter(runtime: str):
    """Return the runtime module for the given runtime name."""
    if runtime == "faster-whisper":
        from . import faster_whisper
        return faster_whisper
    elif runtime == "nemo":
        from . import nemo
        return nemo
    elif runtime == "transformers":
        from . import transformers
        return transformers
    elif runtime == "onnx":
        from . import onnx
        return onnx
    elif runtime == "onnx-asr":
        from . import onnx_asr
        return onnx_asr
    else:
        raise ValueError(f"Unknown runtime: {runtime!r}")
