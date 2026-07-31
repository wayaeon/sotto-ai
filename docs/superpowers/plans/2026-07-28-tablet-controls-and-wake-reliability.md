# Tablet controls and wake reliability implementation plan

> **For implementation:** execute this plan inline in the current workspace. The working tree already contains unrelated `.claude/` files; do not stage them.

**Goal:** Make Verba usable in tablet posture with one large touch control while retaining a genuinely local, observable `Verba dictate` wake flow that starts and stops one dictation without keyboard interaction.

**Architecture:** A tiny Windows-native posture poll emits only state changes to the existing frontend event channel. The pill derives its large touch target from that state and uses the existing `start_ptt`/`stop_ptt` commands. Wake detection stays in the existing Sherpa keyword spotter; add explicit status transitions, change the tuned phrase to the approved two-word phrase, and ensure diagnostic statuses never reset recording state.

**Tech stack:** Tauri 2/Rust, Windows `GetSystemMetrics`, React/Zustand, Python, sherpa-onnx, existing pytest contract tests.

---

## 1. Bridge Windows slate posture into the frontend

**Files:**
- Create: `src-tauri/src/tablet_posture.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/stores/appStore.ts`
- Modify: `src/lib/tauri.ts`
- Test: `tests/test_tablet_posture_contract.py`

1. Write the failing contract test first. It should assert that the Rust bridge reads `SM_CONVERTIBLESLATEMODE`, emits `tablet-posture`, and polls for changes instead of creating another command endpoint. It should assert that the frontend event union accepts `{ event: "tablet_posture"; posture: "tablet" | "laptop" }`.
2. Run `pnpm exec pytest tests/test_tablet_posture_contract.py` and confirm it fails because the bridge does not exist.
3. Add `tablet_posture.rs` under `cfg(windows)`. Implement one `is_tablet_posture()` using `GetSystemMetrics(SM_CONVERTIBLESLATEMODE) == 0`; run a Tokio task at a deliberately slow 1-second interval and emit JSON through the existing `sidecar-event` channel only when the value changes. On non-Windows, compile a no-op `start_tablet_posture_bridge` so the app remains portable.
4. Register the module and call `tablet_posture::start_tablet_posture_bridge(app.handle().clone())` during the existing Tauri setup.
5. Add `tabletPosture: "tablet" | "laptop"` and `setTabletPosture` to the Zustand store with `laptop` as the safe default. Extend `SidecarMessage` and `useSidecar` to consume the event; do not add a second event listener.
6. Re-run the focused test. Then run `pnpm exec cargo check --manifest-path src-tauri/Cargo.toml`.

## 2. Add a tablet-only one-touch dictation control

**Files:**
- Modify: `src/components/Pill.tsx`
- Modify: `src/components/settings/GeneralTab.tsx`
- Test: `tests/test_tablet_controls_contract.py`

1. Write the failing contract test. Assert that `Pill.tsx` derives tablet controls from `tabletPosture` and the persisted override, uses `start_ptt` and `stop_ptt`, and that `GeneralTab.tsx` exposes one manual fallback setting.
2. Run `pnpm exec pytest tests/test_tablet_controls_contract.py` and confirm failure.
3. In `Pill.tsx`, reuse the existing pill window and PTT commands. When posture is `tablet`, replace the hover-only collapsed handle with one large, visible, touch-safe microphone button; use pointer down to start PTT and pointer up/cancel to stop it. Keep its hit target at least 64 px, prevent duplicate starts while processing/loading, and retain the existing bar for recording/progress. Laptop posture keeps the current hover handle unchanged.
4. Add a single persisted `always_show_touch_control` fallback toggle in `GeneralTab.tsx`. Its only purpose is hardware that reports laptop posture incorrectly; it forces the same control visible. Do not build a separate mode selector or a separate window.
5. Update the pill resize calculation only if necessary to accommodate the larger collapsed touch target. Keep it bottom-centred and preserve the existing no-jump state machine.
6. Re-run both focused contract tests and `pnpm exec tsc --noEmit` (or the project’s existing TypeScript check if configured).

## 3. Make the local wake pipeline observable and tune the phrase

**Files:**
- Modify: `sidecar/wakeword.py`
- Modify: `sidecar/recorder.py`
- Modify: `src/hooks/useSidecar.ts`
- Modify: `src/stores/appStore.ts`
- Modify: `src/components/Home.tsx`
- Modify: `src/components/Orb.tsx`
- Modify: `tests/test_wakeword_contract.py`

1. Expand the failing wake contract test first to require `WAKE_PHRASE_VARIANTS = ("verba dictate",)`, a `wake_listening` event when real speech reaches the spotter, and a frontend guard that leaves `recordingState` untouched for diagnostic wake statuses.
2. Run `pnpm exec pytest tests/test_wakeword_contract.py` and confirm it fails.
3. In `wakeword.py`, change the keyword file to the single approved phrase `verba dictate`. Keep CPU-only, one thread, and the existing local asset model. Do not add a cloud recognizer or load Parakeet in the listener.
4. In `_wake_phrase_loop`, emit `wake_listening` only when VAD first passes speech frames into the keyword spotter. Emit `wake_detected` on a detected phrase, then `wake_dictating` when capture begins. Reset the listener after a rejected utterance as it does today. This gives an unambiguous chain: armed -> hearing speech -> detected -> dictating -> processing -> armed.
5. Add `wakePhraseStatus` to the app store. In `useSidecar`, handle those events separately from `statusMap`; specifically, do not map unknown diagnostic statuses to `idle`, because that currently hides useful state and clears the visual/audio feedback.
6. Update the existing wake setting and orb copy to say “Verba dictate”. Show the compact current diagnostic state below the toggle only while enabled (e.g. “Armed”, “Hearing speech”, “Dictating”, or the existing error). Do not add a dashboard or log viewer.
7. Re-run `pnpm exec pytest tests/test_wakeword_contract.py tests/test_model_download_sizes.py`, then manually verify with the app: enable wake phrase, say “Verba dictate”, confirm `Hearing speech` then `Dictating`, speak a short sentence, pause, and confirm it transcribes then re-arms.

## 4. Final verification and package update

**Files:** no additional source files expected.

1. Run the focused Python suite: `pnpm exec pytest tests/test_tablet_posture_contract.py tests/test_tablet_controls_contract.py tests/test_wakeword_contract.py tests/test_model_download_sizes.py`.
2. Run `pnpm exec cargo check --manifest-path src-tauri/Cargo.toml` and the project UI build/check.
3. Run one dev session. Verify the touch target appears after physically folding the keyboard back (or with the fallback toggle), begins recording on press, processes on release, and vanishes again in laptop posture.
4. Build the updated installer with `pnpm run build:app -- --bundles nsis`, using the repository’s `%TEMP%\\sotto-target` convention. Report the new NSIS path.

## Deliberate limits

- Windows posture is a hardware signal, not a Windows Settings “tablet mode” preference. The fallback toggle covers devices whose firmware reports it incorrectly.
- Wake tuning is validated against real speech during the final manual check. No prerecorded-audio corpus is added until we have a failing audio sample to tune against.
- macOS posture detection and visual/screen intelligence remain out of scope.
