# Verba macOS overlay, permissions, and install design

## Goal

Make the macOS build feel native and installable without requiring a paid Apple Developer account for personal use. The Windows pill remains unchanged. macOS gets a reliable microphone onboarding flow, a menu-bar control, and a top-center status capsule that remains available over Spaces and full-screen apps without stealing focus.

## Current findings

- The Accessibility prompt is expected: the Rust `rdev` listener watches global key events and the injection path types into the focused app.
- The setup wizard requests microphone access through browser `getUserMedia`, but the real recorder is the PyAudio-based Python sidecar. A completed `verba_setup_complete` flag also bypasses the wizard on later launches.
- The current Tauri window is a normal always-on-top WebView window. It is positioned at the bottom of the primary monitor and has no macOS-specific safe-area or full-screen collection behavior.
- The tray currently uses the color `icons/32x32.png`; it is not a dedicated monochrome menu-bar template icon.
- The current unsigned DMG can be used locally by clearing its quarantine attribute; paid Developer ID signing/notarization is intentionally out of scope for this install path.

## Design

### 1. macOS permission onboarding

Add an explicit macOS microphone usage description and audio-input entitlement to the app bundle. The setup flow will expose one permission state for the actual recording capability:

1. `notDetermined`: show “Allow microphone” and request access before the sidecar starts recording.
2. `authorized`: show “Ready” and allow setup to continue.
3. `denied` or `restricted`: show the exact System Settings path and a button that opens the relevant Privacy & Security pane.

The frontend keeps the existing browser check as a quick UI probe, but readiness is driven by a native permission command/event so a sidecar failure cannot be reported as granted. The error surface must distinguish microphone denied, microphone device unavailable, and sidecar startup failure.

The setup wizard remains rerunnable from Settings. Rerunning it clears only the setup-complete flag; it does not delete transcripts, models, or preferences.

### 2. Top-center macOS capsule

On macOS only, the bottom pill is replaced by a compact status capsule anchored to the top-center safe area:

- On notched MacBooks, center on the physical display notch and keep a small top inset.
- On displays without a notch, center in the same top region with the same visual width and inset.
- Idle state: a small monochrome Verba waveform/menu-bar affordance; no permanent large floating control.
- Recording state: capsule expands horizontally to show app context, live waveform, elapsed time, and one clear cancel/finish action.
- Processing state: same geometry, muted amber/violet progress treatment, no separate “loading model” bubble.
- Completion/error state: collapse after the existing short timeout and leave the result in the library.

The capsule remains one window so state transitions do not jump between surfaces. The window is non-activating, click-through outside its interactive controls, and never steals focus from the target app.

### 3. Spaces and full-screen behavior

The macOS overlay window uses native window collection behavior equivalent to:

- non-activating panel;
- join all Spaces;
- join other applications’ full-screen spaces as an auxiliary overlay;
- always-on-top only while the capsule is visible.

When hidden, the window is not interactive and does not reserve layout space. When visible over a full-screen app, the capsule is still reachable with a single click and the global shortcut remains available. If macOS refuses the overlay in a particular secure surface, the menu-bar item remains the fallback control.

### 4. Menu-bar icon and light mode

Add a dedicated 18–20 px monochrome waveform template asset for macOS. The tray item uses that asset and an alternate active-state image, so macOS can render it correctly against light and dark menu bars. The menu contains:

- Start/stop dictation;
- current state (`Ready`, `Recording`, `Processing`, or the permission error);
- Open Verba;
- Settings;
- Quit.

The existing colored application icon remains for the Dock and main window; it is not reused as the menu-bar glyph.

### 5. Install path without Apple Developer membership

Keep the unsigned DMG for personal use. Add a concise `INSTALL_MAC.md` section and release notes that explain:

1. Open the DMG and drag Verba to Applications.
2. Run `xattr -cr /Applications/Verba.app` once if Gatekeeper reports the app as damaged.
3. Grant Microphone and Accessibility access in System Settings.

The release workflow must continue producing separate `aarch64` and `x86_64` artifacts. No signing credentials, Apple Developer account, or telemetry are required for this path.

## Data flow

```text
Setup / Settings
  -> native microphone status/request
  -> sidecar audio pump
  -> shared app store state
  -> macOS capsule + menu-bar state
  -> focused-app text injection
```

All audio, transcripts, models, and permission state remain local. The overlay reads the existing sidecar event stream; it does not open a second microphone stream.

## Error handling

- Permission denied: keep dictation disabled, show a settings link, and never spin up repeated prompt attempts.
- Sidecar cannot open a device: report the device error in the capsule and Settings; preserve the rest of the app.
- Overlay positioning fails: fall back to the center-top of the active monitor, then to the menu-bar item.
- Full-screen attachment fails: keep the menu-bar control and global shortcut available.
- Install architecture mismatch: release notes identify `aarch64` versus `x86_64` explicitly.

## Verification

- Build both macOS targets and verify the app bundle contains the microphone usage description and audio-input entitlement.
- On an M-series Mac, start from a clean permission state and confirm the microphone prompt appears before the first recording.
- Deny then re-enable microphone and Accessibility permissions and verify the UI states update without reinstalling.
- Test the capsule over a normal window, a second Space, and a full-screen app; confirm it does not activate or move focus.
- Test light and dark menu bars and confirm the template icon remains legible.
- Verify the unsigned DMG install workaround and confirm the existing Windows build remains unchanged.
