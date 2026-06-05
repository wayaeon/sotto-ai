# Multi-Runtime STT Adapter Design

**Date:** 2026-06-05  
**Goal:** Wire NeMo (Parakeet, Canary), Transformers (Distil-Whisper, SenseVoice, Moonshine), and ONNX (sherpa-onnx) runtimes alongside the existing faster-whisper runtime. Every installed model becomes benchmarkable and usable for PTT. The best model for the current hardware is chosen automatically at startup.

---

## Problem

The current sidecar worker (`recorder.py:_worker_loop`) and benchmark runner (`models.py:_benchmark_model`) are hardcoded to faster-whisper. Six other runtimes in `MODEL_CATALOG` have `benchmark_supported: false` and no transcription path. Users on GPU hardware (CUDA or AMD DirectML) cannot reach the >95% accuracy + <1s latency target achievable with Parakeet TDT.

---

## Architecture Overview

```
Hardware detection (startup)
  └─ detect_device() → DeviceTier + device_str
       ├─ CUDA ≥6GB   → "cuda"       → Parakeet TDT v3
       ├─ CUDA <6GB   → "cuda"       → large-v3-turbo
       ├─ DirectML     → "directml"   → Parakeet TDT v3 (via torch-directml)
       ├─ NPU          → "npu"        → sherpa-onnx Zipformer
       └─ CPU          → "cpu"        → small (faster-whisper)

_worker_loop(model_name, model_path, runtime, device, task_q, result_q)
  └─ runtimes.get_adapter(runtime)
       ├─ .load_model(path, device, compute_type) → model object
       └─ .transcribe(model, audio_path) → str

_benchmark_model  ← same adapter path, all models benchmarkable
```

---

## 1. Device Detection (`hardware.py`)

### New: `DeviceTier` enum

```python
class DeviceTier(str, Enum):
    CUDA     = "cuda"
    DIRECTML = "directml"
    NPU      = "npu"
    CPU      = "cpu"
```

### New: `detect_device() -> tuple[DeviceTier, str]`

Probes in priority order:

1. **CUDA** — `ctranslate2.get_cuda_device_count() > 0`  
   - `≥6GB VRAM` → `(CUDA, "cuda")`, model tier = Parakeet TDT v3  
   - `<6GB VRAM` → `(CUDA, "cuda")`, model tier = large-v3-turbo  
2. **DirectML** — `"DmlExecutionProvider" in onnxruntime.get_available_providers()`  
   → `(DIRECTML, "directml")`, model tier = Parakeet TDT v3  
3. **NPU** — `ai_accelerators` list is non-empty (existing detection)  
   → `(NPU, "npu")`, model tier = sherpa-onnx Zipformer  
4. **CPU fallback**  
   → `(CPU, "cpu")`, model tier = small  

Detection failures (missing `onnxruntime` for DirectML check) are caught and noted in `detection_notes` — never crash hardware detection.

### Updated `_assign_tier()`

Uses `detect_device()` result instead of the current CUDA-only check. Adds `TIER_DIRECTML` and `TIER_NPU` to `ModelTier` enum.

### Updated `HardwareInfo`

Gains two new fields:
- `device_tier: DeviceTier` — set in `__post_init__` alongside existing `tier`
- `device_str: str` — the string passed to runtime adapters (`"cuda"`, `"directml"`, `"npu"`, `"cpu"`)

`Recorder.__init__` signature changes from `tier: ModelTier` to `hw: HardwareInfo` so it has access to `device_str` without re-detecting. `main.py` passes `hw` directly.

`to_dict()` adds `device_tier` and `device_str` fields to the IPC `hardware` event so the frontend can show the correct badge.

---

## 2. Runtime Adapters (`sidecar/runtimes/`)

### Package structure

```
sidecar/runtimes/
  __init__.py          — get_adapter(runtime_name) dispatch
  faster_whisper.py    — existing logic extracted
  nemo.py              — Parakeet TDT v2/v3, Canary 1B Flash
  transformers.py      — Distil-Whisper, SenseVoice, Moonshine
  onnx.py              — sherpa-onnx Zipformer
```

### Interface contract

Every module exposes:

```python
def load_model(model_path: str, device: str, compute_type: str) -> Any:
    """Load and return a model object. Raises ImportError with pip hint if dep missing.
    compute_type is faster-whisper-specific ('int8'/'float16'); other runtimes ignore it
    and apply their own precision logic internally."""

def transcribe(model: Any, audio_path: str) -> str:
    """Transcribe audio_path. Returns plain text string."""
```

