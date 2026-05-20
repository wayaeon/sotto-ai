# Sotto

**Local-first, offline voice dictation for Windows.**  
Press and hold `Ctrl + Win`, speak, release — your words appear instantly in whatever you're typing.  
No cloud. No subscription. No audio leaving your machine.

---

## What it does

Sotto is a push-to-talk dictation app that runs entirely on your computer. It captures your voice, transcribes it with Whisper, optionally cleans it up with a local LLM (Ollama), and pastes the result directly into your active text field — all without touching the internet.

| Stage | What happens |
|-------|-------------|
| 1 · Record | Hold `Ctrl + Win` → mic opens instantly (pre-warmed) |
| 2 · Transcribe | Release → Whisper processes the audio locally |
| 3 · Polish *(optional)* | Local Ollama model fixes punctuation and speech errors |
| 4 · Output | Text is pasted via clipboard into whatever you're typing |

Recordings are saved to `~/.sotto/recordings/` as timestamped WAV files.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| App shell | [Tauri v2](https://tauri.app) (Rust + WebView) |
| UI | React + TypeScript (Vite) |
| Transcription | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) via [RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) |
| Audio capture | PyAudio (direct mic → WAV, pre-warmed stream) |
| VAD | Silero v5 (bundled ONNX) |
| Sidecar binary | Python 3.11 → PyInstaller one-file exe |
| LLM polish | [Ollama](https://ollama.ai) (optional, local) |
| Text injection | Clipboard + `Ctrl+V` via Enigo |

---

## Models

Sotto auto-selects a Whisper model based on your RAM:

| RAM | Model | Notes |
|-----|-------|-------|
| < 4 GB | `tiny.en` | Fast, English only |
| 4–8 GB | `base.en` | Good accuracy |
| 8–16 GB | `medium.en` | Recommended |
| 16 GB+ | `large-v2` | Best accuracy, multilingual |

Models are downloaded on first run to `~/.sotto/models/`.

---

## Getting started

### Prerequisites

- Windows 10/11 (x64)
- [Node.js 18+](https://nodejs.org) + [pnpm](https://pnpm.io)
- [Rust](https://rustup.rs)
- Python 3.11 + pip
- [Ollama](https://ollama.ai) *(optional — for LLM polish)*

### Dev setup

```powershell
# 1. Clone
git clone https://github.com/your-username/sotto.git
cd sotto

# 2. Install JS deps
pnpm install

# 3. Set up Python sidecar virtualenv
cd sidecar
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 4. Run in dev mode
.\dev.ps1
```

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

### Build for release

```powershell
pnpm tauri build
```

---

## Hotkeys

| Shortcut | Action |
|----------|--------|
| `Ctrl + Win` (hold) | Start recording |
| `Ctrl + Win` (release) | Stop and transcribe |

---

## Optional: LLM polish (Ollama)

Install [Ollama](https://ollama.ai), pull a model, and enable the toggle in the Pipeline Debug panel:

```bash
ollama pull qwen3:7b
```

The default prompt strips filler words, fixes capitalisation, and cleans punctuation. You can customise the system prompt in Settings → LLM.

---

## Project structure

```
sotto/
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
│  PyAudio ──► WAV file (~/.sotto/recordings/)          │
│      │                                                │
│      └──► feed_audio() ──► RealtimeSTT/Whisper        │
│                                 │                     │
│                            transcript                 │
│                                 │                     │
│                    [optional] Ollama polish           │
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
- LLM polish adds 2–5 seconds depending on hardware

---

## License

MIT
