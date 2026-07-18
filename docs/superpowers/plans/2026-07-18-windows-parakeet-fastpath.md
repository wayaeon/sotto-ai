# Windows Parakeet Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Windows start without hardware probing, use Parakeet TDT v3 consistently, preload it in the background, simplify Windows model/setup UI, and add focused dictation/Insights polish.

**Architecture:** Keep hardware detection and model choice intact for macOS. On Windows, the sidecar owns a fixed Parakeet startup profile and worker warmup; the frontend only reflects that policy and never competes with the sidecar during startup. Keep the existing Pill and Insights components; add only a transient injection confirmation and one derived peak-window summary.

**Tech Stack:** Python sidecar, multiprocessing worker, React 19, Zustand, Tauri 2, Vite, pytest, TypeScript build.

## Global Constraints

- Windows uses `nvidia/parakeet-tdt-0.6b-v3` with the existing ONNX runtime and CPU-safe execution path.
- macOS keeps the existing hardware/model path.
- The UI remains ready while model warmup runs; worker failures surface as errors.
- No new dependencies, cloud fallback, or model-download system.
- Existing model-switch IPC remains available to diagnostics only on Windows.

---

### Task 1: Add a Windows fixed startup profile

**Files:**
- Modify: `sidecar/main.py:70-94`
- Modify: `sidecar/recorder.py:106-113`
- Test: `tests/test_windows_model_policy.py`

**Interfaces:**
- `Recorder.__init__(ipc, hw=None, model_name=None, device="cpu")` accepts the Windows fixed profile while retaining the current `hw` path for macOS.
- `sidecar.main` probes hardware only for non-Windows startup and probes on demand for `detect_hardware` diagnostics.

- [ ] **Step 1: Write the failing policy tests**

```python
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_windows_startup_avoids_hardware_probe() -> None:
    source = (ROOT / "sidecar" / "main.py").read_text()
    assert "if sys.platform == \"win32\":" in source
    assert "detect_hardware()" in source
    assert "Recorder(ipc=ipc, hw=None, model_name=DEFAULT_MODEL, device=\"cpu\")" in source


def test_windows_recorder_defaults_to_parakeet() -> None:
    source = (ROOT / "sidecar" / "recorder.py").read_text()
    assert "model_name: str | None = None" in source
    assert "self._model_name = model_name or best_available_model(hw.model_name)" in source
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest tests/test_windows_model_policy.py -q`

Expected: FAIL because startup still always calls `detect_hardware()` and `Recorder` requires `hw`.

- [ ] **Step 3: Implement the fixed Windows path**

In `sidecar/recorder.py`, use this constructor shape:

```python
def __init__(
    self,
    ipc: IPC,
    hw: "HardwareInfo | None" = None,
    model_name: str | None = None,
    device: str = "cpu",
) -> None:
    self._ipc = ipc
    self._tier = hw.tier if hw else ModelTier.TIER_CPU
    self._device = hw.device_str if hw else device
    self._model_name = model_name or best_available_model(hw.model_name)
```

Import `DEFAULT_MODEL` in `sidecar/main.py`. In `main()` use:

```python
if sys.platform == "win32":
    hw = None
    recorder = Recorder(ipc=ipc, hw=None, model_name=DEFAULT_MODEL, device="cpu")
else:
    hw = detect_hardware()
    ipc.send(Event.HARDWARE, **hw.to_dict())
    recorder = Recorder(ipc=ipc, hw=hw)
```

Move the existing `DETECT_HARDWARE` branch to call `detect_hardware()` on demand and send its payload, so diagnostics still work without startup probing.

- [ ] **Step 4: Run the policy tests**

Run: `python -m pytest tests/test_windows_model_policy.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/main.py sidecar/recorder.py tests/test_windows_model_policy.py
git commit -m "feat: add Windows Parakeet startup path"
```

### Task 2: Warm the Windows worker without a frontend race

**Files:**
- Modify: `sidecar/main.py:75-80`
- Modify: `sidecar/recorder.py` near `_ensure_worker`
- Modify: `src/hooks/useSidecar.ts:42-58`
- Test: `tests/test_windows_model_policy.py`

**Interfaces:**
- `Recorder.warmup()` calls `_ensure_worker()` and leaves error reporting to the existing IPC events.
- Windows frontend startup sets the model label but does not call `set_model`; macOS preserves the existing call.

- [ ] **Step 1: Write the failing warmup test**

```python
def test_windows_warmup_is_owned_by_sidecar() -> None:
    recorder = (ROOT / "sidecar" / "recorder.py").read_text()
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text()
    assert "def warmup(self)" in recorder
    assert "isWindows()" in hook
    assert "setModelIpc(DEFAULT_MODEL)" in hook
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -m pytest tests/test_windows_model_policy.py::test_windows_warmup_is_owned_by_sidecar -q`

Expected: FAIL because no warmup method exists and the frontend still starts the model.

- [ ] **Step 3: Implement sidecar-owned warmup**

Add:

```python
def warmup(self) -> None:
    self._ensure_worker()
```

After `ipc.send(Event.READY)` in Windows startup, start:

