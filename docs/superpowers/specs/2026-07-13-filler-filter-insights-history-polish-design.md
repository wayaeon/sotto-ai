# Filler-Filter, Communication-Style Insights & History/Insights Polish

**Date:** 2026-07-13
**Goal:** Add a local, rule-based filler-word filter to the dictation pipeline; add communication-style analytics (most-used words, filler trend, WPM trend, vocabulary richness) to the Insights tab; and remove dead UI / add tooltips across the Transcripts and Insights tabs.

---

## Problem

Three independent gaps, bundled because they touch the same two screens (History → Transcripts, History → Insights):

1. No way to clean filler words ("um", "uh", "like", "you know"...) out of dictated text before it's pasted.
2. Insights only shows volume/speed/session-count stats — nothing about *how* the user speaks (vocabulary, filler frequency, pace trend).
3. Transcripts and Insights both ship dead UI that violates `DESIGN.md` §9 rule 2 ("no dead buttons"): the Export button and the waveform Play button have no handler, the context filter chips (All/Email/Chat/Docs/Code) don't actually filter anything, and the Insights "Context Breakdown" pie is hardcoded to always render a single fake category. Neither screen has tooltips on truncated text or icon-only controls.

---

## 1. Filler-Filter

### Data flow

```
Settings → Dictionary tab → new "Filler Words" section
  (toggle: on/off, default on; editable word/phrase list, seeded with defaults)
       │ setFillerConfig(enabled, words)          [src/lib/tauri.ts]
       ▼
Tauri command: set_filler_config                   [src-tauri/src/commands.rs]
       │ send_command({cmd: "set_filler_config", enabled, words})
       ▼
sidecar main.py: Command.SET_FILLER_CONFIG
       │ recorder.set_filler_config(enabled, words)
       ▼
Recorder._filler_enabled / Recorder._filler_words   [sidecar/recorder.py]
       │ used by _postprocess_transcript() on every completed utterance
       ▼
cleanup.py: strip_filler_words(text, words) -> str
```

### `cleanup.py`

New function, same style as `restore_readable_transcript` (pure regex, no LLM, no network):

```python
def strip_filler_words(text: str, filler_words: list[str]) -> str:
    """Remove filler words/phrases as whole tokens or phrases, then clean up
    the whitespace/punctuation left behind (double spaces, orphaned commas)."""
```

- Single-word fillers ("um", "like") matched with `\b...\b` word-boundary regex, case-insensitive.
- Multi-word fillers ("you know", "i mean") matched as literal phrases (still word-boundary-anchored).
- After removal: collapse repeated whitespace, strip orphaned punctuation left dangling at a former filler's position (e.g. `"Hello , um, world"` → filler removal must not leave `"Hello , world"` — merge/clean the punctuation, not just the word).
- Built-in default list (ships in the frontend, editable, not hardcoded in Python): um, umm, uh, uhh, like, you know, i mean, sort of, kind of, actually, basically, literally, so yeah.

### `recorder.py`

`_postprocess_transcript` changes signature to return `(final_text, raw_text_or_none)`:

```python
def _postprocess_transcript(self, text: str) -> tuple[str, str | None]:
    if self._runtime() == "onnx":
        text = restore_readable_transcript(text)
    else:
        text = text.strip()
    if not self._filler_enabled or not self._filler_words:
        return text, None
    filtered = strip_filler_words(text, self._filler_words)
    if filtered == text:
        return text, None
    return filtered, text  # raw_text is the pre-filter snapshot
```

`raw_text` is only non-`None` when filtering actually changed something — avoids storing a redundant duplicate on every single utterance.

New state + setter, mirroring `set_dictionary`:

```python
def set_filler_config(self, enabled: bool, words: list[str]) -> None:
    self._filler_enabled = enabled
    self._filler_words = words
```

The `SEGMENT_DONE` call site (around `recorder.py:413`) gains `raw_text=raw` in its payload.

### IPC / Tauri plumbing

- `sidecar/ipc.py`: add `SET_FILLER_CONFIG = "set_filler_config"` to `Command`.
- `sidecar/main.py`: new `elif cmd == Command.SET_FILLER_CONFIG:` branch calling `recorder.set_filler_config(enabled, words)`.
- `src-tauri/src/commands.rs`: new `set_filler_config(app, enabled, words)` mirroring `set_dictionary`.
- `src-tauri/src/main.rs`: register the new command in the `generate_handler!` list.
- `src/lib/tauri.ts`: `export const setFillerConfig = (enabled: boolean, words: string[]) => invoke("set_filler_config", { enabled, words });`

### Frontend storage & UI

- `localStorage` keys: `verba_filler_enabled` (bool, default `true`), `verba_filler_words` (string[], default the built-in list), following the exact pattern of `verba_dictionary`.
- Settings → Dictionary tab (`DictPanel`, `Home.tsx:1931`) gains a second section, `SectionHead label="Filler Words"`, with: on/off toggle, add/remove list (same row UI as the dictionary entries list), "Reset to default" button.
- Toggling or editing calls `setFillerConfig(enabled, words)` (fire-and-forget, same `.catch(() => {})` pattern already used for `setDictionary`).

