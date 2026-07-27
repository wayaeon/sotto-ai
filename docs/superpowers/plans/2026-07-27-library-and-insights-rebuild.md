# Library and Insights Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Sotto’s transcript Library and Insights views into a focused, functional workspace and a non-redundant voice-usage scorecard.

**Architecture:** Keep `Home.tsx` as the route owner, but move the Library and Insights visual work into focused components that consume existing `Transcription` data. Add small local-storage functions for editing and deleting transcripts; derive every insight from stored transcript fields, with one shared period selection.

**Tech Stack:** React 19, TypeScript, Vite, CSS custom properties, browser Clipboard/Blob APIs, localStorage, pytest source-contract tests.

## Global Constraints

- No new dependency, backend, cloud sync, audio retention/playback, AI summary, tag, folder, or database migration.
- The sole accent is violet; primary interactive targets are at least 40px tall/wide.
- All cards and controls use explicit CSS transition properties, never `transition: all`.
- Insights use only `text`, `raw_text`, `duration_ms`, `created_at`, and `app_name`; insufficient data must say so.
- Preserve the existing Tauri runtime boundaries and transcript storage key.

---

## File structure

- `src/lib/db.ts` — transcript local-storage CRUD functions used by Library.
- `src/components/library/LibraryScreen.tsx` — search, app filter, selection, edit, copy, export, delete, and empty states.
- `src/components/insights/InsightsScreen.tsx` — selected-period scorecard, rhythm heatmap, app ranking, and speaking habits.
- `src/components/Home.tsx` — imports the two screens and retains the existing tab/routing shell and shared formatting helpers.
- `src/index.css` — layout and interaction styles for the new components.
- `tests/test_library_and_insights_contract.py` — source-level regression contract for persisted transcript actions, real export, one shared insight range, and removal of the fake waveform.

### Task 1: Add local transcript edit and delete persistence

**Files:**
- Modify: `src/lib/db.ts`
- Create: `tests/test_library_and_insights_contract.py`

**Interfaces:**
- Consumes: `Transcription`, private `load(): Transcription[]`, `TRANSCRIPTIONS_KEY`.
- Produces: `updateTranscription(id: number, text: string): Transcription | null` and `deleteTranscription(id: number): boolean`.

- [ ] **Step 1: Write the failing source-contract test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_transcript_store_supports_editing_and_deleting_items():
    source = (ROOT / "src/lib/db.ts").read_text(encoding="utf-8")
    assert "export function updateTranscription(" in source
    assert "export function deleteTranscription(" in source
    assert "localStorage.setItem(TRANSCRIPTIONS_KEY" in source
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_library_and_insights_contract.py::test_transcript_store_supports_editing_and_deleting_items -q`

Expected: FAIL because neither export exists.

- [ ] **Step 3: Implement the minimum persistence functions**

```ts
export function updateTranscription(id: number, text: string): Transcription | null {
  const items = load();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated = { ...items[index], text };
  items[index] = updated;
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(items));
  return updated;
}

export function deleteTranscription(id: number): boolean {
  const items = load();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(next));
  return true;
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `python -m pytest tests/test_library_and_insights_contract.py::test_transcript_store_supports_editing_and_deleting_items -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts tests/test_library_and_insights_contract.py
git commit -m "feat: persist transcript edits and deletes"
```

### Task 2: Build the functional Library workspace

**Files:**
- Create: `src/components/library/LibraryScreen.tsx`
- Modify: `src/components/Home.tsx`
- Modify: `src/index.css`
- Modify: `tests/test_library_and_insights_contract.py`

**Interfaces:**
- Consumes: `Transcription`, `updateTranscription`, `deleteTranscription`, `fmtDuration`, `relativeTime`, and `wordCount`.
- Produces: `LibraryScreen({ transcriptions, onChanged }): JSX.Element`, where `onChanged()` reloads the local transcript list in `Home`.

- [ ] **Step 1: Add a failing Library contract**

```python
def test_library_has_real_actions_and_no_decorative_audio_control():
    source = (ROOT / "src/components/library/LibraryScreen.tsx").read_text(encoding="utf-8")
    assert "updateTranscription" in source
    assert "deleteTranscription" in source
    assert "navigator.clipboard.writeText" in source
    assert "URL.createObjectURL" in source
    assert "document.body.appendChild" in source
    assert "Waveform" not in source
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_library_and_insights_contract.py::test_library_has_real_actions_and_no_decorative_audio_control -q`

Expected: FAIL because `LibraryScreen.tsx` does not exist.

- [ ] **Step 3: Implement the workspace**

Create `LibraryScreen` with the following behavior:

