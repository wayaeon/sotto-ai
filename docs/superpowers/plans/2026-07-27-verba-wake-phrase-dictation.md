# Verba wake-phrase dictation implementation plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a local, low-idle-compute wake mode triggered by “Verba, dictate”, which excludes the phrase and transcribes one following utterance before re-arming.

**Architecture:** Keep the existing 16 kHz microphone pump and WebRTC VAD queue. When the user arms Wake phrase, a one-thread Sherpa-ONNX keyword spotter consumes only VAD-positive frames. A confirmed phrase changes the recorder from `armed` to `dictating`; only the post-phrase audio is passed to the existing WAV/transcription worker. No Parakeet or other ASR runs until dictation ends.

**Tech Stack:** Python sidecar, `webrtcvad-wheels`, existing `sherpa-onnx`, Tauri IPC, React/TypeScript, existing Python contract tests and Vite build.

---

### Task 1: Add the local keyword-spotter boundary and model availability check

**Files:**
- Create: `sidecar/wakeword.py`
- Modify: `sidecar/models.py`
- Modify: `sidecar/requirements.txt`
- Test: `tests/test_wakeword_contract.py`

**Step 1: Write the failing tests**

Add tests that assert the detector:

- uses the fixed `Verba, dictate` keyword file;
- refuses to arm when the required KWS model files or `sherpa_onnx` are missing;
- reports its own error rather than invoking an ASR runtime.

**Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: FAIL because no `WakeWordDetector` exists.

**Step 3: Implement the minimal detector**

Create `sidecar/wakeword.py` with a `WakeWordDetector` that:

- resolves its files below `~/.verba/models/verba-wake-word`;
- loads the official English `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` int8 KWS package with `num_threads=1`;
- writes the tokenized form of `Verba, dictate` to a temporary keyword file using the package’s documented tokenizer tooling at setup time, then keeps only the final local file;
- exposes `accept_pcm16(frame: bytes) -> bool`, returning true only for a newly decoded keyword;
- exposes `close()` and never imports or calls a transcription adapter.

Do not add a second microphone stream or a generic detector framework. Use Sherpa-ONNX’s streaming keyword-spotter API and its documented keyword score/threshold controls. Pin the existing optional `sherpa-onnx` dependency to a version with that API if its current package does not expose it.

Extend `sidecar/models.py` with a small non-ASR `wake_word_model_ready()` helper. It must validate the actual encoder, decoder, joiner, `tokens.txt`, and prepared keyword file—not merely any `.onnx` file—and return a human-readable unavailable reason.

**Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: PASS.

### Task 2: Replace speech-triggered wake mode with a recorder state machine

**Files:**
- Modify: `sidecar/recorder.py`
- Modify: `sidecar/ipc.py`
- Modify: `sidecar/main.py`
- Test: `tests/test_wakeword_contract.py`

**Step 1: Write the failing state-transition tests**

Add focused tests for:

- `off -> armed -> dictating -> armed -> off`;
- phrase frames never enter the dictation PCM buffer;
- 800 ms of silence completes only the post-phrase utterance;
- a detector load/stream error disarms safely and emits an unavailable status;
- no call to `_transcribe_handsfree_utterance` occurs before wake confirmation.

Use a fake detector and fake IPC; do not require a real microphone, GPU, or downloaded KWS model in unit tests.

**Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: FAIL because the recorder still treats all sustained speech as a hands-free utterance.

**Step 3: Implement the smallest shared recorder flow**

In `sidecar/recorder.py`:

- retain the existing manual VAD hands-free mode unchanged for accessibility fallback;
- introduce one explicit `wake_mode` state (`off`, `armed`, `dictating`) and one queue consumer; do not run manual hands-free and wake phrase loops concurrently;
- add `set_wake_phrase_enabled(enabled: bool) -> bool`, which loads the detector only when enabling and returns `False` with an IPC status/error if unavailable;
- reuse `_audio_pump`, `_handsfree_queue`, 30 ms VAD framing, the existing 150 ms speech onset, 400 ms minimum dictation, and 800 ms silence cutoff;
- while `armed`, feed only speech frames to `WakeWordDetector`; discard all frames accumulated for phrase recognition;
- on detection, emit `wake_detected`, clear every pending buffer, then start collecting only later frames for `dictating`;
- at natural cutoff, call the existing `_transcribe_handsfree_utterance` and finally emit the armed state again.

