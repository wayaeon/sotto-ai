# Tablet controls and wake reliability

## Goal

Make Verba usable in tablet posture without a keyboard: a large single-tap dictation control appears only when Windows reports slate/tablet posture, while voice activation remains available in every posture.

## Scope

- On Windows, query `SM_CONVERTIBLESLATEMODE` through the native app process.
- In slate posture, show a fixed, large touch dock with start/stop state and a clear recording indicator.
- In laptop posture, hide the touch dock.
- If the device does not expose the slate signal, allow an explicit tablet-controls override in Settings.
- Keep the wake phrase active independently of posture.
- Add wake diagnostics that distinguish: microphone activity, detector armed, phrase detected, and dictation started.
- Tune the local keyword phrase around `Verba dictate` and verify it against recorded local audio fixtures.

## Non-goals

- Screen-aware or visual-agent context.
- macOS posture detection.
- Cloud transcription or cloud wake detection.

## Data flow

1. Rust polls/receives the Windows convertible-slate signal and emits `tablet-posture` to both windows.
2. The React store holds the current posture and optional user override.
3. The pill renders the large dock only when the resolved state is tablet.
4. Touch start/stop calls the existing sidecar PTT commands.
5. The sidecar emits wake diagnostic statuses; the UI exposes them in Settings and keeps the actual recording state separate.

## Error handling

- Unsupported or unavailable posture signal resolves to laptop mode unless the user enables the override.
- Wake detector failures leave the touch dock usable and show a concrete error rather than a misleading armed state.
- No automatic audio capture begins merely because posture changed.

## Verification

- Unit contract for slate-state resolution and dock visibility.
- Windows Rust check and frontend build.
- Manual test: fold device to tablet posture, confirm dock appears; fold back, confirm it hides.
- Manual wake test with diagnostic state visible: armed -> detected -> recording -> silence -> ready.