```python
threading.Thread(target=recorder.warmup, name="parakeet-warmup", daemon=True).start()
```

Import `threading` in `sidecar/main.py`. In `useSidecar.ts`, use the existing `isWindows()` helper and skip `setModelIpc` only on Windows.

- [ ] **Step 4: Run the policy and existing sidecar tests**

Run: `python -m pytest tests/test_windows_model_policy.py tests/sidecar/ -q`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/main.py sidecar/recorder.py src/hooks/useSidecar.ts tests/test_windows_model_policy.py
git commit -m "perf: warm Windows Parakeet in background"
```

### Task 3: Simplify Windows setup and model settings

**Files:**
- Modify: `src/lib/tauri.ts` near platform types
- Modify: `src/components/setup/SetupWizard.tsx`
- Modify: `src/components/settings/ModelsTab.tsx`
- Test: `tests/test_windows_model_policy.py`

**Interfaces:**
- `isWindows(): boolean` is the shared frontend platform check.
- Windows setup steps are `permissions → ready`; macOS remains `hardware → permissions → ready`.

- [ ] **Step 1: Write the failing source contract**

```python
def test_windows_setup_skips_hardware_and_locks_model() -> None:
    wizard = (ROOT / "src" / "components" / "setup" / "SetupWizard.tsx").read_text()
    models = (ROOT / "src" / "components" / "settings" / "ModelsTab.tsx").read_text()
    assert "isWindows()" in wizard
    assert "isWindows()" in models
    assert "Parakeet TDT 0.6B v3" in models
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -m pytest tests/test_windows_model_policy.py::test_windows_setup_skips_hardware_and_locks_model -q`

Expected: FAIL because the wizard always starts at hardware and settings render every model.

- [ ] **Step 3: Implement the platform UI policy**

Export from `src/lib/tauri.ts`:

```ts
export const isWindows = () => navigator.userAgent.includes("Windows");
```

Use it in `SetupWizard` to initialize permissions directly and derive the two-step progress list. In `ModelsTab`, render one non-clickable Parakeet card on Windows and retain the current selectable model list on macOS.

- [ ] **Step 4: Build and run the contract test**

Run: `python -m pytest tests/test_windows_model_policy.py -q`
Run: `npm run build`

Expected: PASS and a successful Vite build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri.ts src/components/setup/SetupWizard.tsx src/components/settings/ModelsTab.tsx tests/test_windows_model_policy.py
git commit -m "feat: simplify Windows model setup"
```

### Task 4: Add injection confirmation and peak-window insight

**Files:**
- Modify: `src/stores/appStore.ts`
- Modify: `src/hooks/useSidecar.ts` in the primary `segment_done` path
- Modify: `src/components/Pill.tsx` in the expanded-bar render
- Modify: `src/components/Home.tsx` inside `ActivityHeatmap`

**Interfaces:**
- Store field: `injectionNotice: string | null` with `setInjectionNotice(message: string | null)`.
- `ActivityHeatmap` derives `peakWindow: { day: string; hour: number; count: number } | null` from `grid24h`.

- [ ] **Step 1: Write the failing source contracts**

```python
def test_injection_confirmation_and_peak_window_exist() -> None:
    store = (ROOT / "src" / "stores" / "appStore.ts").read_text()
    sidecar = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text()
    home = (ROOT / "src" / "components" / "Home.tsx").read_text()
    assert "injectionNotice" in store
    assert "setInjectionNotice" in sidecar
    assert "peakWindow" in home
```

- [ ] **Step 2: Implement the smallest transient confirmation**

Add the store field/setter. In the primary injection path, set `Inserted` on successful `injectText(raw)` and `Couldn’t insert` on failure, then clear it with `window.setTimeout(..., 1400)`. Include `injectionNotice` in `shouldShowBar`; render it as the existing themed dictating bubble before the idle controls.

- [ ] **Step 3: Add the peak-window chip**

After `grid24h`, reduce all 168 cells to the highest count and render a compact chip such as `Best window · Tue 14:00–15:00`. Render no chip when the transcription list is empty.

- [ ] **Step 4: Build and run the existing tests**

Run: `npm run build`
Run: `python -m pytest tests/sidecar/ -q`

Expected: successful build and all sidecar tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/appStore.ts src/hooks/useSidecar.ts src/components/Pill.tsx src/components/Home.tsx
git commit -m "feat: add dictation feedback and peak insight"
```

### Task 5: Full verification and handoff

**Files:**
- Modify: none
- Test: `tests/test_windows_model_policy.py`, `tests/sidecar/`

- [ ] **Step 1: Run the full Python suite**

Run: `python -m pytest`

Expected: zero failures.

- [ ] **Step 2: Build the frontend**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 3: Manual Windows smoke pass**

Run: `.\dev.ps1`, then verify startup skips hardware scan, the model card is locked to Parakeet, the pill opens without a horizontal jump, first dictation starts without an on-demand model wait, injection shows a short confirmation, and Insights shows the best-window chip when data exists.

- [ ] **Step 4: Commit any verification-only test adjustments**

```bash
git status --short
```

Expected: only the intended feature commits and the existing untracked local Claude settings remain.
