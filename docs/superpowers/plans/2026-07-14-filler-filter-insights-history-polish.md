# Filler-Filter, Communication-Style Insights & History/Insights Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, rule-based filler-word filter to the dictation pipeline (Settings toggle + word list, sidecar-side stripping, raw-text retention for analytics); add communication-style metrics to the Insights tab (most-used words, filler trend, WPM trend, vocabulary richness); remove three dead UI elements and one fake-data chart in the Transcripts/Insights tabs, replace them with real functionality, and add tooltips.

**Architecture:** The filler filter runs sidecar-side in `sidecar/cleanup.py` (pure regex, no LLM/network — matches the existing `restore_readable_transcript` style), wired end-to-end via the same Command/IPC/Tauri-command pattern the existing `set_dictionary` feature already uses. The pre-filter text is retained per-entry (`Transcription.raw_text`) only when the filter actually changed something, so Insights can compute filler trends without duplicating data on every utterance. All new Insights metrics are pure client-side computations over the already-fully-stored `transcriptions` array — no new backend calls. The History/Insights cleanup task removes three `onClick`-less buttons/filters (a real bug per `DESIGN.md` §9 rule 2) and rebuilds the Context Breakdown pie from real `app_name` data that's been sitting unused since an earlier session's app-icon-detection work.

**Tech Stack:** Python (sidecar, pytest), Rust (Tauri commands), TypeScript/React (frontend, no test runner configured — verified via `tsc --noEmit` + manual browser smoke test).

---

## Task 1: `strip_filler_words` in `sidecar/cleanup.py`

**Files:**
- Modify: `sidecar/cleanup.py`
- Test: `tests/sidecar/test_cleanup.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/sidecar/test_cleanup.py`:

```python
from sidecar.cleanup import restore_readable_transcript, strip_filler_words


def test_strip_filler_words_removes_single_word_with_surrounding_comma():
    assert (
        strip_filler_words("Um, I think this is great", ["um"])
        == "I think this is great"
    )


def test_strip_filler_words_removes_multi_word_phrase():
    assert (
        strip_filler_words("I think, you know, this works", ["you know"])
        == "I think this works"
    )


def test_strip_filler_words_removes_multiple_chained_fillers():
    assert (
        strip_filler_words("Um, uh, I think so", ["um", "uh"])
        == "I think so"
    )


def test_strip_filler_words_is_case_insensitive():
    assert strip_filler_words("LIKE this is cool", ["like"]) == "This is cool"


def test_strip_filler_words_noop_when_word_not_present():
    assert (
        strip_filler_words("Already readable, thanks.", ["like"])
        == "Already readable, thanks."
    )


def test_strip_filler_words_noop_with_empty_list():
    assert strip_filler_words("Um, hello", []) == "Um, hello"


def test_strip_filler_words_does_not_match_substring():
    assert (
        strip_filler_words("The umbrella is red", ["um"])
        == "The umbrella is red"
    )
```

Note: `test_cleanup.py`'s existing `from sidecar.cleanup import restore_readable_transcript` line at the top of the file should be replaced by the combined import shown above (don't leave two separate import lines for the same module).

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/sidecar/test_cleanup.py -v`
Expected: the 7 new tests FAIL with `ImportError: cannot import name 'strip_filler_words'`

- [ ] **Step 3: Implement `strip_filler_words`**

Add to `sidecar/cleanup.py` (after `restore_readable_transcript`):

```python
def strip_filler_words(text: str, filler_words: list[str]) -> str:
    """Remove filler words/phrases as whole tokens, consuming a comma on
    either side, then clean up leftover whitespace/punctuation and
    re-capitalize the new sentence start if it changed. Pure rule-based
    word-list matching — no LLM, no network, consistent with
    restore_readable_transcript above."""
    if not text or not filler_words:
        return text

    ordered = sorted({w.strip() for w in filler_words if w.strip()}, key=len, reverse=True)
    if not ordered:
        return text

    alternation = "|".join(re.escape(w) for w in ordered)
    pattern = rf"\s*,?\s*\b(?:{alternation})\b\s*,?\s*"
    cleaned = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\s+([,.?!])", r"\1", cleaned)
    cleaned = re.sub(r"^,\s*", "", cleaned)

    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/sidecar/test_cleanup.py -v`
Expected: all tests PASS (the 3 existing `restore_readable_transcript` tests plus the 7 new ones = 10 passed)

- [ ] **Step 5: Commit**

```bash
git add sidecar/cleanup.py tests/sidecar/test_cleanup.py
git commit -m "feat: add strip_filler_words for rule-based filler-word removal"
```

---

## Task 2: `SET_FILLER_CONFIG` command in `sidecar/ipc.py`

**Files:**
- Modify: `sidecar/ipc.py:17`

- [ ] **Step 1: Add the new command**

In `sidecar/ipc.py`, in the `Command` enum, add a line right after `SET_DICTIONARY = "set_dictionary"`:

```python
class Command(str, Enum):
    START_PTT = "start_ptt"
    STOP_PTT = "stop_ptt"
    TOGGLE_HANDSFREE = "toggle_handsfree"
    DETECT_HARDWARE = "detect_hardware"
    DOWNLOAD_MODEL = "download_model"
    PAUSE_DOWNLOAD_MODEL = "pause_download_model"
    SET_MODEL = "set_model"
    BENCHMARK_MODEL = "benchmark_model"
    SET_DICTIONARY = "set_dictionary"
    SET_FILLER_CONFIG = "set_filler_config"
    CHECK_DOWNLOADS = "check_downloads"
    PING = "ping"
    QUIT = "quit"
