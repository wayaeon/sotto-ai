# Library Toolbar and Filler Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize Library navigation and complete local filler cleanup without altering verbatim history.

**Architecture:** Keep the existing `HistoryScreen` and `FillerSection` boundaries. The Library owns search focus and toolbar layout; the sidecar remains the single cleanup authority, with the existing local setting bridge supplying its configuration.

**Tech Stack:** React + TypeScript, CSS, Tauri IPC, Python sidecar, pytest contract tests.

## Global Constraints

- No new dependencies or database migrations.
- Preserve verbatim transcript storage.
- Keep filler cleanup deterministic and offline.

---

### Task 1: Lock the Library behavior with contract tests

**Files:**
- Modify: `tests/test_history_visual_contract.py`
- Modify: `tests/test_library_and_insights_contract.py`

- [ ] **Step 1: Write failing assertions**

Assert the header mark is gone, the filter anchor and scrolling app rail are separate, the Library search input has a ref/id hook, row text is not sliced, and filler settings are synchronized from the existing section.

- [ ] **Step 2: Run focused tests and confirm they fail**

Run `sidecar\.venv\Scripts\python.exe -m pytest tests/test_history_visual_contract.py tests/test_library_and_insights_contract.py -q`.

- [ ] **Step 3: Implement the minimum UI and sync changes**

Update `src/components/Home.tsx` and `src/index.css` only where the failing contracts require.

- [ ] **Step 4: Re-run focused tests**

Run the same command and require all focused tests to pass.

### Task 2: Verify the complete app

**Files:**
- No additional files.

- [ ] **Step 1: Run the full Python suite**

Run `sidecar\.venv\Scripts\python.exe -m pytest tests -q`.

- [ ] **Step 2: Build the UI**

Run `pnpm run build`.

- [ ] **Step 3: Check the diff**

Run `git diff --check` and confirm only the intended tracked files are changed.
