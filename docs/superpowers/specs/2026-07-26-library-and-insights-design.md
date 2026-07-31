# Library and Insights rebuild

## Purpose

Sotto has two distinct jobs after dictation completes:

- **Library** is the durable workspace for finding, reviewing, cleaning, reusing, and exporting a specific transcript.
- **Insights** is the scorecard for understanding when voice is used, where it is used, and whether speaking habits are improving.

Neither page duplicates the other. Library answers “where is that thing I said?”; Insights answers “what is my voice workflow telling me?”

## Chosen direction

Use a focused library plus a practical scorecard. This keeps real work (retrieval and reuse) separate from retrospective analysis, rather than mixing analytics into every transcript or hiding transcripts behind a dashboard.

The visual language remains Sotto’s dark editorial style: a calm near-black canvas, an expressive serif display heading, compact mono metadata, violet only as the active accent, and ample negative space. Controls must be clear, tactile, keyboard-friendly, and at least 40px tall where they are primary targets.

## Library page

### Layout

- A quiet header states the library count and contains one primary search field.
- Search and app filters sit in a single toolbar. Filters are compact pills and only appear for apps that have transcripts.
- The left pane is a scrollable result list. Each row shows the app icon, an intelligible title, a one-line preview, duration, and relative date. The selected row has a restrained violet rail and surface, not a full-card treatment.
- The right pane is the active transcript workspace. It contains a readable title, one metadata line, the transcript body, and a compact actions menu.
- The visual-only waveform is removed: Sotto does not retain audio, so it would falsely imply playback.

### Actions and states

- **Copy** copies the current transcript and visibly confirms success.
- **Edit** turns the transcript body into an editable field; Save persists text locally and Cancel restores the saved text. This supports light cleanup before reuse.
- **Download** exports the selected text as a real UTF-8 `.txt` file named from its date and first words. The download element is attached before activation and its object URL is released asynchronously so desktop WebViews can finish the transfer.
- **Delete** requires a small inline confirmation and removes the local transcript. The next result becomes active; an empty state appears when none remain.
- Empty search/filter states explain how to recover; an empty library explains how new dictation arrives.

## Insights page

### Layout and decisions

One period selector (`7d`, `30d`, `90d`, `All time`) drives every insight on the page. The page does not show a chart merely because data exists.

1. **Voice at a glance** — sessions, words dictated, average speaking pace, and estimated time saved for the selected period. Each value compares with the immediately preceding equivalent period when meaningful.
2. **Rhythm** — one square day/hour heatmap that reveals the user’s productive dictation windows. It retains immediate tooltips and uses real timestamps only.
3. **Where voice goes** — a ranked app list with relative bars and session counts, replacing decorative donut-only context.
4. **Speaking habits** — vocabulary richness, filler-word count, and speaking pace over time. These are grouped because they describe how the user speaks, not when or where they dictate.

The current separate daily-volume, filler, and WPM charts are consolidated into the above narrative. No decorative waveform, duplicate session totals, or multiple independent time controls remain.

### Data rules

- All metrics derive from the locally stored `Transcription` fields: `text`, `raw_text`, `duration_ms`, `created_at`, and `app_name`.
- Insights never claim audio playback, cloud sync, or linguistic certainty.
- A metric with insufficient data renders a clear short explanation instead of a fabricated zero or empty chart.
- “Time saved” keeps the existing explicit estimate and labels it as an estimate.

## Architecture

- Split the current oversized `Home.tsx` presentation into small Library and Insights components, sharing only existing formatting, text-analysis, and data-store helpers.
- Add the smallest local persistence helper needed for transcript text updates/deletes; no backend, cloud API, or new UI library.
- Keep the existing transcript storage model and Tauri runtime boundaries intact.
- Use CSS classes for durable layout and interaction states instead of growing inline-style blocks.

## Verification

- Add focused regression coverage for transcript selection, search/filter behavior, local edit/delete persistence, and text export creation.
- Verify insight aggregation respects the selected period and has honest empty states.
- Run the existing Python test suite, the TypeScript production build, and a native Tauri smoke test for copy/download/edit/delete.
- Inspect the rendered desktop layout at the supported window size: no clipped panes, no fake audio control, square heatmap cells, readable tooltips, and no redundant sections.

## Scope boundaries

- No cloud sync, audio retention/playback, AI summaries, tags, folders, or database migration in this rebuild.
- No new dependency is needed; browser APIs and existing local storage cover the requested interactions.