```

- [ ] **Step 2: Verify the enum still imports cleanly**

Run: `python -c "from sidecar.ipc import Command; print(Command.SET_FILLER_CONFIG.value)"`
Expected: prints `set_filler_config`

- [ ] **Step 3: Commit**

```bash
git add sidecar/ipc.py
git commit -m "feat: add SET_FILLER_CONFIG command"
```

---

## Task 3: Wire filler config into `sidecar/recorder.py`

**Files:**
- Modify: `sidecar/recorder.py:108-114` (`__init__`), `sidecar/recorder.py:232-237` (`_postprocess_transcript`), `sidecar/recorder.py:393-418` (`SEGMENT_DONE` call site), `sidecar/recorder.py:598-601` (near `set_dictionary`)

- [ ] **Step 1: Add filler state to `__init__`**

In `sidecar/recorder.py`, `Recorder.__init__` currently reads (around line 108-113):

```python
    def __init__(self, ipc: IPC, hw: "HardwareInfo") -> None:
        self._ipc        = ipc
        self._tier       = hw.tier
        self._device     = hw.device_str
        self._model_name = best_available_model(hw.model_name)
        self._initial_prompt = ""
```

Change it to:

```python
    def __init__(self, ipc: IPC, hw: "HardwareInfo") -> None:
        self._ipc        = ipc
        self._tier       = hw.tier
        self._device     = hw.device_str
        self._model_name = best_available_model(hw.model_name)
        self._initial_prompt = ""

        # Filler-word filter — on by default with a built-in list so it
        # works before the user ever opens Settings. The frontend's own
        # default list (Home.tsx DEFAULT_FILLER_WORDS) mirrors this.
        self._filler_enabled = True
        self._filler_words: list[str] = [
            "um", "umm", "uh", "uhh", "like", "you know", "i mean",
            "sort of", "kind of", "actually", "basically", "literally", "so yeah",
        ]
```

- [ ] **Step 2: Change `_postprocess_transcript` to return `(final, raw_or_none)`**

Current code (`sidecar/recorder.py:232-237`):

```python
    def _postprocess_transcript(self, text: str) -> str:
        if self._runtime() != "onnx":
            return text.strip()
        from .cleanup import restore_readable_transcript

        return restore_readable_transcript(text)
```

Replace with:

```python
    def _postprocess_transcript(self, text: str) -> tuple[str, str | None]:
        if self._runtime() == "onnx":
            from .cleanup import restore_readable_transcript
            text = restore_readable_transcript(text)
        else:
            text = text.strip()

        if not self._filler_enabled or not self._filler_words:
            return text, None

        from .cleanup import strip_filler_words
        filtered = strip_filler_words(text, self._filler_words)
        if filtered == text:
            return text, None
        return filtered, text
```

- [ ] **Step 3: Update the `SEGMENT_DONE` call site**

Current code (`sidecar/recorder.py:401-418`):

```python
                    if status == "ok":
                        value = self._postprocess_transcript(value)
                        if value:
                            timing: dict = {}
                            if timing_ctx:
                                timing = {
                                    **timing_ctx,
                                    "worker_sent_ms":         round(t_worker_sent_ms),
                                    "transcription_done_ms":  round(t_transcription_done_ms),
                                    "queue_ms":  round(t_worker_sent_ms - timing_ctx.get("wav_ready_ms", t_worker_sent_ms)),
                                    "whisper_ms": round(t_transcription_done_ms - t_worker_sent_ms),
                                }
                            self._ipc.send(
                                Event.SEGMENT_DONE,
                                text=value,
                                audio_path=audio_path,
                                timing=timing,
                            )
```

Replace with:

```python
                    if status == "ok":
                        value, raw_value = self._postprocess_transcript(value)
                        if value:
                            timing: dict = {}
                            if timing_ctx:
                                timing = {
                                    **timing_ctx,
                                    "worker_sent_ms":         round(t_worker_sent_ms),
                                    "transcription_done_ms":  round(t_transcription_done_ms),
                                    "queue_ms":  round(t_worker_sent_ms - timing_ctx.get("wav_ready_ms", t_worker_sent_ms)),
                                    "whisper_ms": round(t_transcription_done_ms - t_worker_sent_ms),
                                }
                            self._ipc.send(
                                Event.SEGMENT_DONE,
                                text=value,
                                raw_text=raw_value,
                                audio_path=audio_path,
                                timing=timing,
                            )
```

- [ ] **Step 4: Add `set_filler_config`**

In `sidecar/recorder.py`, right after `set_dictionary` (around line 598-601):

```python
    def set_dictionary(self, words: list[str]) -> None:
        # Not currently threaded into any runtime adapter's transcribe() call
        # (PTT never used it either) — kept for a future prompt-biasing pass.
        self._initial_prompt = ", ".join(words) if words else ""

    def set_filler_config(self, enabled: bool, words: list[str]) -> None:
        self._filler_enabled = enabled
        self._filler_words = words
```

- [ ] **Step 5: Verify the module still imports and the whole suite still passes**

Run: `python -m pytest tests/sidecar/ -v`
Expected: all existing tests still PASS (this confirms the `_postprocess_transcript` signature change didn't break any other caller — it has exactly one caller, the `SEGMENT_DONE` site just updated).

- [ ] **Step 6: Commit**

```bash
git add sidecar/recorder.py
git commit -m "feat: apply filler-word filter to every transcript, retain raw text on change"
```

---

## Task 4: Dispatch `SET_FILLER_CONFIG` in `sidecar/main.py`

**Files:**
- Modify: `sidecar/main.py:116-119`

- [ ] **Step 1: Add the dispatch branch**

Current code (`sidecar/main.py:116-119`):

```python
        elif cmd == Command.SET_DICTIONARY:
            words = payload.get("words", [])
            if recorder is not None:
                recorder.set_dictionary(words)
