# Library Toolbar and Filler Cleanup

## Goal

Make Library navigation understandable and stable while making local filler-word cleanup reliable without changing the verbatim history record.

## Design

- Remove the decorative Library header mark because it has no action or status meaning.
- Keep the search input at a stable width, keep the All-app filter button outside the scrolling region, and let ranked app icons scroll horizontally in their own rail.
- Rank app filters by transcription count, with alphabetical order as the tie-breaker.
- Make Ctrl+K focus and select the Library search input; preserve the command palette shortcut on other views.
- Render complete transcript text into rows and let CSS clamp titles/previews at readable line boundaries instead of slicing at arbitrary character counts.
- Keep filler cleanup local and opt-in through the existing setting. The cleaned string is pasted into the focused app; raw text remains the stored transcript and analysis source.

## Constraints

- No new dependencies or database migrations.
- Preserve the existing history detail behavior and app icon extraction.
- Keep cleanup deterministic and offline.

## Verification

- Contract tests assert fixed filter/scroll markup, context-aware Ctrl+K, semantic row text, and filler sync behavior.
- Run the full Python suite and the production UI build.
