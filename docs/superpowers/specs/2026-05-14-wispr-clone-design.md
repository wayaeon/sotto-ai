# Wispr Clone — Design Specification
**Date:** 2026-05-14  
**Status:** Draft — awaiting user review  
**Project path:** `Dev Work/Personal/Projects/wispr-clone`

---

## 1. Overview & Goals

A cross-platform desktop dictation app that clones Wispr Flow's core experience using fully local, offline-capable AI. Text appears word-by-word as you speak and is injected directly into whatever app has focus — with no cloud dependency required.

**Primary goals:**
- Zero-cost, offline-first STT using the best available local models
- "Feels instantaneous" — streaming word-by-word output, ~230ms tail latency
- Dark mode only, matches Wispr's minimal aesthetic
- Exact hotkey parity with Wispr: `Ctrl+Win` push-to-talk, `Ctrl+Win+Space` hands-free
- Cross-platform: Windows 11, macOS, Linux
- Shareable — sister's machine auto-selects the right model at first run
- Cloud tier available for low-end hardware or users who prefer managed accuracy
- All transcription history stored locally regardless of tier

**Non-goals (v1):**
- TTS (designed for, but deferred to v2)
- Mobile app (architecture keeps door open, deferred)
- Speaker diarization
- Meeting transcription / multi-speaker
- Custom vocabulary fine-tuning (user interface for this deferred)

---

## 2. Business Model

| Tier | Price | What's included |
|------|-------|-----------------|
| **Free Trial** | $0 / 14 days | Full local feature set, no card required |
| **Local** | $15 one-time | Local STT forever, offline, private, all platforms |
| **Cloud** | $9/month | ElevenLabs Scribe v2 STT + Claude Haiku cleanup, future TTS |

**Economics (Cloud tier at moderate usage — 60 min/month):**
- COGS per user: ~$0.40–0.50/month (ElevenLabs + Haiku)
- Gross margin at $9: ~84%
- Break-even: 1 user

**Competitor positioning:**
- Wispr Flow: $12/month, no free local tier
- SuperWhisper: $9/month, Mac only, no free tier
- This app: $15 once (local) or $9/month (cloud) + free trial + all platforms + open architecture

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Tauri App Shell                │
│  React/TypeScript UI · Rust core            │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ System Tray │  │  Streaming Overlay   │  │
│  └─────────────┘  └──────────────────────┘  │
│  ┌─────────────────────────────────────────┐ │
│  │         Global Hotkey Handler           │ │
│  │   Ctrl+Win (PTT) · Ctrl+Win+Space (HF) │ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │         Text Injection Engine           │ │
│  │    Active Window Inject + Clipboard     │ │
│  └─────────────────────────────────────────┘ │
└────────────────────┬────────────────────────┘
                     │ JSON over stdio (IPC)
┌────────────────────▼────────────────────────┐
│           Python STT Sidecar                │
│  RealtimeSTT · faster-whisper · Silero VAD  │
│  ┌──────────────┐  ┌───────────────────┐    │
│  │  Audio Capt. │  │  VAD (Silero)     │    │
│  │  Ring Buffer │  │  32ms chunks      │    │
│  └──────┬───────┘  └─────────┬─────────┘    │
│         └──────────┬─────────┘              │
│              ┌─────▼──────┐                 │
│              │  Whisper   │  streaming       │
│              │  Inference │──────────────►  │
│              └─────┬──────┘  word-by-word   │
│                    │                        │
│         ┌──────────▼───────────┐            │
│         │   LLM Cleanup        │            │
│         │   Local: Ollama      │            │
│         │   Cloud: Haiku API   │            │
│         └──────────────────────┘            │
└─────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│           Local Storage (SQLite)            │
│   Transcription history · Settings ·        │
│   License key · Model cache paths           │
└─────────────────────────────────────────────┘
```

**Two-process design:**
- **Tauri process** (Rust): UI, hotkeys, tray, text injection, licensing
- **Python sidecar** (persistent): audio capture, VAD, STT inference, LLM cleanup

The sidecar starts with the app and stays alive. It idles at ~0% CPU and ~2GB RAM (model pinned). Communication is JSON lines over stdio — events flow both directions (commands in, streaming words out).

---

## 4. Component Breakdown

### 4.1 Tauri App Shell

**Responsibilities:**
- System tray icon with status indicator (idle / recording / processing)
- Minimal settings window (dark mode, model selection, hotkey config, license)
- Floating streaming overlay (shows transcribed text word-by-word)
- Global hotkey registration via Tauri's `global-shortcut` plugin
- Spawning and managing the Python sidecar subprocess
- Forwarding streamed words from sidecar → overlay → text injection

**UI stack:** React + TypeScript + Tailwind CSS (dark theme only)

**Overlay design:**
- Small pill-shaped floating window, always-on-top
- Appears on hotkey press, disappears ~1.5s after injection
- Shows recording state (pulsing dot) → streaming words → ✓ done
- Positioned near the active cursor or bottom-center of screen

### 4.2 Python STT Sidecar

**Library:** `RealtimeSTT` (KoljaB) — wraps faster-whisper with VAD, ring buffers, and streaming output. This is the core engine, not a component we build from scratch.

**Responsibilities:**
- Start `RealtimeSTT` recorder with selected model on startup
- Keep model loaded in RAM at all times (warm)
- Receive `START_PTT` / `STOP_PTT` / `TOGGLE_HANDSFREE` commands from Tauri
- Stream partial words back to Tauri as they are transcribed
- Pass completed segments to LLM cleanup
- Stream final cleaned text back to Tauri for injection

**IPC protocol (JSON lines over stdio):**
```jsonl
// Tauri → Sidecar
{"cmd": "start_ptt"}
{"cmd": "stop_ptt"}
{"cmd": "toggle_handsfree"}
{"cmd": "set_model", "model": "whisper-large-v3-turbo"}