```

Add right after it:

```python
        elif cmd == Command.SET_DICTIONARY:
            words = payload.get("words", [])
            if recorder is not None:
                recorder.set_dictionary(words)

        elif cmd == Command.SET_FILLER_CONFIG:
            filler_enabled = payload.get("enabled", True)
            filler_words = payload.get("words", [])
            if recorder is not None:
                recorder.set_filler_config(filler_enabled, filler_words)
```

- [ ] **Step 2: Verify the sidecar still boots**

Run: `python -c "import sidecar.main"`
Expected: no import errors.

- [ ] **Step 3: Commit**

```bash
git add sidecar/main.py
git commit -m "feat: dispatch set_filler_config command to the recorder"
```

---

## Task 5: `set_filler_config` Tauri command (Rust)

**Files:**
- Modify: `src-tauri/src/commands.rs:61-64`
- Modify: `src-tauri/src/main.rs:27`

- [ ] **Step 1: Add the Rust command**

In `src-tauri/src/commands.rs`, right after `set_dictionary` (lines 61-64):

```rust
#[tauri::command]
pub fn set_dictionary(app: AppHandle, words: Vec<String>) {
    send_command(&app, json!({"cmd": "set_dictionary", "words": words}));
}

#[tauri::command]
pub fn set_filler_config(app: AppHandle, enabled: bool, words: Vec<String>) {
    send_command(&app, json!({"cmd": "set_filler_config", "enabled": enabled, "words": words}));
}
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/main.rs`, in the `generate_handler!` list (line 27), add a line right after `commands::set_dictionary,`:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::start_ptt,
            commands::stop_ptt,
            commands::toggle_handsfree,
            commands::ping_sidecar,
            commands::detect_hardware,
            commands::set_model,
            commands::benchmark_model,
            commands::set_dictionary,
            commands::set_filler_config,
            commands::inject_text,
            commands::open_url,
            commands::open_path,
        ])
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: `Finished` with no errors (warnings about unrelated existing code are fine).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add set_filler_config Tauri command"
```

---

## Task 6: `setFillerConfig` + `raw_text` in `src/lib/tauri.ts`

**Files:**
- Modify: `src/lib/tauri.ts:11`, `src/lib/tauri.ts:67`

- [ ] **Step 1: Add the invoke wrapper**

In `src/lib/tauri.ts`, right after `setDictionary` (line 11):

```typescript
export const setDictionary = (words: string[]) => invoke("set_dictionary", { words });
export const setFillerConfig = (enabled: boolean, words: string[]) => invoke("set_filler_config", { enabled, words });
```

- [ ] **Step 2: Extend the `segment_done` variant of `SidecarMessage`**

Current (line 67):

```typescript
  | { event: "segment_done"; text: string; audio_path?: string; timing?: StageTiming }
```

Replace with:

```typescript
  | { event: "segment_done"; text: string; raw_text?: string | null; audio_path?: string; timing?: StageTiming }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat: add setFillerConfig and raw_text to the sidecar message type"
```

---

## Task 7: `raw_text` on `Transcription` in `src/lib/db.ts`

**Files:**
- Modify: `src/lib/db.ts:1-46`

- [ ] **Step 1: Extend the interface and `insertTranscription`**

Current (`src/lib/db.ts:1-46`):

```typescript
export interface Transcription {
  id: number;
  text: string;
  model: string;
  tier: string;
  duration_ms: number;
  created_at: string;
  app_name: string | null;
  app_icon: string | null;
}

const TRANSCRIPTIONS_KEY = "verba_transcriptions";
const MAX_STORED = 200;

function load(): Transcription[] {
  try {
    return JSON.parse(localStorage.getItem(TRANSCRIPTIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

let _nextId = Date.now();

export function insertTranscription(
  text: string,
  model: string,
  tier: string,
  durationMs: number,
  appName: string | null = null,
  appIcon: string | null = null
): Transcription {
  const items = load();
  const item: Transcription = {
    id: _nextId++,
    text,
    model: model ?? "",
    tier: tier ?? "",
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
    app_name: appName,
    app_icon: appIcon,
  };
  items.push(item);
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(items.slice(-MAX_STORED)));
  return item;
}
```

Replace with:

```typescript
export interface Transcription {
  id: number;
  text: string;
  model: string;
  tier: string;
  duration_ms: number;
  created_at: string;
  app_name: string | null;
  app_icon: string | null;
  raw_text: string | null;
}

const TRANSCRIPTIONS_KEY = "verba_transcriptions";
const MAX_STORED = 200;

function load(): Transcription[] {
  try {
    return JSON.parse(localStorage.getItem(TRANSCRIPTIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

let _nextId = Date.now();

export function insertTranscription(
  text: string,
  model: string,
  tier: string,
  durationMs: number,
  appName: string | null = null,
  appIcon: string | null = null,
  rawText: string | null = null
): Transcription {
  const items = load();
  const item: Transcription = {
    id: _nextId++,
    text,
    model: model ?? "",
    tier: tier ?? "",
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
    app_name: appName,
    app_icon: appIcon,
    raw_text: rawText,
  };
  items.push(item);
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(items.slice(-MAX_STORED)));
  return item;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `Transcription` object literals are only ever constructed in `db.ts` (verified via `grep -rn "app_icon:" src/` — the only matches are the interface declaration and the one construction site in `insertTranscription`); every other file only reads the type, so no other call site needs updating.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add raw_text field to Transcription"
```

---

## Task 8: Thread `raw_text` through `src/hooks/useSidecar.ts`

**Files:**
- Modify: `src/hooks/useSidecar.ts:68-107`

- [ ] **Step 1: Update the `segment_done` handler**

Current (`src/hooks/useSidecar.ts:68-107`):

