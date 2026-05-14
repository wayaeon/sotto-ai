# Wispr Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform local-first desktop dictation app that clones Wispr Flow's core UX using offline AI STT, streaming word-by-word output, and near-zero latency.

**Architecture:** Tauri v2 (Rust + React/TypeScript) app shell communicates via JSON-lines stdio IPC with a persistent Python sidecar that owns all audio capture, STT inference (faster-whisper + RealtimeSTT), and LLM cleanup. Text injects into the active window and clipboard simultaneously. Global hotkeys match Wispr exactly.

**Tech Stack:** Tauri v2, React 18 + TypeScript + Tailwind CSS, Rust `enigo` crate (text injection), Python 3.11+, RealtimeSTT, faster-whisper, Silero VAD, Ollama (local LLM), Anthropic Haiku API, ElevenLabs Scribe v2 WebSocket, SQLite (`tauri-plugin-sql`), PyInstaller (sidecar bundling), uv (Python env), pnpm (JS), Lemon Squeezy (payments), Cloudflare Worker (license validation).

**Spec:** `docs/superpowers/specs/2026-05-14-wispr-clone-design.md`

---

## File Map

```
wispr-clone/
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs                        # PyInstaller sidecar build step
│   ├── tauri.conf.json
│   ├── capabilities/default.json       # Tauri v2 permissions
│   └── src/
│       ├── main.rs                     # Entry: spawn sidecar, setup tray, windows
│       ├── sidecar.rs                  # Sidecar process lifecycle + IPC read loop
│       ├── hotkeys.rs                  # Global shortcut registration + dispatch
│       ├── injection.rs                # Text injection via enigo
│       ├── tray.rs                     # System tray icon + menu
│       ├── storage.rs                  # SQLite CRUD (transcriptions, settings)
│       ├── license.rs                  # Trial timer, license key validation
│       └── commands.rs                 # Tauri #[command] handlers exposed to frontend
│
├── src/                                # React frontend
│   ├── main.tsx
│   ├── App.tsx                         # Window router (overlay | setup | settings)
│   ├── stores/
│   │   └── appStore.ts                 # Zustand: recording state, words, tier, model
│   ├── hooks/
│   │   ├── useSidecar.ts               # Listen to sidecar events from Tauri backend
│   │   └── useTranscription.ts         # Accumulate streaming words into segments
│   ├── components/
│   │   ├── Overlay.tsx                 # Floating always-on-top pill overlay
│   │   ├── setup/
│   │   │   ├── SetupWizard.tsx         # Wizard shell (step router)
│   │   │   ├── HardwareScan.tsx        # Animated scan + tier result
│   │   │   ├── ModelDownload.tsx       # Progress bar for model download
│   │   │   ├── TestRecording.tsx       # Live test transcription
│   │   │   └── LicenseStep.tsx         # Trial start or key entry
│   │   └── settings/
│   │       ├── Settings.tsx            # Tabbed settings window shell
│   │       ├── GeneralTab.tsx
│   │       ├── ModelsTab.tsx
│   │       ├── HotkeysTab.tsx
│   │       ├── CloudTab.tsx
│   │       ├── HistoryTab.tsx
│   │       └── LicenseTab.tsx
│   └── lib/
│       └── tauri.ts                    # Typed wrappers around invoke() + listen()
│
├── sidecar/
│   ├── main.py                         # Entry: start IPC loop + recorder
│   ├── ipc.py                          # JSON-lines read/write over stdio
│   ├── recorder.py                     # RealtimeSTT wrapper (PTT + hands-free modes)
│   ├── models.py                       # Model enum, paths, download logic
│   ├── hardware.py                     # Detect RAM, GPU, disk → assign tier
│   ├── cleanup.py                      # LLM cleanup (Ollama local + Haiku cloud)
│   ├── cloud.py                        # ElevenLabs Scribe v2 WebSocket client
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── worker/
│   └── license-worker.js               # Cloudflare Worker: license key validation
│
└── tests/
    └── sidecar/
        ├── conftest.py
        ├── test_hardware.py
        ├── test_ipc.py
        ├── test_models.py
        ├── test_cleanup.py
        └── test_cloud.py
```

---

## Prerequisites (run once before starting)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add x86_64-pc-windows-msvc  # or your platform

# Node + pnpm
winget install OpenJS.NodeJS
npm install -g pnpm

# Tauri CLI
cargo install tauri-cli --version "^2"

# Python via uv
winget install astral-sh.uv
uv python install 3.11

# Verify
cargo tauri --version   # should print tauri-cli 2.x
pnpm --version
uv --version
```

---

## Phase 1: Core Dictation Loop

> After this phase: press Ctrl+Win, speak, release — text appears in the active window. Local Whisper, no UI beyond the overlay.

---

### Task 1: Initialize Tauri project + Python sidecar scaffold

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src/main.tsx`
- Create: `sidecar/main.py`
- Create: `sidecar/requirements.txt`

- [ ] **Step 1: Scaffold Tauri app**

```bash
cd "C:/Users/wayaa/Dev Work/Personal/Projects/wispr-clone"
cargo tauri init --app-name wispr-local --window-title "Wispr Local" --frontend-dist ../dist --dev-url http://localhost:1420
pnpm create vite@latest . -- --template react-ts
pnpm install
```

- [ ] **Step 2: Add Tauri plugins to Cargo.toml**

Replace the `[dependencies]` section of `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-ico", "image-png"] }
tauri-plugin-shell = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-stronghold = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
enigo = "0.2"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 3: Configure sidecar in tauri.conf.json**

Add to the existing `tauri.conf.json` under `"bundle"`:

```json
{
  "bundle": {
    "externalBin": ["binaries/sidecar"],
    "resources": []
  },
  "app": {
    "withGlobalTauri": true
  },
  "plugins": {
    "shell": {
      "open": false,
      "sidecar": true
    }
  }
}
```

- [ ] **Step 4: Create sidecar requirements.txt**

```
# sidecar/requirements.txt
RealtimeSTT==0.3.104
faster-whisper==1.1.1
torch==2.5.1
torchaudio==2.5.1
anthropic==0.40.0
websockets==13.1
requests==2.32.3
```

```
# sidecar/requirements-dev.txt
-r requirements.txt
pytest==8.3.4
pytest-asyncio==0.24.0
```

- [ ] **Step 5: Install Python deps**

```bash
cd sidecar
uv venv .venv
uv pip install -r requirements-dev.txt
```

- [ ] **Step 6: Create sidecar stub entry point**

```python
# sidecar/main.py
"""Wispr Local STT sidecar — entry point."""
import sys
import json

def main():
    # Signal ready to Tauri
    print(json.dumps({"event": "ready"}), flush=True)
    # Keep alive — full IPC loop added in Task 3
    for line in sys.stdin:
        line = line.strip()
        if line:
            cmd = json.loads(line)
            if cmd.get("cmd") == "ping":
                print(json.dumps({"event": "pong"}), flush=True)

if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Install pnpm deps and verify build**

```bash
cd "C:/Users/wayaa/Dev Work/Personal/Projects/wispr-clone"
pnpm install
pnpm tauri dev
# App window should open. Close it.
```

Expected: Tauri dev window opens with Vite default page. No errors in terminal.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Tauri + React + Python sidecar scaffold"
```

---

### Task 2: IPC Protocol — Python side

**Files:**
- Create: `sidecar/ipc.py`
- Create: `tests/sidecar/conftest.py`
- Create: `tests/sidecar/test_ipc.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/conftest.py
import sys
import io
import pytest

@pytest.fixture
def mock_stdin(monkeypatch):
    """Replace stdin with a StringIO for testing."""
    def _make(lines: list[str]):
        buf = io.StringIO("\n".join(lines) + "\n")
        monkeypatch.setattr(sys, "stdin", buf)
    return _make

@pytest.fixture
def capture_stdout(monkeypatch, capsys):
    return capsys
```

```python
# tests/sidecar/test_ipc.py
import json
import pytest
import sys
import io
from sidecar.ipc import IPC, Command, Event

def test_send_event_writes_json_line(capsys):
    ipc = IPC()
    ipc.send(Event.READY)
    captured = capsys.readouterr()
    msg = json.loads(captured.out.strip())
    assert msg["event"] == "ready"

def test_send_event_with_data(capsys):
    ipc = IPC()
    ipc.send(Event.WORD, text="hello", partial=True)
    captured = capsys.readouterr()
    msg = json.loads(captured.out.strip())
    assert msg["event"] == "word"
    assert msg["text"] == "hello"
    assert msg["partial"] is True

def test_parse_command_start_ptt():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "start_ptt"}')
    assert cmd == Command.START_PTT

def test_parse_command_stop_ptt():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "stop_ptt"}')
    assert cmd == Command.STOP_PTT

def test_parse_command_toggle_handsfree():
    ipc = IPC()
    cmd = ipc.parse('{"cmd": "toggle_handsfree"}')
    assert cmd == Command.TOGGLE_HANDSFREE

def test_parse_unknown_command_returns_none():
    ipc = IPC()
    result = ipc.parse('{"cmd": "unknown_xyz"}')
    assert result is None

def test_parse_malformed_json_returns_none():
    ipc = IPC()
    result = ipc.parse("not json {{")
    assert result is None
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "C:/Users/wayaa/Dev Work/Personal/Projects/wispr-clone"
uv run pytest tests/sidecar/test_ipc.py -v
```

Expected: `ModuleNotFoundError: No module named 'sidecar'`

- [ ] **Step 3: Implement IPC module**

```python
# sidecar/ipc.py
"""JSON-lines IPC protocol between Tauri sidecar and Rust host."""
import json
import sys
from enum import Enum
from typing import Any


class Command(str, Enum):
    START_PTT = "start_ptt"
    STOP_PTT = "stop_ptt"
    TOGGLE_HANDSFREE = "toggle_handsfree"
    SET_MODEL = "set_model"
    PING = "ping"
    QUIT = "quit"


class Event(str, Enum):
    READY = "ready"
    WORD = "word"
    SEGMENT_DONE = "segment_done"
    ERROR = "error"
    PONG = "pong"
    STATUS = "status"
    HARDWARE = "hardware"
    DOWNLOAD_PROGRESS = "download_progress"