// Sidecar → Tauri  
{"event": "word", "text": "Hello", "partial": true}
{"event": "segment_done", "text": "Hello world how are you", "final": true}
{"event": "ready"}
{"event": "error", "msg": "..."}
```

### 4.3 Hardware Detection & Setup Wizard

Runs once at first launch. Detects hardware and assigns a model tier automatically.

**Detection logic:**
```
RAM ≥ 16GB AND disk ≥ 3GB free  → Tier 1: whisper-large-v3-turbo
NVIDIA GPU ≥ 6GB VRAM (CUDA)    → Tier 2: parakeet-tdt-1.1b (override)
RAM 6–16GB AND disk ≥ 1.5GB     → Tier 3: moonshine-base (English)
                                    OR whisper-medium (multilingual)
RAM < 6GB OR disk < 1GB         → Tier 4: redirect to Cloud setup
```

**Wizard screens:**
1. Welcome + hardware scan (2–3 seconds, animated)
2. "Your machine can run [Model X] locally" — confirm or switch
3. Model download (progress bar, ~800MB for turbo, ~245MB for moonshine)
4. Test recording — speak a sentence, see it transcribed
5. License: start free trial or enter key
6. Done — app goes to tray

**LLM cleanup detection (separate pass):**
- Check if Ollama is installed and running
- RAM ≥ 16GB → offer `qwen3:7b` auto-download
- RAM 8–16GB → offer `qwen3:4b`
- RAM < 8GB → skip local cleanup (raw Whisper output only, still good)
- Cloud tier: always uses Claude Haiku 4.5 API

### 4.4 Text Injection Engine

**Primary method: Virtual keystroke injection**
- Simulates typing the transcribed text into the active window
- Works in any app (editors, browsers, Slack, email, terminal)
- Platform-specific: `enigo` crate (Rust, cross-platform) or OS accessibility APIs

**Secondary method: Clipboard**
- Writes text to clipboard on every transcription
- Also performs `Ctrl+V` paste if inject fails or user prefers this mode
- Setting: "Inject to cursor" (default on) / "Clipboard only"

**Failure handling:**
- If active window rejects keystrokes (elevated process, game, VM), fall back to clipboard + notification
- Never silently fail — always show tray notification if injection fails

### 4.5 Streaming Overlay

Floating always-on-top window rendered by Tauri's WebView:
- **Idle:** hidden
- **Recording:** appears with pulsing red dot + "Listening..."
- **Streaming:** words appear left-to-right as they arrive from sidecar
- **Done:** brief green flash → fades out after 1.5s
- **Error:** brief red flash with short message

Overlay is click-through (doesn't steal focus from active app). Position: configurable (near-cursor or bottom-center).

### 4.6 LLM Cleanup Pipeline

**Purpose:** Remove filler words (um, uh, like), fix punctuation, correct capitalization, clean up repetitions.

**Local path (Ollama):**
- Model: `qwen3:7b` (≥16GB RAM) or `qwen3:4b` (8–16GB)
- Runs in parallel with streaming — cleans each chunk as it completes
- Prompt: tightly constrained (clean text, preserve meaning, no additions)
- If Ollama not installed → prompt user to install, or skip cleanup

**Cloud path (Haiku):**
- Model: `claude-haiku-4-5-20251001`
- ~150 tokens in / ~150 tokens out per segment
- Cost: ~$0.0002/transcription — negligible
- Uses prompt caching for the system prompt (static across calls)

**Skip condition:** If user is on Tier 3/4 hardware with <8GB RAM and no Ollama, cleanup is skipped entirely. Whisper's punctuation on clear audio is already good enough for most use cases.

### 4.7 Cloud STT Integration (ElevenLabs)

**Provider:** ElevenLabs Scribe v2 Realtime  
**Protocol:** WebSocket streaming  
**Auth:** User provides their own ElevenLabs API key (stored encrypted in local SQLite)

**Flow:**
- On hotkey press → open WebSocket to ElevenLabs
- Stream raw audio chunks in real time
- Receive partial transcription events → stream to overlay
- On hotkey release → close stream → final text injection
- Claude Haiku cleanup runs in parallel on each received chunk

**Fallback providers (user-selectable in Settings):**
- AssemblyAI Universal-3 Pro ($0.0042/min, best value)
- Deepgram Nova-3 ($0.0077/min, lowest latency alternative)
- OpenAI GPT-4o Transcribe ($0.006/min)

### 4.8 Licensing & Payment

**Local tier ($15 one-time):**
- License key generated and validated via a Cloudflare Worker (zero cold start, free tier sufficient)
- Key stored locally in SQLite — works fully offline after first activation
- One key = up to 3 machine activations (revocable)

**Cloud tier ($9/month):**
- Lemon Squeezy subscription (indie-friendly, no US bank account required, handles VAT/tax)
- Subscription status checked at launch + daily — cached for 7 days offline
- API keys for ElevenLabs + Anthropic stored by user, not managed by us (reduces our liability)

**Free trial:**
- 14-day full-featured trial, no card required
- Trial countdown shown in tray menu
- At expiry: prompt to purchase, local model still works in read-only demo mode (10 transcriptions/day cap) until licensed

---

## 5. Latency Strategy

**Target:** ~230ms perceived delay after speech ends. Text streams word-by-word during speech so user never sees a blank waiting state.

**Techniques (all applied by default):**

| Technique | Latency saved | Notes |
|-----------|--------------|-------|
| RealtimeSTT library | ~500ms | Chunked inference, built-in VAD |
| Silero VAD (32ms chunks) | speech start in ~32ms | Eliminates silence gaps |
| Pre-roll ring buffer (500ms) | Eliminates clipped first words | Always buffering |
| Streaming chunk inference (every ~1s) | Makes transcription invisible | Text flows during speech |
| Parallel LLM cleanup | ~500ms | Runs on each chunk, not serially |
| Model pre-warming | 1–3s cold start eliminated | Loaded at app startup |

**Result:** ~1,720ms naive → **~230ms optimised** (87% reduction)

**Future path:** WhisperPipe architecture (2026 paper, 89ms median) as upgrade once stable Python bindings exist.

---

## 6. STT Model Selection

### Local models (hardware-adaptive, auto-detected at first run)

| Tier | Hardware | Model | WER | Latency | Languages |
|------|----------|-------|-----|---------|-----------|
| 1 | ≥16GB RAM, any CPU/AMD | `whisper-large-v3-turbo` (faster-whisper int8) | ~5.5% | ~1.2s CPU | 99+ |
| 2 | NVIDIA GPU ≥6GB VRAM (Windows/Linux only — no macOS CUDA) | `parakeet-tdt-1.1b` (NeMo/ONNX) | ~6.3% | <50ms GPU | EN only |
| 3a | 6–16GB RAM, English-primary | `moonshine-base` | ≈LgV3 | 107ms CPU | EN only |
| 3b | 6–16GB RAM, multilingual | `whisper-medium` (faster-whisper) | ~8.5% | ~0.5s CPU | 99+ |
| 4 | <6GB RAM | `whisper-tiny` (limited) or → Cloud | ~18% | <0.3s | 99+ |

User can always override in Settings. Model is a live dropdown — switching triggers a graceful sidecar restart (current recording completes first, then sidecar reloads with the new model, ~3–5s downtime).

### Cloud models (user-selectable)

| Provider | Model | WER | Latency | Price |
|----------|-------|-----|---------|-------|
| **ElevenLabs** *(default)* | Scribe v2 Realtime | 2.3% | <150ms | $0.0065/min |
| AssemblyAI | Universal-3 Pro | 3.2% | streaming | $0.0042/min |
| Deepgram | Nova-3 | 6.84% | <300ms | $0.0077/min |
| OpenAI | GPT-4o Transcribe | ~4% | moderate | $0.006/min |

---

## 7. Data Storage

All data stored locally in **SQLite** (via Tauri's `tauri-plugin-sql`). No telemetry. No cloud sync of transcriptions.

**Schema:**

```sql
-- Transcription history
transcriptions (id, text, raw_text, duration_ms, model_used, created_at, app_name)