```typescript
        case "segment_done": {
          const raw = msg.text;
          commitSegment(raw);

          const durationMs = dictationStartMs.current
            ? Date.now() - dictationStartMs.current
            : 0;
          dictationStartMs.current = null;

          // Runs in every window (each has its own store — sidecar-event
          // broadcasts to all of them, so this is how they stay in sync
          // instead of only the Pill knowing what was just dictated).
          if (raw.trim()) {
            // Snapshot now — focusedApp reflects whatever was focused when this
            // utterance *started*; by the time segment_done fires the user may
            // have already switched windows, so this pins it to the right one.
            const dictatedInto = useAppStore.getState().focusedApp;
            setLastDictationApp(dictatedInto);
            setLastDictationStats({ wordCount: raw.trim().split(/\s+/).length, durationMs });
          }

          // Injection/history/metrics run only in the primary (Pill)
          // instance, to avoid double-injecting and duplicate history rows.
          if (raw.trim() && primary) {
            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";
            const dictatedInto = useAppStore.getState().lastDictationApp;

            localStorage.setItem("verba_last_transcription", raw);

            // inject_text Rust command emits "inject-done" to all windows after completing
            injectText(raw).catch((e) => console.warn("[inject_text]", e));

            insertTranscription(
              raw, currentModel, currentTier, durationMs,
              dictatedInto?.name ?? null, dictatedInto?.iconDataUri ?? null
            );
            updateMetrics(raw.trim().split(/\s+/).length, durationMs);
          }
          break;
        }
```

Replace with:

```typescript
        case "segment_done": {
          const raw = msg.text;
          const rawTextBeforeFilter = msg.raw_text ?? null;
          commitSegment(raw);

          const durationMs = dictationStartMs.current
            ? Date.now() - dictationStartMs.current
            : 0;
          dictationStartMs.current = null;

          // Runs in every window (each has its own store — sidecar-event
          // broadcasts to all of them, so this is how they stay in sync
          // instead of only the Pill knowing what was just dictated).
          if (raw.trim()) {
            // Snapshot now — focusedApp reflects whatever was focused when this
            // utterance *started*; by the time segment_done fires the user may
            // have already switched windows, so this pins it to the right one.
            const dictatedInto = useAppStore.getState().focusedApp;
            setLastDictationApp(dictatedInto);
            setLastDictationStats({ wordCount: raw.trim().split(/\s+/).length, durationMs });
          }

          // Injection/history/metrics run only in the primary (Pill)
          // instance, to avoid double-injecting and duplicate history rows.
          if (raw.trim() && primary) {
            const currentModel = useAppStore.getState().model ?? "";
            const currentTier  = useAppStore.getState().tier  ?? "";
            const dictatedInto = useAppStore.getState().lastDictationApp;

            localStorage.setItem("verba_last_transcription", raw);

            // inject_text Rust command emits "inject-done" to all windows after completing
            injectText(raw).catch((e) => console.warn("[inject_text]", e));

            insertTranscription(
              raw, currentModel, currentTier, durationMs,
              dictatedInto?.name ?? null, dictatedInto?.iconDataUri ?? null,
              rawTextBeforeFilter
            );
            updateMetrics(raw.trim().split(/\s+/).length, durationMs);
          }
          break;
        }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSidecar.ts
git commit -m "feat: store pre-filter transcript text when the filler filter changes it"
```

---

## Task 9: Filler word storage + `Stat` hint prop in `src/components/Home.tsx`

**Files:**
- Modify: `src/components/Home.tsx:153-163` (near `getDictionary`/`saveDictionary`)
- Modify: `src/components/Home.tsx:314-339` (`Stat` component)

- [ ] **Step 1: Add default list + storage helpers**

In `src/components/Home.tsx`, right after `saveDictionary` (line 163):

```typescript
function saveDictionary(entries: DictEntry[]): void {
  localStorage.setItem("verba_dictionary", JSON.stringify(entries));
}

const DEFAULT_FILLER_WORDS = [
  "um", "umm", "uh", "uhh", "like", "you know", "i mean",
  "sort of", "kind of", "actually", "basically", "literally", "so yeah",
];

function getFillerWords(): string[] {
  try {
    const raw = localStorage.getItem("verba_filler_words");
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return DEFAULT_FILLER_WORDS;
}

function saveFillerWords(words: string[]): void {
  localStorage.setItem("verba_filler_words", JSON.stringify(words));
}
```

- [ ] **Step 2: Add a `hint` prop to `Stat`**

Current (`src/components/Home.tsx:314-339`):

```typescript
interface StatProps {
  value: string | number;
  unit?: string;
  label: string;
  sub?: string;
  delta?: string;
  deltaDown?: boolean;
  accent: string;
  italic?: boolean;
}

function Stat({ value, unit, label, sub, delta, deltaDown, accent, italic }: StatProps) {
  return (
    <div className="stat" data-accent={accent}>
      {delta && <span className={`stat-delta${deltaDown ? " down" : ""}`}>{delta}</span>}
      <div className="stat-value">
        {italic ? <em>{value}</em> : value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">
        <span className="l">{label}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
    </div>
  );
}
```

Replace with:

```typescript
interface StatProps {
  value: string | number;
  unit?: string;
  label: string;
  sub?: string;
  delta?: string;
  deltaDown?: boolean;
  accent: string;
  italic?: boolean;
  hint?: string;
}

function Stat({ value, unit, label, sub, delta, deltaDown, accent, italic, hint }: StatProps) {
  return (
    <div className="stat" data-accent={accent}>
      {delta && <span className={`stat-delta${deltaDown ? " down" : ""}`}>{delta}</span>}
      <div className="stat-value">
        {italic ? <em>{value}</em> : value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">
        <span className="l" title={hint}>{label}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (`hint` is optional, all existing `<Stat .../>` call sites remain valid).

- [ ] **Step 4: Commit**

```bash
git add src/components/Home.tsx
git commit -m "feat: add filler-word storage helpers and Stat hint prop"
```

---

## Task 10: `FillerSection` settings UI

**Files:**
- Modify: `src/components/Home.tsx:1930-1995` (`DictPanel`)

- [ ] **Step 1: Add the `FillerSection` component**

In `src/components/Home.tsx`, right before `function DictPanel() {` (line 1930), add:

```typescript
function FillerSection() {
  const [enabled, setEnabled] = useToggleSetting("filler_enabled", true);
  const [words, setWords] = useState<string[]>(getFillerWords);
  const [term, setTerm] = useState("");

  function sync(nextEnabled: boolean, nextWords: string[]) {
    import("../lib/tauri").then(({ setFillerConfig }) => setFillerConfig(nextEnabled, nextWords).catch(() => {}));
  }

  function toggleEnabled(v: boolean) {
    setEnabled(v);
    sync(v, words);
  }

  function addWord() {
    const w = term.trim().toLowerCase();
    if (!w || words.includes(w)) return;
    const updated = [...words, w];
    setWords(updated);
    saveFillerWords(updated);
    sync(enabled, updated);
    setTerm("");
  }

  function removeWord(w: string) {
    const updated = words.filter((x) => x !== w);
    setWords(updated);
    saveFillerWords(updated);
    sync(enabled, updated);
  }

  function resetDefault() {
    setWords(DEFAULT_FILLER_WORDS);
    saveFillerWords(DEFAULT_FILLER_WORDS);
    sync(enabled, DEFAULT_FILLER_WORDS);
  }

  return (
    <div style={{ marginTop: 28 }}>
      <SectionHead label="Filler Words" action={<Toggle on={enabled} onChange={toggleEnabled} />} />
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 14px" }}>
        Strips these from dictated text before it's pasted.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div className="input" style={{ flex: 1 }}>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWord()}
            placeholder="Add a word or phrase"
          />
        </div>
        <button className="btn btn-sm btn-primary" onClick={addWord}>
          <Icons.Plus size={13} /> Add
        </button>
        <button className="btn btn-sm btn-ghost" onClick={resetDefault} title="Reset to the default list">
          Reset
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {words.map((w) => (
          <span key={w} className="chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {w}
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: 2, color: "var(--c-rose)" }}
              onClick={() => removeWord(w)}
              title={`Remove "${w}"`}
            >
              <Icons.X size={10} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it inside `DictPanel`**

Current end of `DictPanel`'s returned JSX (`src/components/Home.tsx`, inside the function, closing structure):

```typescript
      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icons.FileText size={22} /></div>
          <h4>No entries yet</h4>
          <p>Add custom words, names, or jargon for better accuracy.</p>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          {entries.map((e) => (
            <div key={e.id} className="setting-row" style={{ padding: "12px 18px" }}>
              <div className="setting-text">
                <p className="t">{e.term}</p>
                {e.phonetic && <p className="d">{e.phonetic}</p>}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--c-rose)" }} onClick={() => removeEntry(e.id)}>
                <Icons.Trash size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Replace the closing `    </div>\n  );\n}` with:

```typescript
      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icons.FileText size={22} /></div>
          <h4>No entries yet</h4>
          <p>Add custom words, names, or jargon for better accuracy.</p>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          {entries.map((e) => (
            <div key={e.id} className="setting-row" style={{ padding: "12px 18px" }}>
              <div className="setting-text">
                <p className="t">{e.term}</p>
                {e.phonetic && <p className="d">{e.phonetic}</p>}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--c-rose)" }} onClick={() => removeEntry(e.id)}>
                <Icons.Trash size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <FillerSection />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open the app in the browser preview, navigate to Settings → Dictionary, confirm:
- A "Filler Words" section renders below the dictionary list, with a toggle (on by default) and the 13 default words shown as chips.
- Typing a word and clicking Add appends a new chip and clears the input.
- Clicking a chip's × removes it.
- Clicking Reset restores the default 13-word list.

- [ ] **Step 5: Commit**

```bash
git add src/components/Home.tsx
git commit -m "feat: add Filler Words settings section"
```

---

## Task 11: Insights — most-used words + vocabulary richness

**Files:**
- Modify: `src/components/Home.tsx:957-1066` (`InsightsScreen` and the helpers above it)

- [ ] **Step 1: Add the pure computation helpers**

In `src/components/Home.tsx`, right before `function InsightsScreen(` (line 957), add:

```typescript
const INSIGHTS_STOP_WORDS = new Set([
  "the", "a", "an", "is", "it", "to", "and", "of", "in", "on", "for", "that",
  "this", "i", "you", "he", "she", "we", "they", "was", "were", "be", "been",
  "being", "am", "are", "do", "does", "did", "have", "has", "had", "with",
  "as", "at", "by", "from", "or", "but", "if", "not", "so", "my", "your",
  "his", "her", "its", "our", "their",
]);

function tokenizeForInsights(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function mostUsedWords(
  transcriptions: Transcription[],
  fillerWords: string[],
  limit = 12
): Array<{ word: string; count: number }> {
  const filler = new Set(fillerWords.map((w) => w.toLowerCase()));
  const counts = new Map<string, number>();
  for (const t of transcriptions) {
    for (const word of tokenizeForInsights(t.text)) {
      if (INSIGHTS_STOP_WORDS.has(word) || filler.has(word) || word.length < 2) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function countFillerWords(text: string, fillerWords: string[]): number {
  const cleaned = fillerWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return 0;
  const alternation = cleaned
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(?:${alternation.join("|")})\\b`, "gi");
  return (text.match(re) ?? []).length;
}

function vocabularyRichness(transcriptions: Transcription[]): number {
  const words = transcriptions.flatMap((t) => tokenizeForInsights(t.text));
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}
```

- [ ] **Step 2: Compute and render in `InsightsScreen`**

Current start of `InsightsScreen` (`src/components/Home.tsx:957-976`):

```typescript
function InsightsScreen({ transcriptions, metrics }: InsightsScreenProps) {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const ranges: Array<"7d" | "30d" | "90d" | "all"> = ["7d", "30d", "90d", "all"];

  // Build daily volume data for sparkline (last 30 days)
  const volumeData = useMemo(() => {
    const days = 30;
    const bins = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days) bins[days - 1 - idx]++;
    });
    return bins;
  }, [transcriptions]);

  const maxVol = Math.max(...volumeData, 1);