class IPC:
    def send(self, event: Event, **data: Any) -> None:
        msg = {"event": event.value, **data}
        print(json.dumps(msg), flush=True)

    def parse(self, line: str) -> Command | None:
        try:
            obj = json.loads(line.strip())
            cmd_str = obj.get("cmd", "")
            return Command(cmd_str)
        except (json.JSONDecodeError, ValueError):
            return None
```

- [ ] **Step 4: Add sidecar package init + pytest path config**

```python
# sidecar/__init__.py
# (empty — marks sidecar as a package for test imports)
```

```ini
# pytest.ini  (project root)
[pytest]
testpaths = tests
pythonpath = .
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
uv run pytest tests/sidecar/test_ipc.py -v
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add sidecar/ipc.py sidecar/__init__.py tests/sidecar/ pytest.ini
git commit -m "feat: IPC protocol with JSON-lines commands and events"
```

---

### Task 3: IPC loop in sidecar main + Tauri sidecar manager

**Files:**
- Modify: `sidecar/main.py`
- Create: `src-tauri/src/sidecar.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/commands.rs`

- [ ] **Step 1: Implement full IPC loop in sidecar**

```python
# sidecar/main.py
"""Wispr Local STT sidecar — entry point and IPC loop."""
import sys
import threading
from sidecar.ipc import IPC, Command, Event


def main():
    ipc = IPC()
    ipc.send(Event.READY)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        cmd = ipc.parse(line)
        if cmd is None:
            ipc.send(Event.ERROR, msg=f"Unknown command: {line}")
            continue
        if cmd == Command.PING:
            ipc.send(Event.PONG)
        elif cmd == Command.QUIT:
            break
        # START_PTT, STOP_PTT, TOGGLE_HANDSFREE handled after recorder added (Task 5)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create Tauri sidecar manager**

```rust
// src-tauri/src/sidecar.rs
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

/// Spawn the Python sidecar and start forwarding its stdout events to the frontend.
pub fn spawn_sidecar(app: &AppHandle) {
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("sidecar")
        .expect("sidecar binary not found")
        .spawn()
        .expect("failed to spawn sidecar");

    // Store child so we can write to it later
    app.state::<SidecarState>()
        .child
        .lock()
        .unwrap()
        .replace(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line = String::from_utf8_lossy(&line).to_string();
                    // Forward raw JSON to frontend via Tauri event
                    app_handle.emit("sidecar-event", line).ok();
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sidecar stderr] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(e) => {
                    eprintln!("[sidecar error] {e}");
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] terminated with status: {status:?}");
                    break;
                }
                _ => {}
            }
        }
    });
}

/// Send a JSON command to the sidecar via its stdin.
pub fn send_command(app: &AppHandle, cmd: serde_json::Value) {
    let state = app.state::<SidecarState>();
    let mut lock = state.child.lock().unwrap();
    if let Some(child) = lock.as_mut() {
        let line = format!("{}\n", cmd.to_string());
        child.write(line.as_bytes()).ok();
    }
}
```

- [ ] **Step 3: Create commands.rs (Tauri frontend-callable commands)**

```rust
// src-tauri/src/commands.rs
use tauri::AppHandle;
use serde_json::json;
use crate::sidecar::send_command;

#[tauri::command]
pub fn start_ptt(app: AppHandle) {
    send_command(&app, json!({"cmd": "start_ptt"}));
}

#[tauri::command]
pub fn stop_ptt(app: AppHandle) {
    send_command(&app, json!({"cmd": "stop_ptt"}));
}

#[tauri::command]
pub fn toggle_handsfree(app: AppHandle) {
    send_command(&app, json!({"cmd": "toggle_handsfree"}));
}

#[tauri::command]
pub fn ping_sidecar(app: AppHandle) {
    send_command(&app, json!({"cmd": "ping"}));
}
```

- [ ] **Step 4: Wire up main.rs**

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;
mod commands;
mod hotkeys;   // stub — added Task 7
mod injection; // stub — added Task 8
mod tray;      // stub — added Task 10
mod storage;   // stub — added Task 13
mod license;   // stub — added Task 20