### `db.ts` / `useSidecar.ts`

- `Transcription` interface gains `raw_text: string | null`.
- `insertTranscription()` gains an optional `rawText` param, stored as `raw_text`.
- `useSidecar.ts` `segment_done` handler reads `msg.raw_text` from the event and threads it into `insertTranscription(...)`.

---

## 2. Communication-Style Insights

New "Communication Style" section in `InsightsScreen` (`Home.tsx:957`), placed after the existing "Context Breakdown" section (see §3 below for that section's own rebuild), computed client-side from `transcriptions` already in scope — no new backend calls. Respects the existing 7d/30d/90d/all `range` state already in the component.

All four metrics operate on `t.raw_text ?? t.text` for filler-related counting (so the count reflects what was actually said, whether or not the live filter is on) and on `t.text` for word-count/vocabulary metrics (reflecting the final output).

- **Most-used words** — tokenize, lowercase, strip punctuation; exclude a small built-in stop-word list (the/a/an/is/it/to/and/...) and the user's current filler-word list. Rank by frequency, show top ~12 as a plain ranked list (label + mono-font count), not a word cloud — matches the existing ranked-row visual language already used elsewhere (e.g. dictionary entries), not a decorative flourish.
- **Filler trend** — per-entry filler-word match count against `raw_text ?? text`, bucketed by day over the selected range, rendered with the same sparkline SVG pattern as "Daily Volume" (`Home.tsx:1016`-ish).
- **Speaking pace (WPM) trend** — per-entry `wordCount / (duration_ms / 60000)`, bucketed by day, same sparkline treatment.
- **Vocabulary richness** — unique words ÷ total words across the selected range, one `Stat` card, with a comparison against the same-length prior period (per `DESIGN.md` hard rule: stats require a comparison or they render as ambient text instead).

---

## 3. Transcripts & Insights: remove dead UI, wire real data, add tooltips

### Dead UI removal/repair

| Element | Location | Current state | Fix |
|---|---|---|---|
| Export button | `HistoryScreen`, `Home.tsx:531` | No `onClick` | **Remove** — out of scope per user, a dead button is worse than no button. |
| Play button on waveform strip | `HistoryScreen`, `Home.tsx:630` | No `onClick`, no audio ever stored | **Remove** the button; keep the static waveform as a decorative duration indicator only. |
| Context filter chips (All/Email/Chat/Docs/Code) | `HistoryScreen`, `Home.tsx:522,546` | `filter` state is set but never read by the `filtered` memo | Replace the hardcoded category list with chips derived from **actual distinct `app_name` values** present in `transcriptions` (plus "All"). Wire `filtered` to check `t.app_name === filter` when filter !== "all". |
| Context Breakdown pie | `InsightsScreen`, `Home.tsx:1042` | Hardcoded single category, ignores real data | Rebuild from a real `app_name` grouping (count per app, top 5 + "Other" bucket for the rest, null `app_name` grouped as "Unknown"), same donut-chart SVG technique already in place, multiple segments instead of one. |
| Generic file icon on list rows | `HistoryScreen`, `Home.tsx:585` | Always `Icons.FileText` in a fixed blue box | Use `t.app_icon` (already stored per-transcription from this session's app-detection work) when present, falling back to `Icons.FileText` in the same box when null. |

### Tooltips

- List-row title/preview (`Home.tsx:589-590`, currently `overflow: hidden; text-overflow: ellipsis` with no way to see the full text without clicking): add `title={t.text}` on the row.
- Insights stat labels that need explaining (e.g. "Vocabulary richness", "Filler trend"): add a `title` attribute with a one-line plain-English definition on the label element. Reuse the existing `Stat` component's label slot — add an optional `hint` prop that renders as `title` on the label span.
- Icon-only controls (Copy/Download buttons already have text labels so are fine as-is; any remaining icon-only control gets a `title`).

No new tooltip library — native `title` attributes are consistent with the app's "no decorative flourish" visual language and need zero new dependencies.

---

## Testing

- `sidecar/tests/test_cleanup.py`: new cases for `strip_filler_words` — single-word removal, multi-word phrase removal, punctuation cleanup, no-op when word not present, empty list is a no-op.
- `sidecar/tests/test_recorder.py` (or wherever `_postprocess_transcript` is covered): verify `raw_text` is `None` when nothing changes and set when filtering strips something.
- Frontend: no new test infra introduced; the analytics functions (most-used words, filler trend, WPM trend, vocabulary richness) should be small enough pure functions to unit-test if the project has a JS/TS test runner already wired up (check before adding one).

---

## Out of scope

- Bulk/CSV export (user explicitly deferred all Export functionality for now).
- LLM-based or ML-based filler/disfluency detection — rule-based word-list matching only, consistent with the rest of `cleanup.py` and the project's local-only, low-latency architecture.
- Per-transcription audio playback (no audio files are retained; adding that is a separate, larger feature).