```

Replace with (adds the range-filtered subset and the new computed values, keeping everything already there):

```typescript
function InsightsScreen({ transcriptions, metrics }: InsightsScreenProps) {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const ranges: Array<"7d" | "30d" | "90d" | "all"> = ["7d", "30d", "90d", "all"];

  // Build daily volume data for sparkline (last 30 days)
  const volumeData = useMemo(() => {
    const days = 30;
    const bins = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days) bins[days - 1 - idx]++;
    });
    return bins;
  }, [transcriptions]);

  const maxVol = Math.max(...volumeData, 1);

  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : Infinity;
  const inRange = useMemo(() => {
    if (rangeDays === Infinity) return transcriptions;
    const now = Date.now();
    return transcriptions.filter(
      (t) => (now - new Date(t.created_at).getTime()) / 86400000 <= rangeDays
    );
  }, [transcriptions, rangeDays]);
  const priorRange = useMemo(() => {
    if (rangeDays === Infinity) return [];
    const now = Date.now();
    return transcriptions.filter((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      return age > rangeDays && age <= rangeDays * 2;
    });
  }, [transcriptions, rangeDays]);

  const fillerWordsForInsights = useMemo(() => getFillerWords(), []);
  const topWords = useMemo(
    () => mostUsedWords(inRange, fillerWordsForInsights),
    [inRange, fillerWordsForInsights]
  );
  const richnessCurrent = useMemo(() => vocabularyRichness(inRange), [inRange]);
  const richnessPrevious = useMemo(
    () => (rangeDays === Infinity ? null : vocabularyRichness(priorRange)),
    [priorRange, rangeDays]
  );
  const richnessDelta = useMemo(() => {
    if (richnessPrevious === null || richnessPrevious === 0) return undefined;
    const pct = Math.round(((richnessCurrent - richnessPrevious) / richnessPrevious) * 100);
    return `${pct >= 0 ? "↑" : "↓"}${Math.abs(pct)}%`;
  }, [richnessCurrent, richnessPrevious]);

