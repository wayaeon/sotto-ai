# Verba

**Local-first, offline voice dictation for Windows.**  
Press and hold `Ctrl + Alt`, speak, release — your words appear instantly in whatever you're typing.  
No cloud. No subscription. No audio leaving your machine.

---

## What it does

Verba is a push-to-talk dictation app that runs entirely on your computer. It captures your voice, transcribes it with Parakeet on Windows, optionally cleans it up via OpenRouter, and pastes the result directly into your active text field — no audio ever leaves your machine.

| Stage | What happens |
|-------|-------------|
| 1 · Record | Hold `Ctrl + Alt` → mic opens instantly (pre-warmed) |
| 2 · Transcribe | Release → Parakeet processes the audio locally |
| 3 · Polish *(optional)* | OpenRouter model fixes punctuation and speech errors |
| 4 · Output | Text is pasted via clipboard into whatever you're typing |

Recordings are saved to `~/.verba/recordings/` as timestamped WAV files.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| App shell | [Tauri v2](https://tauri.app) (Rust + WebView) |
| UI | React + TypeScript (Vite) |
| Transcription | NVIDIA Parakeet TDT 0.6B v3 on Windows |
| Audio capture | PyAudio (direct mic → WAV, pre-warmed stream) |
| VAD | Silero v5 (bundled ONNX) |
| Sidecar binary | Python 3.11 → PyInstaller one-file exe |
| LLM polish | [OpenRouter](https://openrouter.ai) (optional, cloud) |
| Text injection | Clipboard + `Ctrl+V` via Enigo |

---

## Models

Windows uses Parakeet TDT 0.6B v3 as the fixed transcription model. The sidecar loads it when dictation starts, keeps it warm briefly for follow-up dictation, then unloads it while idle.

Models are downloaded on first run to `~/.verba/models/`.

---

## Getting started

### Prerequisites

- Windows 10/11 (x64)
- [Node.js 18+](https://nodejs.org) + [pnpm](https://pnpm.io)
- [Rust](https://rustup.rs)
- Python 3.11 + pip (only needed to rebuild the sidecar)
- [OpenRouter API key](https://openrouter.ai/keys) *(optional — for AI cleanup)*

### Dev setup

```powershell
# 1. Clone
git clone https://github.com/wayaeon/sotto-ai.git
cd sotto-ai

# 2. Install JS deps
pnpm install

# 3. Set up Python sidecar virtualenv
cd sidecar
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 4. Run the one stable hot-reload app session
.\dev.bat

# Browser-only UI work (no Rust or sidecar)
.\dev-ui.bat
```

Edit files under `src/` and save. Vite updates the running app; do not restart the dev script after every edit. Close the one terminal window when you are done.

### Build the sidecar binary

The Python sidecar must be compiled with PyInstaller before running or building:

```powershell
sidecar\.venv\Scripts\pyinstaller.exe `
  --distpath C:\Temp\sidecar_dist `
  --workpath C:\Temp\sidecar_build `
  sidecar.spec

Copy-Item C:\Temp\sidecar_dist\sidecar.exe `
  src-tauri\binaries\sidecar-x86_64-pc-windows-msvc.exe
```

### Build and run the local Windows app

```powershell
.\build-local.ps1
.\run-local.ps1
```

The installer is written to `%TEMP%\verba-target\release\bundle\nsis\`. Windows local builds produce an NSIS installer. macOS Intel and Apple Silicon installers are produced by the tag workflow in `.github\workflows\release.yml`.

---

## Hotkeys

| Shortcut | Action |
|----------|--------|
| `Ctrl + Alt` (hold) | Start recording |
| `Ctrl + Alt` (release) | Stop and transcribe |
| `Ctrl + Alt + Space` | Toggle hands-free mode (VAD-segmented dictation) |

---

## Optional: AI Cleanup (OpenRouter)

Verba is fully usable offline. Optionally, transcripts can be polished by a cloud LLM via [OpenRouter](https://openrouter.ai): enable it in Settings → AI Cleanup, paste an API key from [openrouter.ai/keys](https://openrouter.ai/keys), and pick a model. If a request fails or times out, the raw transcript is used instead.

---

## Project structure

```
verba/
├── src/                        # React frontend
│   ├── components/
│   │   ├── Pill.tsx            # Floating dictation pill (separate Tauri window)
│   │   ├── PipelineDebug.tsx   # Live pipeline visualiser
│   │   └── Home.tsx            # Main app shell
│   └── hooks/useSidecar.ts     # Sidecar IPC event bridge
├── src-tauri/                  # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs             # App setup, pill window creation
│   │   ├── hotkeys.rs          # Ctrl+Win global hotkey (rdev)
│   │   ├── sidecar.rs          # Python sidecar process management
│   │   ├── injection.rs        # Clipboard + Ctrl+V text injection
│   │   └── commands.rs         # Tauri commands (start_ptt, stop_ptt…)
│   └── tauri.conf.json
├── sidecar/                    # Python transcription backend
│   ├── main.py                 # Entry point (freeze_support, IPC loop)
│   ├── recorder.py             # PTT, PyAudio capture, WAV write, Whisper
│   ├── ipc.py                  # JSON-lines stdio protocol
│   ├── hardware.py             # RAM detection → model tier
│   └── models.py               # Model path resolution + download
└── sidecar.spec                # PyInstaller build spec
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Tauri App (Rust)                                    │
│  ┌─────────────┐   ┌──────────────────────────────┐ │
│  │  Pill window │   │  Main window (React/Home)    │ │
│  │  (React/Pill)│   │  Settings, history, debug    │ │
│  └──────┬───────┘   └──────────────────────────────┘ │
│         │ Ctrl+Win hotkey (rdev)                      │
│         ▼                                            │
│  ┌─────────────────┐                                │
│  │  Rust commands  │  start_ptt / stop_ptt           │
│  └────────┬────────┘                                │
│           │ stdin/stdout JSON-lines                  │
└───────────┼──────────────────────────────────────────┘
            ▼
┌───────────────────────────────────────────────────────┐
│  Python Sidecar (PyInstaller .exe)                    │
│                                                       │
│  PyAudio ──► WAV file (~/.verba/recordings/)          │
│      │                                                │
│      └──► feed_audio() ──► RealtimeSTT/Whisper        │
│                                 │                     │
│                            transcript                 │
│                                 │                     │
│                    [optional] OpenRouter polish       │
│                                 │                     │
│                          segment_done ──► Rust        │
│                                              │        │
│                                    Ctrl+V injection   │
└───────────────────────────────────────────────────────┘
```

---

## Known limitations

- Windows only (macOS/Linux support not planned short-term)
- First model load takes 15–30 seconds; subsequent recordings are fast
- Whisper accuracy drops for heavy accents or background noise
- AI cleanup adds 1–5 seconds depending on the chosen model

---

## License

MIT
