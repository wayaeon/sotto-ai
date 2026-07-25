# Windows Dictation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Windows onboarding and first dictation functional with the existing local Parakeet sidecar.

**Architecture:** Keep model loading in the sidecar. The React setup wizard observes the existing Zustand readiness/error state and delegates the actual test dictation to the existing Tauri commands. A small frontend shortcut module supplies the single displayed Windows push-to-talk binding to onboarding and settings.

**Tech Stack:** React + TypeScript, Zustand, Tauri v2/Rust, Python sidecar, pytest, Vite.

## Global Constraints

- Windows uses `nvidia/parakeet-tdt-0.6b-v3`.
- Setup order is exactly `Permissions → Model → Try it`.
- Do not add licensing, account, cloud transcription, or macOS native focus work in this slice.
- Sidecar startup must not trigger a competing frontend model selection request.

---

### Task 1: Make the displayed Windows shortcut canonical

**Files:**
- Create: `src/lib/shortcuts.ts`
- Modify: `src/components/setup/ReadyScreen.tsx`
- Modify: `src/components/settings/HotkeysTab.tsx`
- Test: `tests/test_windows_setup_flow.py`

**Interfaces:**
- Produces `WINDOWS_SHORTCUTS.pushToTalk = "Ctrl + Win"` for all frontend displays.

- [ ] **Step 1: Write the failing source-contract test**

```python
def test_setup_and_settings_use_the_shared_windows_shortcut():
    source = (ROOT / "src" / "lib" / "shortcuts.ts").read_text(encoding="utf-8")
    ready = (ROOT / "src" / "components" / "setup" / "ReadyScreen.tsx").read_text(encoding="utf-8")
    hotkeys = (ROOT / "src" / "components" / "settings" / "HotkeysTab.tsx").read_text(encoding="utf-8")
    assert 'pushToTalk: "Ctrl + Win"' in source
    assert 'WINDOWS_SHORTCUTS' in ready
    assert 'WINDOWS_SHORTCUTS' in hotkeys
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `python -m pytest tests/test_windows_setup_flow.py::test_setup_and_settings_use_the_shared_windows_shortcut -q`

Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Add the shared constant and replace both hardcoded displays**

Use a plain exported object in `src/lib/shortcuts.ts`; import it in both components and render `WINDOWS_SHORTCUTS.pushToTalk`.

- [ ] **Step 4: Run the focused test**

Run: `python -m pytest tests/test_windows_setup_flow.py::test_setup_and_settings_use_the_shared_windows_shortcut -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shortcuts.ts src/components/setup/ReadyScreen.tsx src/components/settings/HotkeysTab.tsx tests/test_windows_setup_flow.py
git commit -m "fix: keep Windows shortcut displays consistent"
```

### Task 2: Replace setup with Permissions → Model → Try it

**Files:**
- Create: `src/components/setup/ModelStep.tsx`
- Create: `src/components/setup/TryItStep.tsx`
- Modify: `src/components/setup/SetupWizard.tsx`
- Test: `tests/test_windows_setup_flow.py`

**Interfaces:**
- `ModelStep({ onNext }: { onNext: () => void })` reads `sidecarReady`, `modelReady`, and `lastError` from `useAppStore`.
- `TryItStep({ onComplete }: { onComplete: () => void })` invokes `startPtt` and `stopPtt` through the existing `src/lib/tauri.ts` API and only calls `onComplete` after a completed segment is observed.

- [ ] **Step 1: Add failing step-order and component-presence contracts**

```python
def test_setup_wizard_uses_the_new_step_order():
    wizard = (ROOT / "src" / "components" / "setup" / "SetupWizard.tsx").read_text(encoding="utf-8")
    assert 'type Step = "permissions" | "model" | "tryit"' in wizard
    assert 'const STEPS: Step[] = ["permissions", "model", "tryit"]' in wizard
    assert "ModelStep" in wizard and "TryItStep" in wizard
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `python -m pytest tests/test_windows_setup_flow.py::test_setup_wizard_uses_the_new_step_order -q`

Expected: FAIL because the wizard still contains the hardware step.

- [ ] **Step 3: Implement the two small screens and update the wizard**

`ModelStep` shows Parakeet as fixed, shows “warming” only while `modelReady` is false, renders `lastError` with retry guidance, and enables Continue only when `modelReady` is true. `TryItStep` presents a short instruction, starts recording on a button press, stops it on release/click, observes `lastSegment`, and keeps the user on the screen when an error is present.

- [ ] **Step 4: Run focused tests and the TypeScript build**

Run: `python -m pytest tests/test_windows_setup_flow.py -q` and `pnpm run build`.

Expected: all focused tests pass and Vite/TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/setup/ModelStep.tsx src/components/setup/TryItStep.tsx src/components/setup/SetupWizard.tsx tests/test_windows_setup_flow.py
git commit -m "feat: make Windows onboarding testable end to end"
```

### Task 3: Stop the frontend from competing with sidecar warmup

**Files:**
- Modify: `src/hooks/useSidecar.ts`
- Modify: `src/stores/appStore.ts` only if an explicit model error state is required
- Test: `tests/test_windows_setup_flow.py`

**Interfaces:**
- Existing `sidecarReady`, `modelReady`, `lastError`, and `lastSegment` remain the only setup-facing state.

- [ ] **Step 1: Add a regression contract**

```python
def test_ready_event_does_not_send_a_competing_frontend_model_selection():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    ready_block = hook.split('case "ready":', 1)[1].split('case "word":', 1)[0]
    assert "setModelIpc(DEFAULT_MODEL)" not in ready_block
```

- [ ] **Step 2: Remove only the startup `setModelIpc` call**

Keep the local model display update, sidecar-ready update, and status-event handling. The sidecar’s Windows constructor and warmup remain authoritative.

- [ ] **Step 3: Run sidecar and focused frontend contracts**

Run: `python -m pytest tests/sidecar/ tests/test_windows_setup_flow.py -q`.

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSidecar.ts tests/test_windows_setup_flow.py
git commit -m "fix: let the sidecar own Windows model warmup"
```

### Task 4: Full verification

**Files:**
- Modify: none unless verification exposes a regression.

- [ ] Run `python -m pytest -q`.
- [ ] Run `pnpm run build`.
- [ ] Run PowerShell parser checks for `dev.ps1`, `build-local.ps1`, and `run-local.ps1`.
- [ ] Run `build-local.ps1` and confirm the NSIS installer exists under `%TEMP%\sotto-target\release\bundle\nsis\`.
- [ ] Manually test `dev.bat`, microphone permission, model-ready screen, Try it, and Ctrl+Win injection in Notepad.
- [ ] Commit any verification-only fixes separately.