`__init__.py`:
```python
def get_adapter(runtime: str):
    if runtime == "faster-whisper": from .faster_whisper import ...
    elif runtime == "nemo":         from .nemo import ...
    elif runtime == "transformers": from .transformers import ...
    elif runtime == "onnx":         from .onnx import ...
    else: raise ValueError(f"Unknown runtime: {runtime}")
```

### Per-runtime implementation notes

**`faster_whisper.py`**  
- Extract existing `_worker_loop` load + transcribe logic verbatim  
- `device`: `"cuda"` or `"cpu"` (no DirectML — ctranslate2 limitation)  
- `compute_type`: `"float16"` on CUDA, `"int8"` on CPU  
- `beam_size=1`, `vad_filter=True` (already applied to recorder.py)

**`nemo.py`**  
- `load_model`: glob for `*.nemo` files in `model_path` dir, select the largest by file size (weights file) → `nemo.collections.asr.models.ASRModel.restore_from(nemo_file, map_location=torch_device)`  
- `device` translation: `"cuda"` → `torch.device("cuda")`, `"directml"` → `torch_directml.device()`, `"cpu"` → `torch.device("cpu")`  
- Canary uses `EncDecMultiTaskModel` instead of `ASRModel`  
- `transcribe`: `model.transcribe([audio_path])[0]`  
- Missing dep message: `"pip install nemo_toolkit[asr]"`

**`transformers.py`**  
- `load_model`: `transformers.pipeline("automatic-speech-recognition", model=model_path, device=hf_device)`  
- `device` translation: `"cuda"` → `0`, `"directml"` → `torch_directml.device()`, `"cpu"` → `-1`  
- SenseVoice exception: uses `funasr.AutoModel` instead of HF pipeline  
- `transcribe`: `pipe(audio_path)["text"]` (or `model.generate(input=audio_path)[0]["text"]` for SenseVoice)  
- Missing dep message: `"pip install transformers accelerate"` (or `"pip install funasr"` for SenseVoice)

**`onnx.py`**  
- `load_model`: builds `sherpa_onnx.OfflineRecognizer` with appropriate execution provider  
- `device` translation: `"directml"` → `provider="DmlExecutionProvider"`, `"npu"` → `provider="NPUExecutionProvider"`, `"cpu"` → `provider="CPUExecutionProvider"`  
- Model dir must contain `model.int8.onnx`, `tokens.txt` (Zipformer layout)  
- `transcribe`: `recognizer.create_stream()` → `stream.accept_waveform()` → `recognizer.decode_stream()`  
- Missing dep message: `"pip install sherpa-onnx onnxruntime-directml"`

---

## 3. Worker Subprocess (`recorder.py`)

### `_worker_loop` signature change

```python
# Before
def _worker_loop(model_path: str, task_q, result_q) -> None:

# After
def _worker_loop(model_name: str, model_path: str, runtime: str, device: str, task_q, result_q) -> None:
```

Body change:
```python
# Before: hardcoded faster-whisper load
model = WhisperModel(model_path, device=device, compute_type=compute_type)

# After: adapter dispatch
from sidecar.runtimes import get_adapter
adapter = get_adapter(runtime)
compute_type = "float16" if device == "cuda" else "int8"
model = adapter.load_model(model_path, device, compute_type)
result_q.put(("ready", {"device": device, "compute_type": compute_type, "runtime": runtime}))
```

### `_start_worker` change

Reads `ModelSpec.runtime` and the detected device string, passes both to `_worker_loop`:

```python
spec = MODEL_CATALOG.get(self._model_name)
runtime = spec.runtime if spec else "faster-whisper"
proc = ctx.Process(target=_worker_loop, args=(self._model_name, model_path, runtime, self._device, ...))
```

`Recorder.__init__` stores `self._device` from `detect_device()` called once at construction.

---

## 4. Benchmark Runner (`models.py`)

### `_benchmark_model` change

Replace hardcoded faster-whisper block with adapter dispatch — identical pattern to worker:

```python
from .runtimes import get_adapter
adapter = get_adapter(spec.runtime)
compute_type = "float16" if device == "cuda" else "int8"
model = adapter.load_model(model_path, device, compute_type)
text = adapter.transcribe(model, str(path))
```

### `ModelSpec.benchmark_supported` 

Set `True` for all models once their runtime adapter is wired. The `benchmark_supported: false` flag moves to being a temporary state during development, not a permanent model property.