use sidecar::SidecarState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(SidecarState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_ptt,
            commands::stop_ptt,
            commands::toggle_handsfree,
            commands::ping_sidecar,
        ])
        .setup(|app| {
            sidecar::spawn_sidecar(&app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Tauri application");
}
```

- [ ] **Step 5: Create stub modules (so it compiles)**

```rust
// src-tauri/src/hotkeys.rs
// Implemented in Task 7
```

```rust
// src-tauri/src/injection.rs
// Implemented in Task 8
```

```rust
// src-tauri/src/tray.rs
// Implemented in Task 10
```

```rust
// src-tauri/src/storage.rs
// Implemented in Task 13
```

```rust
// src-tauri/src/license.rs
// Implemented in Task 20
```

- [ ] **Step 6: Build and verify sidecar launches**

First, compile the Python sidecar to a binary for local dev testing:

```bash
cd sidecar
uv run pyinstaller --onefile --name sidecar main.py
cp dist/sidecar.exe ../src-tauri/binaries/sidecar-x86_64-pc-windows-msvc.exe
```

Then run:

```bash
cd ..
pnpm tauri dev
```

Expected: App launches. In the Tauri devtools console (F12), run:

```js
window.__TAURI__.core.invoke('ping_sidecar')
```

Then listen for the pong:

```js
window.__TAURI__.event.listen('sidecar-event', e => console.log(e.payload))
// Should print: {"event":"pong"}
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/ sidecar/main.py
git commit -m "feat: sidecar spawn, IPC loop, and Tauri command bridge"
```

---

### Task 4: Hardware detection

**Files:**
- Create: `sidecar/hardware.py`
- Create: `tests/sidecar/test_hardware.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/test_hardware.py
from unittest.mock import patch
from sidecar.hardware import HardwareInfo, detect_hardware, ModelTier

def test_tier1_assigned_for_high_ram_amd():
    info = HardwareInfo(ram_gb=32, has_nvidia_cuda=False, free_disk_gb=50)
    assert info.tier == ModelTier.TIER1

def test_tier2_assigned_for_nvidia_gpu():
    info = HardwareInfo(ram_gb=16, has_nvidia_cuda=True, nvidia_vram_gb=8, free_disk_gb=20)
    assert info.tier == ModelTier.TIER2

def test_tier3a_assigned_for_mid_ram_no_gpu():
    info = HardwareInfo(ram_gb=12, has_nvidia_cuda=False, free_disk_gb=10)
    assert info.tier == ModelTier.TIER3_EN

def test_tier4_assigned_for_low_ram():
    info = HardwareInfo(ram_gb=4, has_nvidia_cuda=False, free_disk_gb=5)
    assert info.tier == ModelTier.TIER4_CLOUD

def test_tier4_assigned_for_low_disk():
    info = HardwareInfo(ram_gb=16, has_nvidia_cuda=False, free_disk_gb=0.5)
    assert info.tier == ModelTier.TIER4_CLOUD

def test_detect_hardware_returns_hardware_info():
    with patch("sidecar.hardware.psutil") as mock_psutil:
        mock_psutil.virtual_memory.return_value.total = 32 * 1024**3
        mock_psutil.disk_usage.return_value.free = 100 * 1024**3
        info = detect_hardware()
    assert isinstance(info, HardwareInfo)
    assert info.ram_gb == 32
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
uv run pytest tests/sidecar/test_hardware.py -v
```

Expected: `ModuleNotFoundError: No module named 'sidecar.hardware'`

- [ ] **Step 3: Implement hardware.py**

```python
# sidecar/hardware.py
"""Detect hardware capabilities and assign model tier."""
from __future__ import annotations
import shutil
from dataclasses import dataclass, field
from enum import Enum

import psutil


class ModelTier(str, Enum):
    TIER1 = "tier1"          # ≥16GB RAM, any CPU/AMD — whisper-large-v3-turbo
    TIER2 = "tier2"          # NVIDIA GPU ≥6GB VRAM — parakeet-tdt-1.1b
    TIER3_EN = "tier3_en"    # 6–16GB RAM, English — moonshine-base
    TIER3_ML = "tier3_ml"    # 6–16GB RAM, multilingual — whisper-medium
    TIER4_CLOUD = "tier4"    # <6GB RAM or <1GB disk — redirect to cloud


@dataclass
class HardwareInfo:
    ram_gb: float
    has_nvidia_cuda: bool = False
    nvidia_vram_gb: float = 0.0
    free_disk_gb: float = 0.0
    tier: ModelTier = field(init=False)

    def __post_init__(self):
        self.tier = self._assign_tier()

    def _assign_tier(self) -> ModelTier:
        if self.free_disk_gb < 1.0 or self.ram_gb < 6:
            return ModelTier.TIER4_CLOUD
        if self.has_nvidia_cuda and self.nvidia_vram_gb >= 6:
            return ModelTier.TIER2
        if self.ram_gb >= 16:
            return ModelTier.TIER1
        # 6–16GB
        return ModelTier.TIER3_EN  # setup wizard lets user pick EN vs ML

    def to_dict(self) -> dict:
        return {
            "ram_gb": round(self.ram_gb, 1),
            "has_nvidia_cuda": self.has_nvidia_cuda,
            "nvidia_vram_gb": round(self.nvidia_vram_gb, 1),
            "free_disk_gb": round(self.free_disk_gb, 1),
            "tier": self.tier.value,
        }


def detect_hardware() -> HardwareInfo:
    ram_gb = psutil.virtual_memory().total / 1024**3
    free_disk_gb = psutil.disk_usage("/").free / 1024**3

    has_cuda = False
    vram_gb = 0.0
    try:
        import torch
        has_cuda = torch.cuda.is_available()
        if has_cuda:
            vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
    except ImportError:
        pass

    return HardwareInfo(
        ram_gb=ram_gb,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram_gb,
        free_disk_gb=free_disk_gb,
    )
```

- [ ] **Step 4: Add psutil to requirements**

```
# append to sidecar/requirements.txt
psutil==6.1.0
```

```bash
cd sidecar && uv pip install psutil==6.1.0
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
uv run pytest tests/sidecar/test_hardware.py -v
```

Expected: 6 tests pass.

- [ ] **Step 6: Wire hardware detect into sidecar IPC**

Add to `sidecar/main.py` in the command handler:

```python
# sidecar/main.py — add this import at top
from sidecar.hardware import detect_hardware
from sidecar.ipc import IPC, Command, Event

# Add inside the for loop, after the PING handler:
        elif cmd == Command.DETECT_HARDWARE:
            info = detect_hardware()
            ipc.send(Event.HARDWARE, **info.to_dict())
```

Add `DETECT_HARDWARE = "detect_hardware"` to `Command` enum in `ipc.py`.

- [ ] **Step 7: Commit**

```bash
git add sidecar/hardware.py tests/sidecar/test_hardware.py sidecar/requirements.txt sidecar/main.py sidecar/ipc.py
git commit -m "feat: hardware detection with model tier assignment"
```

---

### Task 5: RealtimeSTT recorder wrapper

**Files:**
- Create: `sidecar/recorder.py`
- Create: `tests/sidecar/test_recorder.py`
- Modify: `sidecar/main.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/test_recorder.py
from unittest.mock import MagicMock, patch, call
from sidecar.recorder import Recorder, RecorderMode

def test_recorder_initializes_with_model():
    with patch("sidecar.recorder.AudioToTextRecorder") as MockRec:
        MockRec.return_value = MagicMock()
        r = Recorder(model="whisper-large-v3-turbo", on_word=lambda w: None, on_segment=lambda t: None)
    MockRec.assert_called_once()
    call_kwargs = MockRec.call_args[1]
    assert call_kwargs["model"] == "whisper-large-v3-turbo"
    assert call_kwargs["enable_realtime_transcription"] is True

def test_recorder_starts_ptt_mode():
    with patch("sidecar.recorder.AudioToTextRecorder") as MockRec:
        mock_instance = MagicMock()
        MockRec.return_value = mock_instance
        r = Recorder(model="tiny", on_word=lambda w: None, on_segment=lambda t: None)
        r.start_ptt()
    assert r.mode == RecorderMode.PTT

def test_recorder_stop_ptt_triggers_transcription():
    words = []
    segments = []
    with patch("sidecar.recorder.AudioToTextRecorder") as MockRec:
        mock_instance = MagicMock()
        MockRec.return_value = mock_instance
        r = Recorder(model="tiny", on_word=words.append, on_segment=segments.append)
        r.start_ptt()
        # Simulate the recorder delivering a segment on stop
        mock_instance.text.return_value = "hello world"
        r.stop_ptt()
    mock_instance.stop.assert_called_once()

def test_recorder_mode_is_idle_initially():
    with patch("sidecar.recorder.AudioToTextRecorder"):
        r = Recorder(model="tiny", on_word=lambda w: None, on_segment=lambda t: None)
    assert r.mode == RecorderMode.IDLE
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
uv run pytest tests/sidecar/test_recorder.py -v
```

Expected: `ModuleNotFoundError: No module named 'sidecar.recorder'`

- [ ] **Step 3: Implement recorder.py**

```python
# sidecar/recorder.py
"""RealtimeSTT wrapper for push-to-talk and hands-free modes."""
from __future__ import annotations
from enum import Enum
from typing import Callable

from RealtimeSTT import AudioToTextRecorder


class RecorderMode(str, Enum):
    IDLE = "idle"
    PTT = "ptt"
    HANDSFREE = "handsfree"


class Recorder:
    """Wraps RealtimeSTT with PTT and hands-free modes.

    Callbacks fire on the RealtimeSTT thread — keep them fast.
    on_word: called with each partial word/phrase during streaming
    on_segment: called with the complete cleaned segment text
    """

    def __init__(
        self,
        model: str,
        on_word: Callable[[str], None],
        on_segment: Callable[[str], None],
        language: str = "",
    ):
        self._on_word = on_word
        self._on_segment = on_segment
        self.mode = RecorderMode.IDLE

        self._recorder = AudioToTextRecorder(
            model=model,
            language=language,
            silero_sensitivity=0.4,
            silero_deactivity_detection=True,
            post_speech_silence_duration=0.5,
            min_length_of_recording=0.3,
            enable_realtime_transcription=True,
            realtime_processing_pause=0.1,
            on_realtime_transcription_update=self._on_partial,
            spinner=False,
            level=0,  # suppress RealtimeSTT logging
        )

    def _on_partial(self, text: str) -> None:
        self._on_word(text)

    def start_ptt(self) -> None:
        """Begin push-to-talk recording."""
        self.mode = RecorderMode.PTT
        self._recorder.start()

    def stop_ptt(self) -> str:
        """Stop push-to-talk and return final transcription."""
        self.mode = RecorderMode.IDLE
        self._recorder.stop()
        text = self._recorder.text()
        if text:
            self._on_segment(text)
        return text or ""

    def toggle_handsfree(self) -> RecorderMode:
        """Toggle continuous hands-free recording on/off."""
        if self.mode == RecorderMode.HANDSFREE:
            self._recorder.stop()
            self.mode = RecorderMode.IDLE
        else:
            self.mode = RecorderMode.HANDSFREE
            # RealtimeSTT handles VAD-driven segmentation automatically
            self._recorder.text(self._on_segment)  # blocking call in thread
        return self.mode

    def shutdown(self) -> None:
        """Graceful shutdown."""
        if self.mode != RecorderMode.IDLE:
            self._recorder.stop()
        self._recorder.shutdown()
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
uv run pytest tests/sidecar/test_recorder.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Wire recorder into sidecar main**

```python
# sidecar/main.py — complete replacement
"""Wispr Local STT sidecar — entry point and IPC loop."""
import sys
import threading
from sidecar.ipc import IPC, Command, Event
from sidecar.hardware import detect_hardware
from sidecar.recorder import Recorder


def main():
    ipc = IPC()
    ipc.send(Event.READY)

    # Default model — overridden by set_model command
    model = "whisper-large-v3-turbo"

    def on_word(text: str):
        ipc.send(Event.WORD, text=text, partial=True)

    def on_segment(text: str):
        ipc.send(Event.SEGMENT_DONE, text=text, final=True)

    recorder = Recorder(model=model, on_word=on_word, on_segment=on_segment)
    ipc.send(Event.STATUS, status="model_loaded", model=model)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        cmd = ipc.parse(line)
        if cmd is None:
            ipc.send(Event.ERROR, msg=f"Unknown command: {line}")
            continue

        if cmd == Command.PING:
            ipc.send(Event.PONG)
        elif cmd == Command.DETECT_HARDWARE:
            info = detect_hardware()
            ipc.send(Event.HARDWARE, **info.to_dict())
        elif cmd == Command.START_PTT:
            recorder.start_ptt()
            ipc.send(Event.STATUS, status="recording_ptt")
        elif cmd == Command.STOP_PTT:
            recorder.stop_ptt()
            ipc.send(Event.STATUS, status="idle")
        elif cmd == Command.TOGGLE_HANDSFREE:
            mode = recorder.toggle_handsfree()
            ipc.send(Event.STATUS, status=f"handsfree_{mode.value}")
        elif cmd == Command.QUIT:
            recorder.shutdown()
            break


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Rebuild sidecar binary and test**

```bash
cd sidecar
uv run pyinstaller --onefile --name sidecar main.py
cp dist/sidecar.exe ../src-tauri/binaries/sidecar-x86_64-pc-windows-msvc.exe
cd ..
pnpm tauri dev
```

In browser devtools:
```js
// Send start_ptt, speak, then stop_ptt
await window.__TAURI__.core.invoke('start_ptt')
// Wait 3s, speak into mic
await window.__TAURI__.core.invoke('stop_ptt')
// Listen for events
window.__TAURI__.event.listen('sidecar-event', e => console.log(e.payload))
```

Expected: You see `{"event":"word","text":"...","partial":true}` lines streaming in, then `{"event":"segment_done","text":"full sentence","final":true}`.

- [ ] **Step 7: Commit**

```bash
git add sidecar/ tests/sidecar/test_recorder.py
git commit -m "feat: RealtimeSTT recorder wrapper with PTT and hands-free modes"
```

---

### Task 6: Frontend — Zustand store + sidecar event listener

**Files:**
- Create: `src/stores/appStore.ts`
- Create: `src/hooks/useSidecar.ts`
- Create: `src/lib/tauri.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Install frontend deps**

```bash
pnpm add zustand @tauri-apps/api @tauri-apps/plugin-shell
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create typed Tauri wrapper**

```typescript
// src/lib/tauri.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type SidecarEvent =
  | { event: "ready" }
  | { event: "pong" }
  | { event: "word"; text: string; partial: boolean }
  | { event: "segment_done"; text: string; final: boolean }
  | { event: "status"; status: string; model?: string }
  | { event: "hardware"; ram_gb: number; tier: string; has_nvidia_cuda: boolean }
  | { event: "error"; msg: string };

export const tauriCommands = {
  startPtt: () => invoke<void>("start_ptt"),
  stopPtt: () => invoke<void>("stop_ptt"),
  toggleHandsfree: () => invoke<void>("toggle_handsfree"),
  ping: () => invoke<void>("ping_sidecar"),
};

export const listenSidecar = (
  cb: (event: SidecarEvent) => void
): Promise<UnlistenFn> =>
  listen<string>("sidecar-event", (e) => {
    try {
      cb(JSON.parse(e.payload) as SidecarEvent);
    } catch {
      console.error("Bad sidecar event:", e.payload);
    }
  });
```

- [ ] **Step 3: Create Zustand store**

```typescript
// src/stores/appStore.ts
import { create } from "zustand";

export type RecordingState = "idle" | "recording_ptt" | "handsfree" | "processing";

interface AppState {
  recordingState: RecordingState;
  streamingWords: string;
  lastSegment: string;
  model: string;
  tier: string;
  setupComplete: boolean;
  trialDaysLeft: number | null;

  setRecordingState: (s: RecordingState) => void;
  appendWords: (text: string) => void;
  setSegmentDone: (text: string) => void;
  setModel: (m: string) => void;
  setTier: (t: string) => void;
  setSetupComplete: (v: boolean) => void;
  resetStreaming: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  recordingState: "idle",
  streamingWords: "",
  lastSegment: "",
  model: "",
  tier: "",
  setupComplete: false,
  trialDaysLeft: null,

  setRecordingState: (s) => set({ recordingState: s }),
  appendWords: (text) => set({ streamingWords: text }),
  setSegmentDone: (text) => set({ lastSegment: text, streamingWords: "" }),
  setModel: (m) => set({ model: m }),
  setTier: (t) => set({ tier: t }),
  setSetupComplete: (v) => set({ setupComplete: v }),
  resetStreaming: () => set({ streamingWords: "", lastSegment: "" }),
}));
```

- [ ] **Step 4: Create sidecar hook**

```typescript
// src/hooks/useSidecar.ts
import { useEffect } from "react";
import { listenSidecar, SidecarEvent } from "../lib/tauri";
import { useAppStore } from "../stores/appStore";

