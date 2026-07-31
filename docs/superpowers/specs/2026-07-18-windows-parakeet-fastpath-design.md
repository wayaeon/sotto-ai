# Windows Parakeet Fast Path — Design

## Goal

Make the Windows experience start quickly and use the proven Parakeet TDT v3
path consistently. Hardware probing and Whisper model routing should not delay
startup or change the transcription model on Windows. macOS keeps its existing
path so a different model can be introduced later without reworking the
Windows flow.

## Scope

### Windows

- Skip hardware detection during sidecar startup.
- Use `nvidia/parakeet-tdt-0.6b-v3` with the existing ONNX runtime and CPU-safe
  execution path.
- Start the Parakeet worker in the background immediately after sidecar setup;
  the UI remains usable and reports worker errors separately.
- Skip the hardware-analysis setup screen and go directly to permissions.
- Replace model selection with a read-only Parakeet status card. Existing
  model-switch IPC remains available to diagnostics only.
- Remove stale Windows model/tier values from local storage when startup
  applies the fixed policy.

### macOS

- Preserve the existing hardware/model path.
- Preserve the existing setup wizard and model settings until the macOS model
  is selected in a separate change.

## Data flow

1. Sidecar determines the platform.
2. Windows creates the recorder with a fixed Parakeet startup profile without
   invoking the hardware probe.
3. Sidecar emits `ready` immediately and warms the worker in a background
   lifecycle owned by the sidecar.
4. The worker emits `worker_ready` or an error; neither event blocks the initial
   UI-ready state.
5. The frontend applies the Windows Parakeet policy and renders the locked
   model status. macOS continues to consume the existing hardware event.

There is one worker lifecycle owner during startup: the sidecar. The frontend
must not issue a competing startup `set_model` request on Windows.

## Reliability and trust improvements

- Add a small end-to-end dictation smoke check covering sidecar ready, worker
  ready/error, PTT start/stop, and segment completion.
- Preserve explicit error messages for worker-load and injection failures.
- Add a lightweight success confirmation in the pill after a segment is
  injected, with no persistent notification layer.

## Insights improvement

Add one compact “best dictation window” summary derived from the existing
24-hour heatmap data. Keep the current heatmap and empty state; do not add new
charts or speculative recommendations.

## Verification

- Python tests cover the Windows policy, no-probe startup path, and worker
  lifecycle signals.
- Frontend build verifies the platform-specific setup/settings rendering.
- Existing sidecar tests remain green.
- Manual Windows smoke pass verifies startup, first dictation, failed worker
  messaging, pill expand/collapse, and the live insight summary.

## Deliberate non-goals

- No macOS model selection in this change.
- No removal of the hardware module; diagnostics and the future macOS path
  still use it.
- No new model-download system or cloud fallback.
