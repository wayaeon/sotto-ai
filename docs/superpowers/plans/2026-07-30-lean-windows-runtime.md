# Lean Windows Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Windows Verba under the lightweight sidecar footprint while idle, unload Parakeet after use, and never leave model workers behind after the host exits.

**Architecture:** The current Python sidecar remains the microphone and IPC host. Its Parakeet worker is spawned on first PTT, reused briefly, then stopped by a single idle timer. Rust owns exactly one sidecar child and marks intentional shutdown before closing it so the existing crash-respawn loop cannot resurrect it.

**Tech Stack:** Tauri 2/Rust, `tauri-plugin-shell`, Python `multiprocessing`, existing pytest contracts.

## Global Constraints

- Windows uses only local Parakeet TDT v3; do not switch model or add a cloud dependency.
- Do not load Parakeet during sidecar startup.
- Keep Ctrl+Alt, touch dictation, and wake phrase behavior unchanged.
- Do not touch files outside the Verba repository.

---

### Task 1: Prevent orphaned sidecars on host exit

**Files:**
- Modify: `src-tauri/src/sidecar.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `tests/test_sidecar_lifecycle_contract.py`

**Interfaces:**
- Produces `sidecar::shutdown_sidecar(app: &AppHandle)`.
- Consumes existing `SidecarState.child: Arc<Mutex<Option<CommandChild>>>`.

- [ ] **Step 1: Write the failing test**

```python
def test_host_exit_marks_sidecar_shutdown_and_prevents_respawn():
    source = (ROOT / "src-tauri/src/sidecar.rs").read_text(encoding="utf-8")
    main = (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8")
    assert "shutting_down" in source
    assert "pub fn shutdown_sidecar" in source
    assert 'json!({"cmd": "quit"})' in source
    assert "RunEvent::ExitRequested" in main
    assert "shutdown_sidecar" in main
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec pytest tests/test_sidecar_lifecycle_contract.py -q`

Expected: FAIL because `shutting_down` and `shutdown_sidecar` do not exist.

- [ ] **Step 3: Write the minimal implementation**

```rust
pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
    pub shutting_down: Arc<AtomicBool>,
}

pub fn shutdown_sidecar(app: &AppHandle) {
    let state = app.state::<SidecarState>();
    state.shutting_down.store(true, Ordering::SeqCst);
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.write(b"{\"cmd\":\"quit\"}\n");
        let _ = child.kill();
    }
}
```

Make the receiver skip `spawn_sidecar` when `shutting_down` is true. In `main.rs`, replace `.run(...)` with `.run(|app, event| ...)` and invoke `shutdown_sidecar` for `tauri::RunEvent::ExitRequested`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec pytest tests/test_sidecar_lifecycle_contract.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sidecar.rs src-tauri/src/main.rs tests/test_sidecar_lifecycle_contract.py
git commit -m "fix: clean up sidecar processes on exit"
```

### Task 2: Make Parakeet demand-loaded and reclaim it after dictation

**Files:**
- Modify: `sidecar/main.py`
- Modify: `sidecar/recorder.py`
- Test: `tests/test_idle_worker_contract.py`

**Interfaces:**
- Produces `Recorder.preload_worker()` and `Recorder.schedule_worker_idle_unload()`.
- Consumes existing `_ensure_worker()` and `_stop_worker()` under `_model_lock`.

- [ ] **Step 1: Write the failing test**

```python
def test_windows_does_not_eagerly_warm_parakeet():
    main = (ROOT / "sidecar/main.py").read_text(encoding="utf-8")
    assert "recorder.warmup" not in main

def test_first_ptt_preloads_and_idle_timer_unloads_worker():
    source = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    assert "def preload_worker" in source
    assert "def schedule_worker_idle_unload" in source
    assert "self.preload_worker()" in source[source.index("def start_ptt"):source.index("def stop_ptt")]
    assert "self.schedule_worker_idle_unload()" in source[source.index("def _fetch_transcription"):]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec pytest tests/test_idle_worker_contract.py -q`

Expected: FAIL because Windows starts `recorder.warmup` and the two lazy-worker methods do not exist.

- [ ] **Step 3: Write the minimal implementation**

```python
_WORKER_IDLE_UNLOAD_S = 45

def preload_worker(self) -> None:
    if self._worker_proc is None or not self._worker_proc.is_alive():
        threading.Thread(target=self._ensure_worker, daemon=True).start()

def schedule_worker_idle_unload(self) -> None:
    if self._worker_idle_timer is not None:
        self._worker_idle_timer.cancel()
    self._worker_idle_timer = threading.Timer(_WORKER_IDLE_UNLOAD_S, self._unload_idle_worker)
    self._worker_idle_timer.daemon = True
    self._worker_idle_timer.start()
```

Cancel the timer at recording start and before model-switch/shutdown. `_unload_idle_worker` must acquire `_model_lock`, return if recording/transcription/hands-free/wake state is active, and call `_stop_worker()` only for an idle worker. Remove the Windows `recorder.warmup` thread from `main.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec pytest tests/test_idle_worker_contract.py tests/test_model_download_sizes.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/main.py sidecar/recorder.py tests/test_idle_worker_contract.py
git commit -m "perf: load Parakeet only during dictation"
```

### Task 3: Verify actual idle and active resource behavior

**Files:**
- Test: `tests/test_sidecar_lifecycle_contract.py`
- Test: `tests/test_idle_worker_contract.py`

- [ ] **Step 1: Run focused checks**

Run: `pnpm exec pytest tests/test_sidecar_lifecycle_contract.py tests/test_idle_worker_contract.py tests/test_pill_and_hotkey_regressions.py tests/test_wakeword_contract.py -q`

Expected: PASS.

- [ ] **Step 2: Compile native host using the temporary target**

Run:

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'sotto-target'
& "$env:USERPROFILE\.cargo\bin\cargo.exe" check --manifest-path src-tauri\Cargo.toml
```

Expected: `Finished` without Rust errors.

- [ ] **Step 3: Measure a clean session**

1. Stop every running Verba development session.
2. Start one `pnpm exec tauri dev` session.
3. At idle, verify Task Manager shows one small sidecar host and no large model worker.
4. Dictate once, verify one worker appears, then wait 45 seconds and verify it exits.
5. Exit Verba and verify no `sidecar.exe` remains from that session.

- [ ] **Step 4: Commit final verification state**

```bash
git status --short
```

Expected: only pre-existing untracked `.claude/` files remain.
