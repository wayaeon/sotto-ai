# Lean Windows runtime design

## Goal

Reduce Verba's idle resource use by at least 90% relative to a warm Parakeet worker, while preserving Parakeet TDT v3 for active dictation and preventing sidecars from surviving an app exit.

## Evidence

- `sidecar/main.py` starts `recorder.warmup()` on every Windows launch; that eagerly creates a `verba-transcriber` process and maps the 640 MB int8 Parakeet model.
- The app has no shutdown path for its managed sidecar. The live audit found seven old `sidecar.exe` processes, including a 593 MB model worker.
- `src-tauri/binaries/sidecar-x86_64-pc-windows-msvc.exe` is 298 MB. Its requirements include PyTorch, NeMo, Transformers, FunASR, and Mistral dependencies that the fixed Windows Parakeet ONNX path does not use.

## Design

1. Keep only the small Python host and microphone stream alive while idle. Do not call `warmup()` at launch.
2. Start Parakeet loading on the first push-to-talk press in a background thread, overlapping model startup with the user's speech. Reuse it for nearby dictations, then terminate it after a short idle window.
3. On every Tauri exit, send the sidecar its existing `quit` command, prevent automatic respawn, and force-kill only the managed child if graceful shutdown exceeds the bounded wait. The Python host then runs `Recorder.shutdown()` and stops the model worker.
4. Create a Windows-only Parakeet sidecar build with only `onnx-asr`, `sherpa-onnx`, PyAudio, WebRTC VAD, Hugging Face download helpers, and their required transitive dependencies. Remove alternate-model runtime packages from the shipped requirements and runtime registry.

## Limits

- A loaded Parakeet model cannot be made 90% smaller in RAM without switching models. The 90% target applies to idle Verba.
- The first dictation after a cold start or idle eviction may have a startup delay. Starting the load at PTT press minimizes the visible part of it.
- Existing orphan sidecars require one clean Verba restart to disappear; the new shutdown path prevents new ones.

## Verification

- Unit/contract tests prove no eager Windows warmup, worker eviction, and shutdown behavior.
- Compare Task Manager working set after a clean idle launch, after one dictation, and after eviction.
- Build NSIS and confirm only the lean sidecar is bundled.