-- Settings
settings (key, value)  -- model, hotkeys, injection_mode, overlay_position, etc.

-- License
license (key, tier, activated_at, expires_at, machine_id)

-- API keys (encrypted at rest using OS keychain via Tauri's stronghold plugin)
api_keys (provider, encrypted_key)
```

Transcription history is searchable and deletable from the Settings window. Export as plain text or JSON.

---

## 8. Hotkeys

Match Wispr exactly. Registered as global shortcuts via Tauri's `global-shortcut` plugin.

| Hotkey | Action |
|--------|--------|
| `Ctrl + Win` (hold) | Push-to-talk: record while held, transcribe on release |
| `Ctrl + Win + Space` | Toggle hands-free: continuous VAD-driven recording |
| `Ctrl + Win + Esc` | Cancel current recording without injecting |

All hotkeys configurable in Settings.

---

## 9. UI Design

- **Theme:** Dark mode only (v1). System-native window chrome.
- **Primary window:** Hidden — app lives in system tray.
- **Tray menu:** Status, tier, model name, trial countdown, Settings, Quit.
- **Settings window:** Single-page, tabbed: General | Models | Hotkeys | Cloud | History | License.
- **Overlay:** Floating pill, always-on-top, click-through, follows cursor or fixed bottom-center (configurable).
- **Design language:** Minimal, monochromatic dark, purple accent (`#6d4aff` / `#a78bfa`), matches Wispr's aesthetic.
- **Font:** System default (San Francisco on Mac, Segoe UI on Windows, Inter on Linux).

---

## 10. Future: TTS (v2)

Architecture is ready. ElevenLabs account (already required for Cloud tier STT) also provides TTS via their API. The Python sidecar will gain a `tts_speak(text)` command. Hotkey for TTS TBD (likely `Ctrl+Win+T`).

Local TTS option: Kokoro TTS (82M params, near-realtime, runs on CPU) as the free/offline path.

---

## 11. Technology Stack

| Layer | Technology |
|-------|-----------|
| App shell | Tauri v2 (Rust) |
| Frontend UI | React 18 + TypeScript + Tailwind CSS |
| STT engine | Python 3.11+ · RealtimeSTT · faster-whisper · PyTorch |
| VAD | Silero VAD (via RealtimeSTT) |
| Local LLM cleanup | Ollama · Qwen3:7b / Qwen3:4b |
| Cloud STT | ElevenLabs Scribe v2 Realtime (WebSocket) |
| Cloud LLM cleanup | Anthropic Claude Haiku 4.5 (claude-haiku-4-5-20251001) |
| Text injection | Rust `enigo` crate (cross-platform) |
| Local storage | SQLite via `tauri-plugin-sql` |
| API key storage | OS keychain via `tauri-plugin-stronghold` |
| Licensing | Stripe / Lemon Squeezy + Cloudflare Worker validation |
| Build | Tauri CLI · Vite · uv (Python package manager) |
| Distribution | Tauri updater (auto-update) · GitHub Releases |

---

## 12. Open Questions (resolved during design)

| Question | Decision |
|----------|----------|
| Platform | Cross-platform (Windows + Mac + Linux) |
| Framework | Tauri v2 |
| Default local STT | whisper-large-v3-turbo via faster-whisper |
| Cloud STT | ElevenLabs Scribe v2 Realtime |
| Cloud LLM cleanup | Claude Haiku 4.5 |
| Local LLM cleanup | Qwen3:7b/4b via Ollama |
| Text output | Inject to active window + clipboard (both by default) |
| Business model | $15 one-time (local) · $9/month (cloud) · 14-day free trial |
| Local maintenance fee | One-time $15 (not recurring) |
| TTS | v2, ElevenLabs cloud + Kokoro local |
| Latency target | ~230ms perceived after speech ends |
| Data storage | All local SQLite, no cloud sync of transcriptions |