export function useSidecar() {
  const store = useAppStore();

  useEffect(() => {
    const unlisten = listenSidecar((event: SidecarEvent) => {
      switch (event.event) {
        case "word":
          store.appendWords(event.text);
          break;
        case "segment_done":
          store.setSegmentDone(event.text);
          break;
        case "status":
          if (event.status === "recording_ptt") store.setRecordingState("recording_ptt");
          else if (event.status === "idle") store.setRecordingState("idle");
          else if (event.status?.startsWith("handsfree")) store.setRecordingState("handsfree");
          if (event.model) store.setModel(event.model);
          break;
        case "hardware":
          store.setTier(event.tier);
          break;
        case "error":
          console.error("[sidecar]", event.msg);
          break;
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
}
```

- [ ] **Step 5: Wire into App.tsx**

```typescript
// src/App.tsx
import { useSidecar } from "./hooks/useSidecar";
import { Overlay } from "./components/Overlay";
import { useAppStore } from "./stores/appStore";

export default function App() {
  useSidecar(); // Connect to sidecar events

  const { setupComplete } = useAppStore();

  // The overlay is the only window in normal operation.
  // Setup wizard and settings open as separate Tauri windows.
  return <Overlay />;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: Zustand store, sidecar event hook, typed Tauri wrappers"
```

---

### Task 7: Global hotkeys

**Files:**
- Modify: `src-tauri/src/hotkeys.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Implement hotkeys.rs**

```rust
// src-tauri/src/hotkeys.rs
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use crate::sidecar::send_command;
use serde_json::json;

pub fn register_hotkeys(app: &AppHandle) {
    // Ctrl+Win = Push-to-talk
    let ptt_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::Unidentified);

    // Ctrl+Win+Space = Hands-free toggle
    let hf_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::Space);

    // Ctrl+Win+Esc = Cancel
    let cancel_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::Escape);

    let app_ptt = app.clone();
    let app_hf = app.clone();
    let app_cancel = app.clone();

    app.global_shortcut()
        .on_shortcut(ptt_shortcut, move |_app, _shortcut, event| {
            match event.state() {
                ShortcutState::Pressed => send_command(&app_ptt, json!({"cmd": "start_ptt"})),
                ShortcutState::Released => send_command(&app_ptt, json!({"cmd": "stop_ptt"})),
            }
        })
        .unwrap();

    app.global_shortcut()
        .on_shortcut(hf_shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                send_command(&app_hf, json!({"cmd": "toggle_handsfree"}));
            }
        })
        .unwrap();

    app.global_shortcut()
        .on_shortcut(cancel_shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                send_command(&app_cancel, json!({"cmd": "stop_ptt"}));
            }
        })
        .unwrap();
}
```

- [ ] **Step 2: Register hotkeys in main.rs setup**

```rust
// src-tauri/src/main.rs — update setup closure
.setup(|app| {
    sidecar::spawn_sidecar(&app.handle());
    hotkeys::register_hotkeys(&app.handle());
    Ok(())
})
```

- [ ] **Step 3: Add global-shortcut permission**

```json
// src-tauri/capabilities/default.json
{
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main", "overlay", "setup", "settings"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-stdin",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-is-registered"
  ]
}
```

- [ ] **Step 4: Build and test hotkeys manually**

```bash
pnpm tauri build --debug
```

Open the built app, open any text editor, hold `Ctrl+Win`, speak a sentence, release. Verify in sidecar stdout log (visible in terminal running `pnpm tauri dev`) that `start_ptt` and `stop_ptt` commands are received.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/hotkeys.rs src-tauri/src/main.rs src-tauri/capabilities/
git commit -m "feat: global hotkeys Ctrl+Win (PTT) and Ctrl+Win+Space (hands-free)"
```

---

### Task 8: Text injection engine

**Files:**
- Modify: `src-tauri/src/injection.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/sidecar.rs`

- [ ] **Step 1: Implement injection.rs**

```rust
// src-tauri/src/injection.rs
use enigo::{Enigo, Keyboard, Settings, Key, Direction, Coordinate};
use std::sync::Mutex;

pub struct Injector {
    enigo: Mutex<Enigo>,
}

impl Injector {
    pub fn new() -> Self {
        Self {
            enigo: Mutex::new(Enigo::new(&Settings::default()).expect("enigo init failed")),
        }
    }

    /// Type text into the currently focused window.
    pub fn type_text(&self, text: &str) {
        let mut enigo = self.enigo.lock().unwrap();
        // Small delay to ensure focus is on target window
        std::thread::sleep(std::time::Duration::from_millis(50));
        enigo.text(text).ok();
    }

    /// Write text to clipboard (cross-platform via arboard).
    pub fn set_clipboard(&self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            clipboard.set_text(text).ok();
        }
    }

    /// Inject text: type into active window AND copy to clipboard.
    pub fn inject(&self, text: &str) {
        self.set_clipboard(text);
        self.type_text(text);
    }
}
```

- [ ] **Step 2: Add arboard dependency to Cargo.toml**

```toml
# append to [dependencies] in src-tauri/Cargo.toml
arboard = "3"
```

- [ ] **Step 3: Register Injector as managed state + wire to sidecar events**

In `src-tauri/src/sidecar.rs`, update the `CommandEvent::Stdout` handler to detect `segment_done` events and inject:

```rust
// src-tauri/src/sidecar.rs — update Stdout handler inside spawn_sidecar
CommandEvent::Stdout(line) => {
    let line = String::from_utf8_lossy(&line).to_string();
    // Forward to frontend
    app_handle.emit("sidecar-event", line.clone()).ok();

    // Inject text on segment_done
    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
        if msg.get("event").and_then(|e| e.as_str()) == Some("segment_done") {
            if let Some(text) = msg.get("text").and_then(|t| t.as_str()) {
                let injector = app_handle.state::<crate::injection::Injector>();
                injector.inject(text);
            }
        }
    }
}
```

In `main.rs`, add to `.manage()` calls:

```rust
.manage(injection::Injector::new())
```

- [ ] **Step 4: Manual integration test**

With `pnpm tauri dev` running:
1. Open Notepad
2. Click inside Notepad
3. Press and hold `Ctrl+Win`
4. Say "Hello world this is a test"
5. Release `Ctrl+Win`

Expected: "Hello world this is a test" appears in Notepad. Text is also in clipboard.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/injection.rs src-tauri/src/sidecar.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat: text injection via enigo (keystroke) + arboard (clipboard)"
```

---

### Task 9: Streaming overlay window

**Files:**
- Create: `src/components/Overlay.tsx`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add Tailwind CSS**

```bash
pnpm add -D tailwindcss postcss autoprefixer
pnpm exec tailwindcss init -p
```

```js
// tailwind.config.js
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#6d4aff",
        "accent-light": "#a78bfa",
      },
    },
  },
};
```

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: transparent;
  margin: 0;
  overflow: hidden;
}
```

- [ ] **Step 2: Implement Overlay component**

```tsx
// src/components/Overlay.tsx
import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";

type OverlayPhase = "hidden" | "listening" | "streaming" | "done" | "error";

export function Overlay() {
  const { recordingState, streamingWords, lastSegment } = useAppStore();
  const [phase, setPhase] = useState<OverlayPhase>("hidden");

  useEffect(() => {
    if (recordingState === "recording_ptt" || recordingState === "handsfree") {
      setPhase(streamingWords ? "streaming" : "listening");
    } else if (lastSegment) {
      setPhase("done");
      const t = setTimeout(() => setPhase("hidden"), 1500);
      return () => clearTimeout(t);
    } else {
      setPhase("hidden");
    }
  }, [recordingState, streamingWords, lastSegment]);

  if (phase === "hidden") return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full shadow-xl
          text-sm font-medium max-w-[600px] transition-all duration-200
          ${phase === "done" ? "bg-green-900/90 text-green-300" : "bg-zinc-900/95 text-zinc-100"}
        `}
        style={{ backdropFilter: "blur(12px)" }}
      >
        {/* Status dot */}
        {phase === "listening" && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        )}
        {phase === "streaming" && (
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
        )}
        {phase === "done" && <span className="shrink-0">✓</span>}

        {/* Text content */}
        <span className="truncate">
          {phase === "listening" && "Listening..."}
          {phase === "streaming" && (streamingWords || "...")}
          {phase === "done" && lastSegment}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Configure overlay as transparent always-on-top window**

Add to `tauri.conf.json` under `"app"."windows"`:

```json
{
  "app": {
    "windows": [
      {
        "label": "overlay",
        "title": "",
        "width": 700,
        "height": 80,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "resizable": false,
        "url": "index.html",
        "visible": true,
        "focus": false
      }
    ]
  }
}
```

- [ ] **Step 4: Manual test**

```bash
pnpm tauri dev
```

Hold `Ctrl+Win`, speak. Expected: floating pill appears at bottom center, words stream in, turns green with checkmark after injection, fades after 1.5s.

- [ ] **Step 5: Commit**

```bash
git add src/components/Overlay.tsx tailwind.config.js src/index.css src-tauri/tauri.conf.json
git commit -m "feat: streaming overlay with transparent always-on-top window"
```

---

### Task 10: System tray

**Files:**
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Implement tray.rs**

```rust
// src-tauri/src/tray.rs
use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

pub fn setup_tray(app: &AppHandle) {
    let status_item = MenuItem::with_id(app, "status", "Idle — Wispr Local", false, None::<&str>).unwrap();
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>).unwrap();
    let separator = PredefinedMenuItem::separator(app).unwrap();
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).unwrap();

    let menu = Menu::with_items(app, &[
        &status_item,
        &separator,
        &settings_item,
        &separator,
        &quit_item,
    ]).unwrap();

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Wispr Local")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "settings" => {
                // Open settings window (Task 18)
                if let Some(win) = app.get_webview_window("settings") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .unwrap();
}
```

- [ ] **Step 2: Wire tray in main.rs setup**

```rust
// src-tauri/src/main.rs — add to setup closure
tray::setup_tray(&app.handle());
```

- [ ] **Step 3: Manual test**

Build and run. Verify tray icon appears in system tray. Right-click shows menu with "Idle — Wispr Local", Settings, Quit. Quit closes the app.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/src/main.rs
git commit -m "feat: system tray with status, settings, and quit"
```

> **Phase 1 complete.** You can now: press `Ctrl+Win`, speak, release — text injects into any focused window. The overlay shows streaming words. Tray shows status. This is a working dictation app.

---

## Phase 2: Setup Wizard + Local Storage

> After this phase: first-run wizard detects hardware, downloads the right model, lets user test and start trial. Transcription history persisted in SQLite.

---

### Task 11: Model download management

**Files:**
- Create: `sidecar/models.py`
- Create: `tests/sidecar/test_models.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/test_models.py
from unittest.mock import patch, MagicMock
from sidecar.models import ModelConfig, get_model_for_tier, MODEL_REGISTRY
from sidecar.hardware import ModelTier

def test_tier1_returns_large_v3_turbo():
    model = get_model_for_tier(ModelTier.TIER1)
    assert model.model_id == "Systran/faster-whisper-large-v3-turbo"
    assert model.name == "whisper-large-v3-turbo"

def test_tier3_en_returns_moonshine():
    model = get_model_for_tier(ModelTier.TIER3_EN)
    assert "moonshine" in model.name.lower()

def test_tier4_cloud_returns_none():
    model = get_model_for_tier(ModelTier.TIER4_CLOUD)
    assert model is None

def test_all_tiers_have_registry_entry():
    local_tiers = [ModelTier.TIER1, ModelTier.TIER2, ModelTier.TIER3_EN, ModelTier.TIER3_ML]
    for tier in local_tiers:
        assert tier in MODEL_REGISTRY

def test_model_config_has_required_fields():
    model = get_model_for_tier(ModelTier.TIER1)
    assert model.name
    assert model.model_id
    assert model.size_mb > 0
```

- [ ] **Step 2: Implement models.py**

```python
# sidecar/models.py
"""Model registry and download management."""
from __future__ import annotations
from dataclasses import dataclass
from sidecar.hardware import ModelTier
from sidecar.ipc import IPC, Event


@dataclass
class ModelConfig:
    name: str
    model_id: str       # HuggingFace repo or local name for faster-whisper
    size_mb: int
    engine: str         # "faster-whisper" | "moonshine" | "parakeet"
    language: str = ""  # "" = auto-detect


MODEL_REGISTRY: dict[ModelTier, ModelConfig] = {
    ModelTier.TIER1: ModelConfig(
        name="whisper-large-v3-turbo",
        model_id="Systran/faster-whisper-large-v3-turbo",
        size_mb=800,
        engine="faster-whisper",
    ),
    ModelTier.TIER2: ModelConfig(
        name="parakeet-tdt-1.1b",
        model_id="nvidia/parakeet-tdt-1.1b",
        size_mb=2200,
        engine="parakeet",
        language="en",
    ),
    ModelTier.TIER3_EN: ModelConfig(
        name="moonshine-base",
        model_id="UsefulSensors/moonshine-base",
        size_mb=245,
        engine="moonshine",
        language="en",
    ),
    ModelTier.TIER3_ML: ModelConfig(
        name="whisper-medium",
        model_id="Systran/faster-whisper-medium",
        size_mb=769,
        engine="faster-whisper",
    ),
}


def get_model_for_tier(tier: ModelTier) -> ModelConfig | None:
    return MODEL_REGISTRY.get(tier)


def download_model(model: ModelConfig, ipc: IPC) -> None:
    """Download model via HuggingFace hub with progress events."""
    from huggingface_hub import snapshot_download
    import os

    def progress_cb(progress: dict):
        ipc.send(
            Event.DOWNLOAD_PROGRESS,
            model=model.name,
            downloaded_mb=round(progress.get("downloaded", 0) / 1024**2, 1),
            total_mb=model.size_mb,
            pct=round(progress.get("downloaded", 0) / (model.size_mb * 1024**2) * 100, 1),
        )

    snapshot_download(
        repo_id=model.model_id,
        local_dir=os.path.expanduser(f"~/.wispr-local/models/{model.name}"),
    )
    ipc.send(Event.DOWNLOAD_PROGRESS, model=model.name, pct=100.0, done=True)
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest tests/sidecar/test_models.py -v
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add sidecar/models.py tests/sidecar/test_models.py
git commit -m "feat: model registry and download management"
```

---

### Task 12: SQLite storage (Rust side)

**Files:**
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Implement storage.rs with schema migration**

```rust
// src-tauri/src/storage.rs
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: r#"
            CREATE TABLE IF NOT EXISTS transcriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                raw_text TEXT,
                duration_ms INTEGER,
                model_used TEXT,
                app_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('model', 'whisper-large-v3-turbo'),
                ('tier', 'tier1'),
                ('injection_mode', 'both'),
                ('overlay_position', 'bottom-center'),
                ('handsfree_silence_ms', '600'),
                ('setup_complete', 'false'),
                ('trial_start', ''),
                ('license_key', ''),
                ('license_tier', 'trial');
        "#,
        kind: MigrationKind::Up,
    }]
}
```

- [ ] **Step 2: Register migration in main.rs**

```rust
// src-tauri/src/main.rs — update sql plugin registration
.plugin(
    tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:wispr.db", storage::migrations())
        .build()
)
```

- [ ] **Step 3: Add save-transcription command**

```rust
// src-tauri/src/commands.rs — add:
#[tauri::command]
pub async fn save_transcription(
    db: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    text: String,
    raw_text: String,
    duration_ms: i64,
    model_used: String,
) -> Result<(), String> {
    // SQL executed from frontend via tauri-plugin-sql
    // This command is a placeholder — actual SQL called from frontend
    Ok(())
}
```

- [ ] **Step 4: Add frontend DB calls**

```typescript
// src/lib/db.ts
import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:wispr.db");
  return _db;
}

export async function saveTranscription(
  text: string,
  rawText: string,
  durationMs: number,
  modelUsed: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO transcriptions (text, raw_text, duration_ms, model_used) VALUES (?, ?, ?, ?)",
    [text, rawText, durationMs, modelUsed]
  );
}

export async function getTranscriptions(limit = 50): Promise<any[]> {
  const db = await getDb();
  return db.select(
    "SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows: any[] = await db.select(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}
```

- [ ] **Step 5: Call saveTranscription from useSidecar hook when segment arrives**

```typescript
// src/hooks/useSidecar.ts — update "segment_done" case:
case "segment_done":
  store.setSegmentDone(event.text);
  saveTranscription(event.text, event.text, 0, store.model).catch(console.error);
  break;
```

- [ ] **Step 6: Manual test**

Run app, dictate 3 sentences. Open SQLite browser (or install `sqlitebrowser`):

```bash
# check DB file location
ls "$APPDATA/com.wispr-local/wispr.db"
```

Query: `SELECT * FROM transcriptions;` — should show 3 rows.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/storage.rs src-tauri/src/main.rs src/lib/db.ts src/hooks/useSidecar.ts
git commit -m "feat: SQLite schema with transcriptions + settings tables"
```

---

### Task 13: Setup wizard UI

**Files:**
- Create: `src/components/setup/SetupWizard.tsx`
- Create: `src/components/setup/HardwareScan.tsx`
- Create: `src/components/setup/ModelDownload.tsx`
- Create: `src/components/setup/TestRecording.tsx`
- Create: `src/components/setup/LicenseStep.tsx`

- [ ] **Step 1: Create SetupWizard shell**

```tsx
// src/components/setup/SetupWizard.tsx
import { useState } from "react";
import { HardwareScan } from "./HardwareScan";
import { ModelDownload } from "./ModelDownload";
import { TestRecording } from "./TestRecording";
import { LicenseStep } from "./LicenseStep";
import { setSetting } from "../../lib/db";
import { useAppStore } from "../../stores/appStore";

type Step = "scan" | "download" | "test" | "license" | "done";

export function SetupWizard() {
  const [step, setStep] = useState<Step>("scan");
  const { setSetupComplete } = useAppStore();

  const finish = async () => {
    await setSetting("setup_complete", "true");
    setSetupComplete(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2 text-white">Wispr Local</h1>
        <p className="text-zinc-500 text-sm mb-8">Let's get you set up</p>

        {step === "scan" && <HardwareScan onNext={() => setStep("download")} />}
        {step === "download" && <ModelDownload onNext={() => setStep("test")} />}
        {step === "test" && <TestRecording onNext={() => setStep("license")} />}
        {step === "license" && <LicenseStep onNext={finish} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: HardwareScan screen**

```tsx
// src/components/setup/HardwareScan.tsx
import { useEffect, useState } from "react";
import { tauriCommands } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

const TIER_LABELS: Record<string, string> = {
  tier1: "High-End — Whisper Large V3 Turbo",
  tier2: "NVIDIA GPU — Parakeet TDT (fastest)",
  tier3_en: "Mid-Range — Moonshine Base (English)",
  tier3_ml: "Mid-Range — Whisper Medium (multilingual)",
  tier4: "Low-End — Cloud mode recommended",
};

export function HardwareScan({ onNext }: { onNext: () => void }) {
  const [scanning, setScanning] = useState(true);
  const { tier } = useAppStore();

  useEffect(() => {
    tauriCommands.ping(); // ensure sidecar is up
    setTimeout(() => {
      // Trigger hardware detection via sidecar
      import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke("detect_hardware_cmd")
      );
      setTimeout(() => setScanning(false), 2000);
    }, 500);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Scanning your machine...</h2>
      {scanning ? (
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Detecting RAM, GPU, disk space...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Selected model</div>
            <div className="text-white font-medium">{TIER_LABELS[tier] ?? "Detecting..."}</div>
          </div>
          <p className="text-zinc-500 text-sm">
            You can change this anytime in Settings → Models.
          </p>
          <button
            onClick={onNext}
            className="w-full bg-accent hover:bg-accent/80 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Download model →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: ModelDownload screen**

```tsx
// src/components/setup/ModelDownload.tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface DownloadProgress {
  model: string;
  pct: number;
  downloaded_mb?: number;
  total_mb?: number;
  done?: boolean;
}

export function ModelDownload({ onNext }: { onNext: () => void }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const unlisten = listen<string>("sidecar-event", (e) => {
      try {
        const msg = JSON.parse(e.payload);
        if (msg.event === "download_progress") {
          setProgress(msg);
          if (msg.done) setDone(true);
        }
      } catch {}
    });

    // Trigger download via sidecar
    import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("start_model_download")
    );

    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Downloading model</h2>
      {!done ? (
        <div className="space-y-3">
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress?.pct ?? 0}%` }}
            />
          </div>
          <div className="text-sm text-zinc-500">
            {progress
              ? `${progress.downloaded_mb?.toFixed(0) ?? 0} MB / ${progress.total_mb} MB`
              : "Starting download..."}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-green-400">✓ Model ready</div>
          <button
            onClick={onNext}
            className="w-full bg-accent hover:bg-accent/80 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Test it out →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: TestRecording screen**

```tsx
// src/components/setup/TestRecording.tsx
import { useState } from "react";
import { tauriCommands } from "../../lib/tauri";
import { useAppStore } from "../../stores/appStore";

export function TestRecording({ onNext }: { onNext: () => void }) {
  const [recording, setRecording] = useState(false);
  const { streamingWords, lastSegment, resetStreaming } = useAppStore();

  const handleRecord = async () => {
    if (!recording) {
      resetStreaming();
      setRecording(true);
      await tauriCommands.startPtt();
    } else {
      setRecording(false);
      await tauriCommands.stopPtt();
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Try it out</h2>
      <p className="text-zinc-400 text-sm">Hold the button and say something. Release when done.</p>

      <button
        onMouseDown={handleRecord}
        onMouseUp={handleRecord}
        className={`w-full py-6 rounded-xl font-medium text-lg transition-all ${
          recording
            ? "bg-red-600 text-white scale-95"
            : "bg-zinc-800 hover:bg-zinc-700 text-white"
        }`}
      >
        {recording ? "🔴 Recording..." : "Hold to record"}
      </button>

      {(streamingWords || lastSegment) && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 min-h-16">
          <div className="text-zinc-300">
            {streamingWords || lastSegment}
          </div>
        </div>
      )}

      {lastSegment && (
        <button
          onClick={onNext}
          className="w-full bg-accent hover:bg-accent/80 text-white py-3 rounded-xl font-medium transition-colors"
        >
          Looks good →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: LicenseStep screen**

```tsx
// src/components/setup/LicenseStep.tsx
import { useState } from "react";
import { setSetting } from "../../lib/db";

export function LicenseStep({ onNext }: { onNext: () => void }) {
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<"choice" | "enter-key">("choice");

  const startTrial = async () => {
    await setSetting("trial_start", new Date().toISOString());
    await setSetting("license_tier", "trial");
    onNext();
  };

  const activateKey = async () => {
    // Validation happens in Task 20 (license module)
    // For now, store and proceed
    await setSetting("license_key", key.trim());
    await setSetting("license_tier", "local");
    onNext();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Start using Wispr Local</h2>

      {mode === "choice" ? (
        <div className="space-y-3">
          <button
            onClick={startTrial}
            className="w-full bg-accent hover:bg-accent/80 text-white py-4 rounded-xl font-medium transition-colors"
          >
            Start 14-day free trial
          </button>
          <button
            onClick={() => setMode("enter-key")}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-4 rounded-xl font-medium transition-colors"
          >
            I have a license key
          </button>
          <p className="text-zinc-600 text-xs text-center">No card required for trial</p>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-accent"
          />
          <button
            onClick={activateKey}
            disabled={!key.trim()}
            className="w-full bg-accent hover:bg-accent/80 disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Activate
          </button>
          <button onClick={() => setMode("choice")} className="text-zinc-600 text-sm w-full text-center">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire setup wizard into App.tsx**

```tsx
// src/App.tsx — update
import { useEffect } from "react";
import { useSidecar } from "./hooks/useSidecar";
import { Overlay } from "./components/Overlay";
import { SetupWizard } from "./components/setup/SetupWizard";
import { useAppStore } from "./stores/appStore";
import { getSetting } from "./lib/db";

export default function App() {
  useSidecar();
  const { setupComplete, setSetupComplete } = useAppStore();

  useEffect(() => {
    getSetting("setup_complete").then((v) => {
      if (v === "true") setSetupComplete(true);
    });
  }, []);

  if (!setupComplete) return <SetupWizard />;
  return <Overlay />;
}
```

- [ ] **Step 7: Manual test — run full wizard**

```bash
pnpm tauri dev
```

Expected: Wizard shows scan → download → test → license. After completion, normal overlay mode.

- [ ] **Step 8: Commit**

```bash
git add src/components/setup/
git commit -m "feat: first-run setup wizard with hardware scan, model download, test recording, license"
```

> **Phase 2 complete.** First-run wizard detects hardware, downloads the right model, lets user test. Transcriptions saved to SQLite.

---

## Phase 3: LLM Cleanup + Cloud STT

> After this phase: transcription text is cleaned up (punctuation, filler words). ElevenLabs cloud STT available as alternative.

---

### Task 14: LLM cleanup pipeline

**Files:**
- Create: `sidecar/cleanup.py`
- Create: `tests/sidecar/test_cleanup.py`
- Modify: `sidecar/recorder.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/test_cleanup.py
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from sidecar.cleanup import LocalCleanup, CloudCleanup, CleanupMode, clean_text

def test_clean_text_noop_when_disabled():
    result = clean_text("um hello uh world", mode=CleanupMode.NONE)
    assert result == "um hello uh world"

def test_local_cleanup_calls_ollama():
    mock_response = MagicMock()
    mock_response.json.return_value = {"response": "Hello, world."}
    with patch("sidecar.cleanup.requests.post", return_value=mock_response) as mock_post:
        cleanup = LocalCleanup(model="qwen3:4b")
        result = cleanup.clean("um hello uh world")
    mock_post.assert_called_once()
    assert result == "Hello, world."

def test_local_cleanup_falls_back_on_error():
    with patch("sidecar.cleanup.requests.post", side_effect=Exception("connection refused")):
        cleanup = LocalCleanup(model="qwen3:4b")
        result = cleanup.clean("hello world")
    assert result == "hello world"  # returns original on failure

def test_cloud_cleanup_calls_anthropic():
    mock_client = MagicMock()
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="Hello, world.")]
    mock_client.messages.create.return_value = mock_message
    cleanup = CloudCleanup(client=mock_client)
    result = cleanup.clean("um hello uh world")
    assert result == "Hello, world."
    mock_client.messages.create.assert_called_once()
```

- [ ] **Step 2: Implement cleanup.py**

```python
# sidecar/cleanup.py
"""LLM-based transcription cleanup — local (Ollama) and cloud (Claude Haiku)."""
from __future__ import annotations
from enum import Enum
from typing import TYPE_CHECKING

import requests

if TYPE_CHECKING:
    import anthropic


CLEANUP_SYSTEM_PROMPT = (
    "You are a transcription editor. Clean up the following raw speech transcription: "
    "remove filler words (um, uh, like, you know), fix punctuation and capitalization, "
    "remove obvious repetitions. Preserve the speaker's meaning exactly. "
    "Return ONLY the cleaned text, nothing else."
)


class CleanupMode(str, Enum):
    NONE = "none"
    LOCAL = "local"
    CLOUD = "cloud"


def clean_text(text: str, mode: CleanupMode = CleanupMode.NONE, **kwargs) -> str:
    if mode == CleanupMode.NONE or not text.strip():
        return text
    if mode == CleanupMode.LOCAL:
        return LocalCleanup(**kwargs).clean(text)
    if mode == CleanupMode.CLOUD:
        return CloudCleanup(**kwargs).clean(text)
    return text


class LocalCleanup:
    def __init__(self, model: str = "qwen3:4b", ollama_url: str = "http://localhost:11434"):
        self._model = model
        self._url = f"{ollama_url}/api/generate"

    def clean(self, text: str) -> str:
        try:
            resp = requests.post(
                self._url,
                json={
                    "model": self._model,
                    "prompt": f"{CLEANUP_SYSTEM_PROMPT}\n\nText: {text}",
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 300},
                },
                timeout=8,
            )
            return resp.json().get("response", text).strip()
        except Exception:
            return text  # always return something


class CloudCleanup:
    def __init__(self, client=None, api_key: str = ""):
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
        self._client = client

    def clean(self, text: str) -> str:
        try:
            msg = self._client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system=CLEANUP_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": text}],
            )
            return msg.content[0].text.strip()
        except Exception:
            return text
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest tests/sidecar/test_cleanup.py -v
```

Expected: 4 tests pass.

- [ ] **Step 4: Integrate cleanup into recorder's segment callback**

```python
# sidecar/main.py — update on_segment to run cleanup
from sidecar.cleanup import CleanupMode, clean_text

cleanup_mode = CleanupMode.NONE  # set from settings on startup

def on_segment(text: str):
    cleaned = clean_text(text, mode=cleanup_mode)
    ipc.send(Event.SEGMENT_DONE, text=cleaned, raw_text=text, final=True)
```

- [ ] **Step 5: Commit**

```bash
git add sidecar/cleanup.py tests/sidecar/test_cleanup.py sidecar/main.py
git commit -m "feat: LLM cleanup pipeline — local Ollama and cloud Haiku"
```

---

### Task 15: ElevenLabs cloud STT

**Files:**
- Create: `sidecar/cloud.py`
- Create: `tests/sidecar/test_cloud.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/sidecar/test_cloud.py
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from sidecar.cloud import ElevenLabsClient

def test_elevenlabs_client_initializes_with_api_key():
    client = ElevenLabsClient(api_key="test-key")
    assert client._api_key == "test-key"
    assert "wss://api.elevenlabs.io" in client._ws_url

def test_elevenlabs_client_raises_without_api_key():
    with pytest.raises(ValueError, match="API key required"):
        ElevenLabsClient(api_key="")

def test_build_auth_header():
    client = ElevenLabsClient(api_key="sk-abc123")
    headers = client._build_headers()
    assert headers["xi-api-key"] == "sk-abc123"
```

- [ ] **Step 2: Implement cloud.py**

```python
# sidecar/cloud.py
"""ElevenLabs Scribe v2 Realtime WebSocket client."""
from __future__ import annotations
import asyncio
import json
from typing import Callable

import websockets


class ElevenLabsClient:
    """Streams audio to ElevenLabs Scribe v2 Realtime and yields transcription events."""

    _ws_url = "wss://api.elevenlabs.io/v1/speech-to-text/stream"

    def __init__(self, api_key: str, language: str = ""):
        if not api_key:
            raise ValueError("API key required for ElevenLabs cloud STT")
        self._api_key = api_key
        self._language = language
        self._ws = None
        self._running = False

    def _build_headers(self) -> dict:
        return {"xi-api-key": self._api_key}

    async def stream(
        self,
        audio_iter,
        on_partial: Callable[[str], None],
        on_final: Callable[[str], None],
    ) -> None:
        """Connect to ElevenLabs, stream audio chunks, receive transcription events."""
        params = "?model_id=scribe_v2"
        if self._language:
            params += f"&language_code={self._language}"

        async with websockets.connect(
            self._ws_url + params,
            additional_headers=self._build_headers(),
        ) as ws:
            self._ws = ws
            self._running = True

            async def _send_audio():
                async for chunk in audio_iter:
                    if not self._running:
                        break
                    await ws.send(chunk)
                await ws.send(json.dumps({"type": "end_of_stream"}))

            async def _receive():
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("type") == "partial":
                        on_partial(msg.get("text", ""))
                    elif msg.get("type") == "final":
                        on_final(msg.get("text", ""))
                        break

            await asyncio.gather(_send_audio(), _receive())

    def stop(self) -> None:
        self._running = False
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest tests/sidecar/test_cloud.py -v
```

Expected: 3 tests pass.

- [ ] **Step 4: Add cloud mode switch command to IPC**

Add `SET_MODE = "set_mode"` to `Command` enum in `ipc.py`.

In `sidecar/main.py`:

```python
elif cmd == Command.SET_MODE:
    import json as _json
    raw = _json.loads(line)
    new_mode = raw.get("mode", "local")
    # Recorder switches between local Whisper and ElevenLabs (Task 15 wiring)
    ipc.send(Event.STATUS, status=f"mode_set_{new_mode}")
```

- [ ] **Step 5: Commit**

```bash
git add sidecar/cloud.py tests/sidecar/test_cloud.py sidecar/ipc.py sidecar/main.py
git commit -m "feat: ElevenLabs Scribe v2 WebSocket client for cloud STT"
```

> **Phase 3 complete.** Transcriptions are cleaned via Ollama locally or Haiku in the cloud. ElevenLabs cloud STT available for low-end machines.

---

## Phase 4: Licensing + Settings UI + Distribution

---

### Task 16: Cloudflare Worker — license validation

**Files:**
- Create: `worker/license-worker.js`

- [ ] **Step 1: Write the Cloudflare Worker**

Deploy this to Cloudflare Workers (free tier sufficient):

```javascript
// worker/license-worker.js
/**
 * Wispr Local license validation worker.
 * KV namespace: LICENSE_KEYS  (key → JSON metadata)
 * KV namespace: ACTIVATIONS   (machineId → licenseKey)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/validate" && request.method === "POST") {
      return handleValidate(request, env);
    }
    if (path === "/activate" && request.method === "POST") {
      return handleActivate(request, env);
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404, headers: CORS,
    });
  },
};

async function handleValidate(request, env) {
  const { key, machine_id } = await request.json();
  if (!key || !machine_id) {
    return json({ valid: false, reason: "missing_params" });
  }

  const meta = await env.LICENSE_KEYS.get(key, "json");
  if (!meta) return json({ valid: false, reason: "invalid_key" });
  if (meta.revoked) return json({ valid: false, reason: "revoked" });

  // Check activation slot
  const existing = await env.ACTIVATIONS.get(machine_id);
  if (existing && existing !== key) {
    return json({ valid: false, reason: "machine_limit" });
  }

  return json({ valid: true, tier: meta.tier, expires_at: meta.expires_at ?? null });
}

async function handleActivate(request, env) {
  const { key, machine_id } = await request.json();
  const meta = await env.LICENSE_KEYS.get(key, "json");
  if (!meta || meta.revoked) return json({ activated: false, reason: "invalid_key" });

  // Count existing activations
  const activationCount = meta.activation_count ?? 0;
  if (activationCount >= 3) return json({ activated: false, reason: "activation_limit" });

  await env.ACTIVATIONS.put(machine_id, key);
  meta.activation_count = activationCount + 1;
  await env.LICENSE_KEYS.put(key, JSON.stringify(meta));

  return json({ activated: true, tier: meta.tier });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
```

- [ ] **Step 2: Deploy worker**

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

cd worker
# Create wrangler.toml
cat > wrangler.toml << 'EOF'
name = "wispr-local-license"
main = "license-worker.js"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "LICENSE_KEYS"
id = "YOUR_KV_NAMESPACE_ID"

[[kv_namespaces]]
binding = "ACTIVATIONS"
id = "YOUR_ACTIVATIONS_KV_ID"
EOF

wrangler kv:namespace create LICENSE_KEYS
wrangler kv:namespace create ACTIVATIONS
# Paste the IDs into wrangler.toml above

wrangler deploy
```

Expected: Worker deployed to `https://wispr-local-license.YOUR_SUBDOMAIN.workers.dev`

- [ ] **Step 3: Commit**

```bash
git add worker/
git commit -m "feat: Cloudflare Worker for license key validation"
```

---

### Task 17: License module (Rust)

**Files:**
- Modify: `src-tauri/src/license.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Implement license.rs**

```rust
// src-tauri/src/license.rs
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

const WORKER_URL: &str = "https://wispr-local-license.YOUR_SUBDOMAIN.workers.dev";
const TRIAL_DAYS: u64 = 14;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum LicenseTier {
    Trial,
    Local,
    Cloud,
    Expired,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub tier: LicenseTier,
    pub days_left: Option<i64>,
    pub valid: bool,
}

pub fn get_machine_id() -> String {
    // Use a stable machine identifier
    machine_uid::get().unwrap_or_else(|_| "unknown".to_string())
}

pub fn check_trial(trial_start_iso: &str) -> LicenseStatus {
    let Ok(start) = chrono::DateTime::parse_from_rfc3339(trial_start_iso) else {
        return LicenseStatus { tier: LicenseTier::Expired, days_left: Some(0), valid: false };
    };
    let now = chrono::Utc::now();
    let elapsed_days = (now - start.with_timezone(&chrono::Utc)).num_days();
    let days_left = TRIAL_DAYS as i64 - elapsed_days;

    if days_left > 0 {
        LicenseStatus { tier: LicenseTier::Trial, days_left: Some(days_left), valid: true }
    } else {
        LicenseStatus { tier: LicenseTier::Expired, days_left: Some(0), valid: false }
    }
}

pub async fn validate_key(key: &str) -> Result<LicenseStatus, String> {
    let machine_id = get_machine_id();
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{WORKER_URL}/validate"))
        .json(&serde_json::json!({"key": key, "machine_id": machine_id}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let valid = body["valid"].as_bool().unwrap_or(false);
    let tier = match body["tier"].as_str() {
        Some("local") => LicenseTier::Local,
        Some("cloud") => LicenseTier::Cloud,
        _ => LicenseTier::Expired,
    };

    Ok(LicenseStatus { tier, days_left: None, valid })
}
```

- [ ] **Step 2: Add license commands**

```rust
// src-tauri/src/commands.rs — add detect_hardware_cmd and start_model_download:
#[tauri::command]
pub fn detect_hardware_cmd(app: AppHandle) {
    send_command(&app, json!({"cmd": "detect_hardware"}));
}

#[tauri::command]
pub fn start_model_download(app: AppHandle) {
    send_command(&app, json!({"cmd": "download_model"}));
}
```

Register both in `main.rs` `.invoke_handler`:

```rust
commands::detect_hardware_cmd,
commands::start_model_download,
```

```rust
// src-tauri/src/commands.rs — also add:
#[tauri::command]
pub async fn check_license(trial_start: String) -> crate::license::LicenseStatus {
    if trial_start.is_empty() {
        return crate::license::LicenseStatus {
            tier: crate::license::LicenseTier::Trial,
            days_left: Some(14),
            valid: true,
        };
    }
    crate::license::check_trial(&trial_start)
}

#[tauri::command]
pub async fn activate_license(key: String) -> Result<crate::license::LicenseStatus, String> {
    crate::license::validate_key(&key).await
}
```

- [ ] **Step 3: Add deps to Cargo.toml**

```toml
reqwest = { version = "0.12", features = ["json"] }
chrono = "0.4"
machine-uid = "0.5"
```

- [ ] **Step 4: Register new commands in main.rs**

```rust
.invoke_handler(tauri::generate_handler![
    commands::start_ptt,
    commands::stop_ptt,
    commands::toggle_handsfree,
    commands::ping_sidecar,
    commands::check_license,
    commands::activate_license,
])
```

- [ ] **Step 5: Manual test**

In browser devtools:
```js
await window.__TAURI__.core.invoke('check_license', { trialStart: new Date().toISOString() })
// Should return { tier: "Trial", days_left: 14, valid: true }
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license.rs src-tauri/src/commands.rs src-tauri/Cargo.toml
git commit -m "feat: license validation — trial countdown and key activation"
```

---

### Task 18: Settings UI

**Files:**
- Create: `src/components/settings/Settings.tsx`
- Create: `src/components/settings/GeneralTab.tsx`
- Create: `src/components/settings/ModelsTab.tsx`
- Create: `src/components/settings/HistoryTab.tsx`
- Create: `src/components/settings/LicenseTab.tsx`

- [ ] **Step 1: Settings shell**

```tsx
// src/components/settings/Settings.tsx
import { useState } from "react";
import { GeneralTab } from "./GeneralTab";
import { ModelsTab } from "./ModelsTab";
import { HistoryTab } from "./HistoryTab";
import { LicenseTab } from "./LicenseTab";

type Tab = "general" | "models" | "history" | "license";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "license", label: "License" },
];

export function Settings() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <div className="w-44 bg-zinc-900 border-r border-zinc-800 p-4 shrink-0">
        <div className="text-sm font-semibold text-zinc-300 mb-4">Settings</div>
        <nav className="space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? "bg-accent/20 text-accent-light font-medium"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {tab === "general" && <GeneralTab />}
        {tab === "models" && <ModelsTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "license" && <LicenseTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: GeneralTab**

```tsx
// src/components/settings/GeneralTab.tsx
import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../../lib/db";

export function GeneralTab() {
  const [injectionMode, setInjectionMode] = useState("both");
  const [overlayPos, setOverlayPos] = useState("bottom-center");

  useEffect(() => {
    getSetting("injection_mode").then((v) => v && setInjectionMode(v));
    getSetting("overlay_position").then((v) => v && setOverlayPos(v));
  }, []);

  const save = async (key: string, value: string) => {
    await setSetting(key, value);
  };

  return (
    <div className="space-y-8 max-w-lg">
      <h2 className="text-xl font-semibold">General</h2>

      <div>
        <label className="text-sm text-zinc-400 block mb-2">Text output mode</label>
        <select
          value={injectionMode}
          onChange={(e) => { setInjectionMode(e.target.value); save("injection_mode", e.target.value); }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white w-full"
        >
          <option value="both">Inject + Clipboard (default)</option>
          <option value="inject">Inject only</option>
          <option value="clipboard">Clipboard only</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-zinc-400 block mb-2">Overlay position</label>
        <select
          value={overlayPos}
          onChange={(e) => { setOverlayPos(e.target.value); save("overlay_position", e.target.value); }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white w-full"
        >
          <option value="bottom-center">Bottom center</option>
          <option value="near-cursor">Near cursor</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: HistoryTab**

```tsx
// src/components/settings/HistoryTab.tsx
import { useEffect, useState } from "react";
import { getTranscriptions } from "../../lib/db";

interface Transcription {
  id: number;
  text: string;
  model_used: string;
  created_at: string;
}

export function HistoryTab() {
  const [items, setItems] = useState<Transcription[]>([]);

  useEffect(() => {
    getTranscriptions(100).then((rows) => setItems(rows as Transcription[]));
  }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transcription History</h2>
        <span className="text-zinc-500 text-sm">{items.length} entries</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <div className="text-sm text-zinc-200">{item.text}</div>
            <div className="text-xs text-zinc-600 mt-1">
              {new Date(item.created_at).toLocaleString()} · {item.model_used}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-zinc-600 text-sm">No transcriptions yet.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: LicenseTab**

```tsx
// src/components/settings/LicenseTab.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../../lib/db";

export function LicenseTab() {
  const [status, setStatus] = useState<any>(null);
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSetting("trial_start").then((start) => {
      invoke("check_license", { trialStart: start ?? "" }).then(setStatus);
    });
  }, []);

  const activate = async () => {
    setActivating(true);
    setError("");
    try {
      const result = await invoke<any>("activate_license", { key });
      if (result.valid) {
        setStatus(result);
      } else {
        setError("Invalid license key. Please check and try again.");
      }
    } catch (e) {
      setError(String(e));
    }
    setActivating(false);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">License</h2>
      {status && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${status.valid ? "text-green-400" : "text-red-400"}`}>
              {status.tier}
            </span>
            {status.days_left !== null && (
              <span className="text-zinc-500 text-sm">· {status.days_left} days remaining</span>
            )}
          </div>
        </div>
      )}
      <div className="space-y-3">
        <label className="text-sm text-zinc-400">Activate license key</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={activate}
          disabled={!key.trim() || activating}
          className="bg-accent hover:bg-accent/80 disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {activating ? "Activating..." : "Activate"}
        </button>
      </div>
      <div className="border-t border-zinc-800 pt-6">
        <a
          href="https://wispr-local.lemonsqueezy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-light text-sm hover:underline"
        >
          Purchase a license ($15 one-time) →
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4b: ModelsTab, HotkeysTab, CloudTab**

```tsx
// src/components/settings/ModelsTab.tsx
import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../../lib/db";

const MODELS = [
  { value: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo (recommended)" },
  { value: "moonshine-base", label: "Moonshine Base (English, ultra-fast)" },
  { value: "whisper-medium", label: "Whisper Medium (multilingual)" },
  { value: "whisper-large-v3", label: "Whisper Large V3 (highest accuracy)" },
];

export function ModelsTab() {
  const [model, setModel] = useState("whisper-large-v3-turbo");
  const [cleanup, setCleanup] = useState("none");

  useEffect(() => {
    getSetting("model").then((v) => v && setModel(v));
    getSetting("cleanup_mode").then((v) => v && setCleanup(v));
  }, []);

  const save = async (key: string, value: string) => setSetting(key, value);

  return (
    <div className="space-y-8 max-w-lg">
      <h2 className="text-xl font-semibold">Models</h2>
      <div>
        <label className="text-sm text-zinc-400 block mb-2">Local STT model</label>
        <select
          value={model}
          onChange={(e) => { setModel(e.target.value); save("model", e.target.value); }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white w-full"
        >
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <p className="text-zinc-600 text-xs mt-2">Changing model restarts the STT engine (~5s).</p>
      </div>
      <div>
        <label className="text-sm text-zinc-400 block mb-2">LLM text cleanup</label>
        <select
          value={cleanup}
          onChange={(e) => { setCleanup(e.target.value); save("cleanup_mode", e.target.value); }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white w-full"
        >
          <option value="none">None (raw transcription)</option>
          <option value="local">Local — Ollama (qwen3:4b)</option>
          <option value="cloud">Cloud — Claude Haiku</option>
        </select>
      </div>
    </div>
  );
}
```

```tsx
// src/components/settings/HotkeysTab.tsx
export function HotkeysTab() {
  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">Hotkeys</h2>
      <div className="space-y-3">
        {[
          { action: "Push-to-talk", key: "Ctrl + Win (hold)" },
          { action: "Hands-free toggle", key: "Ctrl + Win + Space" },
          { action: "Cancel recording", key: "Ctrl + Win + Esc" },
        ].map(({ action, key }) => (
          <div key={action} className="flex justify-between items-center bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800">
            <span className="text-zinc-300 text-sm">{action}</span>
            <kbd className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded font-mono">{key}</kbd>
          </div>
        ))}
      </div>
      <p className="text-zinc-600 text-xs">Custom hotkey remapping coming in v1.1.</p>
    </div>
  );
}
```

```tsx
// src/components/settings/CloudTab.tsx
import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../../lib/db";

export function CloudTab() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting("elevenlabs_key").then((v) => v && setApiKey(v));
  }, []);

  const save = async () => {
    await setSetting("elevenlabs_key", apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">Cloud STT</h2>
      <p className="text-zinc-500 text-sm">
        Used when local model is unavailable or you prefer cloud accuracy (ElevenLabs Scribe v2, 2.3% WER).
      </p>
      <div>
        <label className="text-sm text-zinc-400 block mb-2">ElevenLabs API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600"
        />
      </div>
      <button
        onClick={save}
        className="bg-accent hover:bg-accent/80 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
```

Update `Settings.tsx` to import all tabs:

```tsx
import { ModelsTab } from "./ModelsTab";
import { HotkeysTab } from "./HotkeysTab";
import { CloudTab } from "./CloudTab";
```

And add `{ id: "hotkeys", label: "Hotkeys" }` and `{ id: "cloud", label: "Cloud" }` to the TABS array.

- [ ] **Step 5: Open settings window from tray**

Add settings window config to `tauri.conf.json`:

```json
{
  "label": "settings",
  "title": "Wispr Local — Settings",
  "width": 720,
  "height": 540,
  "decorations": true,
  "visible": false,
  "url": "settings.html"
}
```

Create `src/settings.tsx` entry that renders `<Settings />`.

- [ ] **Step 6: Manual test**

Right-click tray → Settings. Window opens with sidebar tabs. History shows transcriptions. License shows trial countdown.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/
git commit -m "feat: settings UI — general, models, history, license tabs"
```

---

### Task 19: Auto-update + distribution

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Enable Tauri updater**

Add to `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/YOUR_GITHUB_USERNAME/wispr-local/releases/latest/download/latest.json"
      ],
      "dialog": true,
      "pubkey": "YOUR_TAURI_UPDATER_PUBLIC_KEY"
    }
  }
}
```

Generate updater key:

```bash
cargo tauri signer generate -w ~/.tauri/wispr-local.key
# Copy the public key to tauri.conf.json above
```

- [ ] **Step 2: Create GitHub Actions release workflow**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    strategy:
      matrix:
        include:
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
          - platform: macos-latest
            target: x86_64-apple-darwin
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with: { python-version: "3.11" }

      - name: Install uv
        run: pip install uv

      - name: Install Python deps
        run: cd sidecar && uv pip install -r requirements.txt

      - name: Build sidecar binary
        run: |
          cd sidecar
          uv run pyinstaller --onefile --name sidecar main.py
          mkdir -p ../src-tauri/binaries
          cp dist/sidecar* ../src-tauri/binaries/

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with: { targets: ${{ matrix.target }} }

      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: 20 }

      - run: npm install -g pnpm && pnpm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Wispr Local ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md for details."
          releaseDraft: true
```

- [ ] **Step 3: Push a test tag**

```bash
git tag v0.1.0
git push origin v0.1.0
```

Expected: GitHub Actions builds installers for Windows, macOS, Linux. Releases page shows draft release with `.exe`, `.dmg`, `.AppImage`.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/
git commit -m "ci: GitHub Actions release workflow for Windows, macOS, Linux"
```

---

> **Phase 4 complete.** Licensing, settings, and cross-platform distribution are done.

---

## Testing Checklist (manual, full integration)

Run through these before tagging a release:

- [ ] Fresh install on Windows — setup wizard completes, model downloads, test recording works
- [ ] Hold `Ctrl+Win` → speak → release → text appears in Notepad
- [ ] `Ctrl+Win+Space` → speak two sentences → both appear in active window
- [ ] `Ctrl+Win+Esc` → cancels without injecting
- [ ] System tray shows "Idle", updates to "Recording" during PTT
- [ ] Transcription history shows in Settings → History
- [ ] Trial countdown shows in Settings → License
- [ ] License key activation flow (use a test key from KV store)
- [ ] Cloud STT: enter ElevenLabs API key → record → transcription via API
- [ ] macOS: build and test same flows
- [ ] Linux: build and test same flows

---

## Post-v1 Roadmap

- **TTS (v2):** Add `tts_speak(text)` command to sidecar, ElevenLabs TTS API + Kokoro local. Hotkey: `Ctrl+Win+T`.
- **NPU acceleration:** When AMD XDNA Whisper drivers ship, swap inference backend in `recorder.py`.
- **Custom vocabulary:** Allow user to add domain-specific words, fine-tune Whisper prompt prefix.
- **Mobile companion:** Cloud tier backend can serve a mobile app with same ElevenLabs pipeline.
- **WhisperPipe:** Upgrade to WhisperPipe architecture for sub-100ms latency once Python bindings stabilize.