Add a `SET_WAKE_PHRASE_ENABLED` command in `sidecar/ipc.py` and dispatch it in `sidecar/main.py`. Keep `TOGGLE_HANDSFREE` as the manual, speech-triggered fallback—not as the Wake phrase switch.

**Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: PASS.

### Task 3: Wire the visible settings control and pill states through Tauri

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/hooks/useSidecar.ts`
- Modify: `src/components/Home.tsx`
- Modify: `src/components/Orb.tsx`
- Modify: `src/components/Pill.tsx`
- Test: `tests/test_wakeword_contract.py`

**Step 1: Write the failing UI/IPC contract tests**

Add source-level assertions that:

- the Wake phrase setting invokes `setWakePhraseEnabled` instead of only writing `localStorage`;
- its label is “Wake phrase” and shows “Verba, dictate”;
- Tauri sends the `set_wake_phrase_enabled` command with an `enabled` boolean;
- `wake_detected`, armed, and dictating statuses reach the pill state mapping.

**Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: FAIL because `AudioPanel` has a local-only “Wake on voice” toggle.

**Step 3: Implement the UI bridge**

- Add Tauri’s `set_wake_phrase_enabled` command in Rust and register it in `main.rs`.
- Export `setWakePhraseEnabled(enabled: boolean)` from `src/lib/tauri.ts`.
- In `AudioPanel`, replace “Wake on voice” with “Wake phrase”; persist only the confirmed setting after the sidecar accepts it, and render the phrase “Verba, dictate”. If setup is unavailable, revert the toggle and show the returned sidecar reason.
- Extend `useSidecar` status mapping so `handsfree_on` means manual hands-free, `wake_armed` means microphone armed, `wake_detected` gives immediate confirmation, and `wake_dictating` means active post-phrase recording.
- Make `Orb` and `Pill` visibly distinguish armed from dictating without moving controls or adding another overlay. Keep the existing toggle/shortcut as the explicit off control.

**Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_wakeword_contract.py -q`

Expected: PASS.

### Task 4: Verify the complete local-first path

**Files:**
- Modify: `tests/test_wakeword_contract.py`
- Modify: `docs/superpowers/specs/2026-07-27-verba-wake-word-design.md` only if implementation choices change the approved behavior

**Step 1: Run focused automated checks**

Run: `python -m pytest tests/test_wakeword_contract.py tests/test_pill_and_hotkey_regressions.py -q`

Expected: PASS.

**Step 2: Run the existing full contract suite**

Run: `python -m pytest tests -q`

Expected: PASS with no regression to model download, pill sizing, or Windows startup contracts.

**Step 3: Build the frontend**

Run: `pnpm run build`

Expected: successful Vite production build.

**Step 4: Windows smoke test**

Run: `pnpm exec tauri dev`

Verify manually:

1. Enable Wake phrase and see a clear armed pill state.
2. Speak ordinary speech: no transcription worker activity or transcript.
3. Say “Verba, dictate”, wait for confirmation, then dictate a sentence: transcript contains the sentence but not the phrase.
4. Pause for 800 ms: transcription finishes and the pill returns to armed.
5. Disable Wake phrase: it immediately stops background phrase recognition.
6. Confirm manual push-to-talk and manual hands-free still work.

## Deliberate scope limits

- Windows only in this pass; macOS gets its separate model path later.
- One fixed English phrase and conservative default threshold first. Do not add phrase editing or sensitivity controls until the fixed phrase is measured on the user’s microphone.
- The KWS model is a one-time local prerequisite. Do not silently download it during startup or fall back to full ASR while armed.
