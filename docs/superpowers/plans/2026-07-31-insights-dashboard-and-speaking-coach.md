# Insights Dashboard and Speaking Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Insights bounded and interactive, add local synonym suggestions, and show one actionable speaking practice focus from the selected range.

**Architecture:** Keep `Home.tsx` as the route owner, but move deterministic synonym and coaching calculations into `src/lib/insights.ts`. `InsightsScreen` will derive all interaction state from the selected range and existing `Transcription[]`; word selection is passed to the route owner, which opens History with an initial search query. No network calls or changes to stored/injected text are introduced.

**Tech Stack:** React 19, TypeScript, existing CSS, localStorage-backed transcript analysis, Python source-contract tests, Vite build.

## Global Constraints

- Preserve original transcript text and keep analysis local and non-blocking.
- The selected range (`7d`, `30d`, `90d`, `all`) remains the single source of time range.
- No page-level horizontal scrolling; only the 365-day heatmap may scroll internally.
- Synonyms are suggestions only and unknown words return no suggestions.
- Practice focus must be deterministic, short, actionable, and must not claim clinical certainty.
- Do not add dependencies or network requests.

---

### Task 1: Add failing contracts for the Insights behavior

**Files:**
- Create: `tests/test_insights_dashboard_contract.py`
- Modify: `tests/test_library_and_insights_contract.py`

**Interfaces:**
- Tests will require `src/lib/insights.ts` to export `synonymsForWord` and `derivePracticeFocus`.
- Tests will require `InsightsScreen` to render bounded layout classes, interactive context/word controls, and a practice-focus section.

- [x] **Step 1: Write the failing tests**

```python
from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_insights_helpers_have_local_synonyms_and_actionable_focus():
    source = (ROOT / "src/lib/insights.ts").read_text(encoding="utf-8")
    assert "export function synonymsForWord" in source
    assert "export function derivePracticeFocus" in source
    assert "return []" in source


def test_insights_layout_is_bounded_and_interactive():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "insights-grid" in source
    assert "insights-context-button" in source
    assert "insights-word-button" in source
    assert "Practice focus" in source


def test_heatmap_has_an_internal_scroll_boundary():
    css = (ROOT / "src/index.css").read_text(encoding="utf-8")
    assert ".insights-heatmap-scroll" in css
    assert ".insights-page" in css
    assert "overflow-x: hidden" in css
```

- [x] **Step 2: Run the focused tests and confirm they fail**

Run: `sidecar\\.venv\\Scripts\\python.exe -m pytest tests\\test_insights_dashboard_contract.py -q`

Expected: FAIL because the helper module, layout classes, and bounded CSS do not exist yet.

### Task 2: Implement deterministic synonyms and practice focus

**Files:**
- Create: `src/lib/insights.ts`
- Test: `tests/test_insights_dashboard_contract.py`

**Interfaces:**
- `synonymsForWord(word: string): string[]` returns up to three local alternatives or `[]` for unknown/technical words.
- `derivePracticeFocus(input): { title: string; detail: string; prompt: string }` consumes filler count, repeated-word count, pace, and vocabulary richness.

- [x] **Step 1: Implement the smallest local dictionaries and deterministic focus rules**

```ts
export function synonymsForWord(word: string): string[] {
  return SYNONYMS[word.trim().toLowerCase()] ?? [];
}

export function derivePracticeFocus(input: PracticeSignals): PracticeFocus {
  if (input.fillerRate > 0.08) return { title: "Create a cleaner pause", detail: "Filler words are your clearest current signal.", prompt: "Pause for one beat instead of saying ‘um’ or ‘like’." };
  if (input.repeatedWords > 0) return { title: "Finish each thought once", detail: "Repeated words are showing up in recent sessions.", prompt: "Say the sentence once, then leave a short pause before continuing." };
  if (input.wpm > 170) return { title: "Give important words room", detail: "Your recent pace is running high.", prompt: "Slow the next sentence slightly and land the final word." };
  return { title: "Keep expanding your vocabulary", detail: "Your current signals are steady.", prompt: "Replace one familiar word with a more precise alternative." };
}
```

- [x] **Step 2: Run the focused tests and confirm they pass**

Run: `sidecar\\.venv\\Scripts\\python.exe -m pytest tests\\test_insights_dashboard_contract.py -q`

Expected: PASS for helper exports and fallbacks.

### Task 3: Rebuild Insights layout and interactions

**Files:**
- Modify: `src/components/Home.tsx:989-1218`
- Modify: `src/components/Home.tsx:450-510,2711-2820`
- Modify: `src/index.css:585-660` (Insights styles are appended near the existing history styles)
- Test: `tests/test_insights_dashboard_contract.py`

**Interfaces:**
- `InsightsScreen` keeps the current `transcriptions` prop and range selector, and receives `onViewChange` plus `onWordSelect` callbacks.
- Context and word selections are local UI state only.
- Word selection calls `onWordSelect`, which stores the search term and opens History; it does not mutate transcripts.

- [x] **Step 1: Add layout and interaction state**

Use `selectedContext` and `selectedWord` state, derive the filtered context rows and visible word list from `inRange`, and render context rows/words as buttons with accessible labels. Add `historySearch` state to `Home`, pass it as `initialSearch` to `HistoryScreen`, and clear it after the History screen consumes it.

- [x] **Step 2: Add bounded layout wrappers**

Wrap the Insights body with `insights-page`, use `insights-grid` for wide-screen pairs, and wrap only the 365-day heatmap contents in `insights-heatmap-scroll`. Set `min-width: 0` on cards and `overflow-x: hidden` on the page.

- [x] **Step 3: Add synonym rows and practice focus**

Render up to three alternatives below each known most-used word. Add a compact `Practice focus` card using `derivePracticeFocus` and existing analysis metrics.

- [x] **Step 4: Run focused tests and build**

Run: `sidecar\\.venv\\Scripts\\python.exe -m pytest tests\\test_insights_dashboard_contract.py tests\\test_library_and_insights_contract.py -q`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS with only the existing ineffective dynamic-import warning.

### Task 4: Full verification and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-31-insights-dashboard-and-speaking-coach.md`

- [x] **Step 1: Run the complete test suite**

Run: `sidecar\\.venv\\Scripts\\python.exe -m pytest tests -q`

Expected: all tests pass.

- [x] **Step 2: Run the production build**

Run: `pnpm run build`

Expected: production bundle succeeds.

- [x] **Step 3: Review the diff for overflow and dead controls**

Run: `git diff --check` and `rg -n "Download|Edit|overflow-x: auto" src/components/Home.tsx src/index.css`

Expected: no transcript Download/Edit controls; only the heatmap owns internal horizontal scrolling.

- [x] **Step 4: Commit the implementation**

```bash
git add src/lib/insights.ts src/components/Home.tsx src/index.css tests/test_insights_dashboard_contract.py tests/test_library_and_insights_contract.py docs/superpowers/plans/2026-07-31-insights-dashboard-and-speaking-coach.md
git commit -m "feat: make insights interactive and actionable"
```