```tsx
function downloadTranscript(item: Transcription) {
  const blob = new Blob([item.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sotto-${item.created_at.slice(0, 10)}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

Use one search input and app-filter pills; clamp selection to the filtered results. Render the active transcript with Copy, Edit/Save/Cancel, Download, and a two-step inline Delete confirmation. Call `onChanged()` after a successful save or deletion. Show recovery-focused empty states. Remove the old `HistoryScreen` and decorative waveform from `Home.tsx` after its replacement is imported.

- [ ] **Step 4: Style the Library**

Add component-scoped CSS classes for a two-pane grid, result rows, selected rail, editor, compact action bar, and mobile/narrow-width fallback. Use a 40px minimum action hit area, explicit `opacity`, `background-color`, `color`, and `transform` transitions, and `font-variant-numeric: tabular-nums` for duration/date metadata.

- [ ] **Step 5: Run the focused contract and production build**

Run: `python -m pytest tests/test_library_and_insights_contract.py -q`

Expected: PASS.

Run: `pnpm run build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/library/LibraryScreen.tsx src/components/Home.tsx src/index.css tests/test_library_and_insights_contract.py
git commit -m "feat: rebuild transcript library"
```

### Task 3: Build the selected-period Insights scorecard

**Files:**
- Create: `src/components/insights/InsightsScreen.tsx`
- Modify: `src/components/Home.tsx`
- Modify: `src/index.css`
- Modify: `tests/test_library_and_insights_contract.py`

**Interfaces:**
- Consumes: `Transcription`, `Metrics`, `wordCount`, `fmtMinutes`, `getFillerWords`, `countFillerWords`, `mostUsedWords`, and `vocabularyRichness`.
- Produces: `InsightsScreen({ transcriptions, metrics }): JSX.Element`.

- [ ] **Step 1: Add a failing scorecard contract**

```python
def test_insights_uses_one_shared_period_and_real_data_sections():
    source = (ROOT / "src/components/insights/InsightsScreen.tsx").read_text(encoding="utf-8")
    assert "const [range, setRange]" in source
    assert '"7d"' in source and '"30d"' in source and '"90d"' in source
    assert "app_name" in source
    assert "raw_text" in source
    assert "data-tooltip" in source
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_library_and_insights_contract.py::test_insights_uses_one_shared_period_and_real_data_sections -q`

Expected: FAIL because `InsightsScreen.tsx` does not exist.

- [ ] **Step 3: Implement the scorecard**

Derive `inRange` and the immediately preceding `priorRange` from a single `range` state. Render exactly four sections:

1. Voice-at-a-glance: sessions, word count, average WPM, and explicitly estimated time saved, with a comparison when `priorRange` is non-empty.
2. Rhythm: reuse the existing square heatmap and immediate `data-tooltip` pattern, but pass only `inRange` and remove its independent date-range controls.
3. Where voice goes: sorted app list with count and proportional bar; group entries beyond five as Other.
4. Speaking habits: vocabulary richness, total filler words from `raw_text ?? text`, and a daily pace/filler chart for the chosen interval.

Replace the old `InsightsScreen` in `Home.tsx`; delete its duplicate daily volume/donut/independent heatmap modes. Each section must render a short insufficient-data sentence when no values are meaningful.

- [ ] **Step 4: Style the scorecard**

Use a two-column grid that collapses cleanly, shallow violet surface emphasis only for the main scorecard, square CSS-grid heatmap cells, and a fixed minimum 40px tooltip target. Keep metric values tabular and headings balanced.

- [ ] **Step 5: Run the focused contract and production build**

Run: `python -m pytest tests/test_library_and_insights_contract.py -q`

Expected: PASS.

Run: `pnpm run build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/insights/InsightsScreen.tsx src/components/Home.tsx src/index.css tests/test_library_and_insights_contract.py
git commit -m "feat: rebuild voice insights"
```

### Task 4: Verify the integrated desktop flow

**Files:**
- Modify: `tests/test_library_and_insights_contract.py`

**Interfaces:**
- Consumes: completed Library and Insights components and current dev launcher.
- Produces: a verified native smoke path and final source contract.

- [ ] **Step 1: Add the integration contract**

```python
def test_home_uses_the_rebuilt_library_and_insights_screens():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "LibraryScreen" in source
    assert "InsightsScreen" in source
    assert "function HistoryScreen" not in source
```

- [ ] **Step 2: Run the test to verify it fails before the replacement is complete**

Run: `python -m pytest tests/test_library_and_insights_contract.py::test_home_uses_the_rebuilt_library_and_insights_screens -q`

Expected: FAIL until `Home.tsx` imports and renders both replacement screens.

- [ ] **Step 3: Connect the replacement screens and remove dead History code**

Import the new components, pass `transcriptions`, `metrics`, and the reload callback from `Home`, then delete the replaced History/Insights functions and now-unused imports/helpers from `Home.tsx`.

- [ ] **Step 4: Run complete verification**

Run: `python -m pytest -q`

Expected: all tests pass.

Run: `pnpm run build`

Expected: exit 0.

Run: `pnpm exec tauri dev`

Expected: native app starts. Manually verify search/filter, selection, copy confirmation, edit/save/cancel, download, delete confirmation, narrow window layout, range switch, heatmap tooltip, app ranking, and empty states.

- [ ] **Step 5: Commit**

```bash
git add src/components/Home.tsx src/index.css tests/test_library_and_insights_contract.py
git commit -m "test: verify library and insights rebuild"
```

## Self-review

- Spec coverage: Tasks 1–2 cover durable Library retrieval, editing, deletion, copy, and real text export. Task 3 covers every requested non-redundant Insight section and shared period logic. Task 4 covers native presentation and integration.
- No placeholders: implementation paths, functions, source contracts, commands, and expected outcomes are explicit.
- Type consistency: `LibraryScreen` receives `Transcription[]` and an `onChanged(): void` callback; `InsightsScreen` receives `Transcription[]` and `Metrics`; both are owned by `Home`.
