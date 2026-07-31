# Insights Dashboard and Speaking Coach

## Goal

Make Insights compact, bounded, and interactive while turning the existing transcript metrics into one useful speaking-improvement loop. Preserve the original transcript text and keep all analysis local and non-blocking.

## Scope

### 1. Balanced dashboard layout

- Keep the existing range selector (`7d`, `30d`, `90d`, `all`) as the single source of time range.
- Use a responsive grid instead of one long vertical stack:
  - period metrics across the top;
  - activity heatmap beside context breakdown on wide screens;
  - communication style beside accuracy signals;
  - most-used words beside trend cards where space allows.
- Collapse to one column below the existing app breakpoint.
- Remove visual bleed by applying `min-width: 0`, bounded card surfaces, and explicit overflow rules. The 365-day heatmap may scroll inside its own content region; no other card may create page-level horizontal overflow.

### 2. Interaction

- Heatmap cells remain keyboard-focusable and show an in-theme detail tooltip for the selected day/hour.
- Context rows are buttons. Selecting one highlights it and exposes the matching session count; selecting again clears it.
- Most-used words are buttons. Selecting a word opens the Library view with that word as the search query.
- The active range drives every metric, chart, and interaction state.
- Empty states remain honest and actionable; no control pretends to do work it cannot perform.

### 3. Synonyms

- Each frequent word may show a compact “alternatives” row.
- Synonyms come from a small local dictionary for common conversational words. Unknown or technical terms show no alternatives rather than fabricated suggestions.
- Synonyms are suggestions only: they never rewrite stored or injected text.

### 4. Speaking improvement loop

- Derive a single practice focus from existing local data:
  - filler frequency trend;
  - repeated-word flags;
  - speaking pace trend;
  - vocabulary richness.
- Prefer the largest actionable change over generic encouragement.
- Show the focus with one short explanation and one concrete next-session prompt.
- Recompute it from the selected range; do not persist a subjective score or claim clinical/language certainty.

## Data flow

`Transcription[]` → range filter → memoized metrics → bounded interactive cards.

Existing local analysis records remain the source for raw-vs-final and review signals. Synonym lookup and practice-focus selection are synchronous, deterministic, and local. No network request is added to dictation, paste, or history persistence.

## Error and accessibility behavior

- Missing app names, analysis records, or dictionary entries fall back to existing empty labels.
- Every interactive chart element has an accessible name and keyboard focus state.
- Tooltips are supplemental; the same detail is available through `aria-label`/selected text.
- Respect existing reduced-motion behavior and avoid page-level horizontal scrolling.

## Verification

- Add source contracts for bounded layout, interactive controls, synonym rendering, and practice-focus derivation.
- Run the full Python test suite and `pnpm run build`.
- Manually verify at narrow and wide window sizes: no card edge overlap, no clipped controls, and no unexpected horizontal page scrollbar.
