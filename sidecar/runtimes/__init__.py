"""Runtime adapter dispatch."""
from __future__ import annotations
from typing import Any


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
    else:
        raise ValueError(f"Unknown runtime: {runtime!r}")
