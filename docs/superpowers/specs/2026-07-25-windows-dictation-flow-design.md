# Windows Dictation Flow Design

## Goal

Make the Windows onboarding and first-dictation path functional end to end using the existing local Parakeet sidecar, without adding licensing, account, or cloud dependencies.

## Scope

1. Onboarding becomes `Permissions → Model → Try it`.
2. Windows uses the already-selected Parakeet model path; hardware scanning is not a prerequisite for setup.
3. The setup UI displays the real active hotkey from one shared shortcut definition instead of hardcoded text.
4. Model readiness remains truthful: the sidecar warms the model after startup, the UI can distinguish sidecar readiness from model readiness, and a first dictation reports a useful error if warmup failed.
5. The flow is covered by focused tests, a frontend build, and the existing Windows packaging check.

Out of scope: licensing, account/billing screens, cloud transcription, macOS native focus detection, and visual redesign outside onboarding/readiness.

## Architecture and data flow

`SetupWizard` owns only the step sequence and completion callback. `PermissionsStep` requests microphone/accessibility permissions. `ModelStep` observes the existing sidecar/model state and waits for the model-ready event. `TryItStep` uses the existing dictation path and completes setup only after a successful transcript/injection attempt.

The sidecar remains the owner of model loading. The frontend subscribes through `useSidecar`, updates `sidecarReady` and `modelReady`, and never sends a competing Windows model-selection request during startup. The setup UI reads the same shortcut binding used by the hotkey layer.

## Error handling

- Permission failure keeps the user on the permission step with a retry action.
- Model warmup failure leaves setup actionable and shows the sidecar error instead of claiming the model is loading forever.
- Try-it transcription failure keeps setup open and shows the existing last-error message; completion is not persisted until the attempt succeeds.

## Verification

- Static/component tests assert the step order, shared shortcut rendering, and readiness/error states.
- Existing sidecar tests remain green.
- `pnpm run build` must pass.
- `build-local.ps1` must continue producing the Windows NSIS installer.