```

- [ ] **Step 3: Render the new "Communication Style" section**

In `InsightsScreen`'s returned JSX, right after the "Context Breakdown" `</div>` (the section that currently ends the `main-body`, just before the closing `</div></div>` of the component — i.e. right after the block that starts with `{/* Context breakdown */}` and ends its closing `</div>` for the `card`), add a new section. Locate:

```typescript
        {/* Context breakdown */}
        <SectionHead label="Context Breakdown" />
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* ... existing pie markup, rebuilt in Task 13 ... */}
        </div>
      </div>
    </div>
  );
}
```

and insert a new block right before the final `</div>\n    </div>\n  );\n}` (i.e. after the Context Breakdown `card` div's closing tag, still inside `main-body`):

```typescript
        {/* Communication style */}
        <SectionHead label="Communication Style" />
        <div className="stat-grid">
          <Stat
            value={Math.round(richnessCurrent * 100)}
            unit="%"
            label="Vocabulary richness"
            hint="Unique words ÷ total words in this period — higher means more varied language."
            delta={richnessDelta}
            deltaDown={richnessDelta?.startsWith("↓")}
            accent="violet"
          />
        </div>

        <SectionHead label="Most-Used Words" />
        <div className="card">
          {topWords.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-4)", fontSize: 13 }}>
              No data yet — start dictating to see your most-used words.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topWords.map(({ word, count }, i) => (
                <div key={word} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 18, fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text-2)" }}>{word}</span>
                  <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open History → Insights, confirm the "Communication Style" section renders a Vocabulary richness stat and a Most-Used Words list (empty-state message if no transcriptions exist yet in the dev preview).

- [ ] **Step 6: Commit**

```bash
git add src/components/Home.tsx
git commit -m "feat: add vocabulary richness and most-used words to Insights"
```

---

## Task 12: Insights — filler trend + WPM trend sparklines

**Files:**
- Modify: `src/components/Home.tsx` (`InsightsScreen`, continuing from Task 11)

- [ ] **Step 1: Add the two `useMemo` bucket computations**

Right after the `richnessDelta` `useMemo` added in Task 11, add:

```typescript
  const fillerTrendData = useMemo(() => {
    const days = 30;
    const bins = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days) {
        bins[days - 1 - idx] += countFillerWords(t.raw_text ?? t.text, fillerWordsForInsights);
      }
    });
    return bins;
  }, [transcriptions, fillerWordsForInsights]);
  const maxFiller = Math.max(...fillerTrendData, 1);

  const wpmTrendData = useMemo(() => {
    const days = 30;
    const sums = new Array(days).fill(0);
    const counts = new Array(days).fill(0);
    const now = Date.now();
    transcriptions.forEach((t) => {
      const age = (now - new Date(t.created_at).getTime()) / 86400000;
      const idx = Math.floor(age);
      if (idx >= 0 && idx < days && t.duration_ms > 0) {
        const wpm = (wordCount(t.text) / t.duration_ms) * 60000;
        sums[days - 1 - idx] += wpm;
        counts[days - 1 - idx]++;
      }
    });
    return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
  }, [transcriptions]);
  const maxWpm = Math.max(...wpmTrendData, 1);
```

- [ ] **Step 2: Render the two sparklines**

Right after the "Most-Used Words" `card` div closing tag added in Task 11, add:

```typescript
        <SectionHead label="Filler Word Trend" />
        <div className="card">
          <svg width="100%" height="60" viewBox={`0 0 ${fillerTrendData.length * 12} 60`} preserveAspectRatio="none">
            {fillerTrendData.map((v, i) => {
              const h = (v / maxFiller) * 44;
              return <rect key={i} x={i * 12} y={54 - h} width={10} height={h + 2} rx={2} fill="rgba(251,191,36,0.4)" />;
            })}
          </svg>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            Last 30 days — {fillerTrendData.reduce((a, b) => a + b, 0)} filler word{fillerTrendData.reduce((a, b) => a + b, 0) === 1 ? "" : "s"} caught
          </div>
        </div>

        <SectionHead label="Speaking Pace Trend" />
        <div className="card">
          <svg width="100%" height="60" viewBox={`0 0 ${wpmTrendData.length * 12} 60`} preserveAspectRatio="none">
            {wpmTrendData.map((v, i) => {
              const h = (v / maxWpm) * 44;
              return <rect key={i} x={i * 12} y={54 - h} width={10} height={h + 2} rx={2} fill="rgba(125,211,252,0.4)" />;
            })}
          </svg>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
            Last 30 days — average words per minute per day
          </div>
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open History → Insights, confirm "Filler Word Trend" and "Speaking Pace Trend" sparklines render below "Most-Used Words" without layout overflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/Home.tsx
git commit -m "feat: add filler-word and speaking-pace trend sparklines to Insights"
```

---

## Task 13: Rebuild Context Breakdown from real `app_name` data

**Files:**
- Modify: `src/components/Home.tsx:1041-1062` (Context Breakdown block in `InsightsScreen`)

- [ ] **Step 1: Add the grouping computation**

In `InsightsScreen`, right after the `wpmTrendData`/`maxWpm` computation added in Task 12, add:

```typescript
  const contextBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    inRange.forEach((t) => {
      const key = t.app_name || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const restCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (restCount > 0) top.push(["Other", restCount]);
    return top;
  }, [inRange]);
  const contextTotal = contextBreakdown.reduce((s, [, c]) => s + c, 0) || 1;
  const CONTEXT_COLORS = ["var(--c-violet)", "var(--c-blue)", "var(--c-mint)", "var(--c-amber)", "var(--c-rose)", "var(--text-4)"];
```

- [ ] **Step 2: Replace the hardcoded pie markup**

Current (`src/components/Home.tsx:1041-1062`):

```typescript
        {/* Context breakdown */}
        <SectionHead label="Context Breakdown" />
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <svg width={100} height={100} viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.8" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--c-violet)" strokeWidth="3.8"
                strokeDasharray={`${transcriptions.length > 0 ? 100 : 0} 100`}
                strokeLinecap="round" transform="rotate(-90 18 18)" />
            </svg>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>All notes</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <Chip tone="blue" dot>Note</Chip>
              <div style={{ flex: 1, height: 4, background: "rgba(125,211,252,0.15)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "var(--c-blue)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{transcriptions.length}</span>
            </div>
          </div>
        </div>
```

Replace with:

```typescript
        {/* Context breakdown — which apps you actually dictated into, from real app_name data */}
        <SectionHead label="Context Breakdown" />
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {contextBreakdown.length === 0 ? (
            <div style={{ textAlign: "center", padding: "8px 0", color: "var(--text-4)", fontSize: 13, width: "100%" }}>
              No data yet — start dictating to see which apps you use most.
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center" }}>
                <svg width={100} height={100} viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.8" />
                  {(() => {
                    let cumulativePct = 0;
                    return contextBreakdown.map(([name, count], i) => {
                      const pct = (count / contextTotal) * 100;
                      const el = (
                        <circle
                          key={name}
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={CONTEXT_COLORS[i % CONTEXT_COLORS.length]}
                          strokeWidth="3.8"
                          strokeDasharray={`${pct} ${100 - pct}`}
                          strokeDashoffset={-cumulativePct}
                          strokeLinecap="butt"
                          transform="rotate(-90 18 18)"
                        />
                      );
                      cumulativePct += pct;
                      return el;
                    });
                  })()}
                </svg>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{contextTotal} notes</div>
              </div>
              <div style={{ flex: 1 }}>
                {contextBreakdown.map(([name, count], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <Chip dot>{name}</Chip>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(count / contextTotal) * 100}%`, height: "100%", background: CONTEXT_COLORS[i % CONTEXT_COLORS.length], borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open History → Insights, confirm the Context Breakdown pie renders multiple colored segments proportional to real transcription counts per app (or the empty state if no data).

- [ ] **Step 5: Commit**

```bash
git add src/components/Home.tsx
git commit -m "fix: rebuild Context Breakdown pie from real app_name data instead of a hardcoded stub"
```

---

## Task 14: History list — real app icons, tooltips, real context filters

**Files:**
- Modify: `src/components/Home.tsx:490-601` (`HistoryScreen`)

- [ ] **Step 1: Derive real context filters from `transcriptions`**

Current (`src/components/Home.tsx:522`):

```typescript
  const contextFilters = ["all", "email", "chat", "docs", "code"];
```

Replace with:

```typescript
  const contextFilters = useMemo(() => {
    const names = new Set(
      transcriptions.map((t) => t.app_name).filter((n): n is string => !!n)
    );
    return ["all", ...[...names].sort()];
  }, [transcriptions]);
```

- [ ] **Step 2: Wire the filter into `filtered`**

Current (`src/components/Home.tsx:496-501`):

```typescript
  const filtered = useMemo(() => {
    return transcriptions.filter((t) => {
      if (search && !t.text.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transcriptions, search]);
```

Replace with:

```typescript
  const filtered = useMemo(() => {
    return transcriptions.filter((t) => {
      if (search && !t.text.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter !== "all" && t.app_name !== filter) return false;
      return true;
    });
  }, [transcriptions, search, filter]);
```

- [ ] **Step 3: Fix the filter chip label rendering**

Current (`src/components/Home.tsx:546-557`):

```typescript
        <div style={{ display: "flex", gap: 4 }}>
          {contextFilters.map((f) => (
            <button
              key={f}
              className={`btn btn-sm${filter === f ? "" : " btn-ghost"}`}
              style={filter === f ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
```

Replace with:

```typescript
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {contextFilters.map((f) => (
            <button
              key={f}
              className={`btn btn-sm${filter === f ? "" : " btn-ghost"}`}
              style={filter === f ? { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.25)", color: "var(--c-violet)" } : {}}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
```

- [ ] **Step 4: Show the real app icon in list rows + add the title tooltip**

Current (`src/components/Home.tsx:577-598`):

```typescript
              return (
                <div
                  key={t.id}
                  className={`list-row${isSelected ? " selected" : ""}`}
                  style={{ gridTemplateColumns: "1fr" }}
                  onClick={() => setSelected(t)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.14)", display: "grid", placeItems: "center", color: "var(--c-blue)", flexShrink: 0 }}>
                      <Icons.FileText size={13} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                    <span>{dur}</span>
                    <span>{when}</span>
                  </div>
                </div>
              );
```

Replace with:

```typescript
              return (
                <div
                  key={t.id}
                  className={`list-row${isSelected ? " selected" : ""}`}
                  style={{ gridTemplateColumns: "1fr" }}
                  onClick={() => setSelected(t)}
                  title={t.text}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.14)", display: "grid", placeItems: "center", color: "var(--c-blue)", flexShrink: 0, overflow: "hidden" }}>
                      {t.app_icon ? <img src={t.app_icon} alt="" style={{ width: 16, height: 16 }} /> : <Icons.FileText size={13} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                    <span>{dur}</span>
                    <span>{when}</span>
                  </div>
                </div>
              );
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open History → Transcripts, confirm: filter chips reflect real app names (or just "All" if no `app_name` data exists in the dev preview's stored transcriptions), hovering a long list-row title shows the full text as a native tooltip, and rows with a stored `app_icon` show that icon instead of the generic file icon.

- [ ] **Step 7: Commit**

```bash
git add src/components/Home.tsx
git commit -m "fix: wire History context filters to real app_name data, show real app icons, add tooltips"
```

---

## Task 15: Remove dead Export and Play buttons

**Files:**
- Modify: `src/components/Home.tsx:526-534` (header `Export` button)
- Modify: `src/components/Home.tsx:628-637` (waveform strip `Play` button)

- [ ] **Step 1: Remove the Export button**

Current (`src/components/Home.tsx:526-534`):

```typescript
      <div className="main-header">
        <div>
          <div className="eyebrow">Library · {transcriptions.length} transcription{transcriptions.length !== 1 ? "s" : ""}</div>
          <h1 className="page-title"><em>History</em></h1>
        </div>
        <button className="btn btn-sm">
          <Icons.Download size={13} /> Export
        </button>
      </div>
```

Replace with:

```typescript
      <div className="main-header">
        <div>
          <div className="eyebrow">Library · {transcriptions.length} transcription{transcriptions.length !== 1 ? "s" : ""}</div>
          <h1 className="page-title"><em>History</em></h1>
        </div>
      </div>
```

- [ ] **Step 2: Remove the Play button**

Current (`src/components/Home.tsx:628-637`):

```typescript
              {/* Waveform strip */}
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 18px" }}>
                <button className="btn btn-sm" style={{ flexShrink: 0 }}>
                  <Icons.Play size={12} />
                </button>
                <Waveform bars={40} height={24} color="var(--c-violet)" static />
                <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  {fmtDuration(selected.duration_ms)}
                </span>
              </div>
```

Replace with:

```typescript
              {/* Waveform strip — decorative duration indicator, no audio is retained to play back */}
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 18px" }}>
                <Waveform bars={40} height={24} color="var(--c-violet)" static />
                <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  {fmtDuration(selected.duration_ms)}
                </span>
              </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. If `Icons.Play` or `Icons.Download` become unused elsewhere, that's fine — they're entries in the `Icons` namespace object, not standalone imports, so no unused-import error is possible.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open History → Transcripts, confirm no Export button in the header and no Play button on the waveform strip in the detail pane; the waveform itself still renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/Home.tsx
git commit -m "fix: remove dead Export and Play buttons from History"
```

---

## Task 16: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full Python test suite**

Run: `python -m pytest tests/sidecar/ -v`
Expected: all tests PASS, including the 7 new `strip_filler_words` tests.

- [ ] **Step 2: Full Rust build check**

Run: `cd src-tauri && cargo check`
Expected: `Finished` with no errors.

- [ ] **Step 3: Full TypeScript typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: End-to-end manual smoke test**

Run `npm run dev`, open the app in the browser preview (or the real Tauri app if available), and walk through:
- Settings → Dictionary → Filler Words: toggle off, toggle back on, add a custom word, remove it, reset to default.
- History → Transcripts: search box still filters; app-derived context chips filter the list; hovering a row shows the full text tooltip; no Export or Play buttons are present.
- History → Insights: Communication Style section (Vocabulary richness stat, Most-Used Words list, Filler Word Trend and Speaking Pace Trend sparklines) renders without layout overflow at all four range options (7d/30d/90d/all); Context Breakdown pie shows real segments (or its empty state) instead of the old fixed single-category circle.

- [ ] **Step 5: Push**

```bash
git push origin main
```