---

## 5. Model Catalog Updates (`models.py`)

### New tiers

```python
class ModelTier(str, Enum):
    TIER_CUDA_HIGH  = "cuda_high"   # CUDA ≥6GB → Parakeet TDT v3
    TIER_CUDA_LOW   = "cuda_low"    # CUDA <6GB → large-v3-turbo
    TIER_DIRECTML   = "directml"    # AMD/Intel GPU → Parakeet TDT v3 via DirectML
    TIER_NPU        = "npu"         # AMD/Intel NPU → sherpa-onnx
    TIER_CPU        = "cpu"         # CPU only → small
```

### Updated `MODEL_NAMES`

```python
ModelTier.TIER_CUDA_HIGH: "nvidia/parakeet-tdt-0.6b-v3",
ModelTier.TIER_CUDA_LOW:  "large-v3-turbo",
ModelTier.TIER_DIRECTML:  "nvidia/parakeet-tdt-0.6b-v3",
ModelTier.TIER_NPU:       "csukuangfj/sherpa-onnx-zipformer-en-2023-04-01",
ModelTier.TIER_CPU:       "small",
```

### Updated size labels

| Model | Size |
|-------|------|
| nvidia/parakeet-tdt-0.6b-v3 | ~2.4 GB |
| nvidia/parakeet-tdt-0.6b-v2 | ~2.4 GB |
| nvidia/canary-1b-flash | ~4.0 GB |
| distil-whisper/distil-large-v3.5 | ~1.5 GB |
| FunAudioLLM/SenseVoiceSmall | ~500 MB |
| UsefulSensors/moonshine | ~200 MB |
| csukuangfj/sherpa-onnx-zipformer-en-2023-04-01 | ~100 MB |

---

## 6. Frontend (`PipelineDebug.tsx`)

### `MODEL_CANDIDATES` updates

- Set `benchmarkSupported: true` for all models once adapters are wired
- Fill in `sizeLabel` values from table above
- Update `note` strings to remove "needs X runtime" language

### Worker ready badge

Extended to show device tier:
- `"⚡ GPU · CUDA · float16"` 
- `"🔷 GPU · DirectML"`
- `"🔮 NPU · ONNX"`
- `"💻 CPU · int8"`

Parsed from the `worker_ready` status string: `"worker_ready device=directml compute=float16 runtime=nemo"`.

### Hardware spec panel

Adds a `DirectML` row alongside the existing `CUDA` row, populated from the new `device_tier` field in the `hardware` IPC event.

---

## 7. Dependencies (`requirements.txt`)

Added as optional — each runtime only imports when that model is loaded:

```
# Existing
faster-whisper>=1.1
torch>=2.3
torchaudio>=2.3

# New — installed separately by user if needed
torch-directml          # AMD/Intel GPU backend for PyTorch (NeMo, transformers)
onnxruntime-directml    # AMD/Intel GPU backend for ONNX (sherpa-onnx)
nemo_toolkit[asr]       # Parakeet TDT v2/v3, Canary 1B Flash
transformers>=4.40      # Distil-Whisper, Moonshine
accelerate              # transformers GPU offload helper
funasr                  # SenseVoice
sherpa-onnx             # Zipformer ONNX runtime
```

All new deps are optional — `load_model` raises `ImportError` with a `pip install ...` hint if missing. The sidecar starts and faster-whisper continues to work even if none of the new deps are installed.

---

## 8. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Dep not installed | `ImportError` → `Event.ERROR` with `"pip install X"` message, shown in event log |
| DirectML op not supported | Falls back to CPU, emits warning status |
| NeMo `.nemo` file not found in download dir | `Event.ERROR` with clear message |
| Model not downloaded | Existing `is_downloaded()` check unchanged |
| Worker crashes on new runtime | Existing crash/respawn logic unchanged |

---

## 9. Testing

- `tests/sidecar/test_ipc.py` — add `runtime` field to mock benchmark payloads  
- `tests/test_model_download_sizes.py` — add new model entries  
- New `tests/sidecar/test_runtimes.py` — unit tests for each adapter's `load_model`/`transcribe` with mocked model objects  
- Manual: benchmark each new model via the Models Benchmark tab after implementation

---

## Out of Scope

- ROCm support (Linux AMD GPU path — separate effort)
- NPU-optimised model quantisation (requires AMD Ryzen AI SDK setup guide)
- Cloud fallback paths
- Streaming / real-time transcription for new runtimes (hands-free mode — follow-up)
