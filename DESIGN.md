# Verba — Design System v2: Voice-First Minimal

> **The pill is the product. The window is support.**
> Verba is an instrument you speak into, not a dashboard you read.
> Every screen must answer one question within two seconds: *"press this and talk."*

This document is the source of truth for all UI decisions. Update it before adding new components.

---

## 1. Philosophy

The v1 UI was a reporting dashboard: greeting → stats → cards. It communicated
*what happened* instead of *what to do*. v2 inverts this:

1. **One focal object per surface.** The main window has exactly one hero: the
   voice state. Everything else is ambient.
2. **The window is rarely open.** Users live in other apps and use the pill +
   hotkey. The main window exists for: first-run, history lookup, settings,
   and occasional insight. Design for the 30-second visit, not the 30-minute one.
3. **State over stats.** The most important information is *current state*
   (model loaded? mic live? what hotkey?), not lifetime aggregates.
4. **Numbers never break.** No `word-break` on data. If a value can't fit,
   the layout is wrong — fix the layout, not the number.

## 2. Information Architecture

v1 had seven nav destinations. v2 has three, plus the pill:

```
TALK      — the voice surface (replaces Home)
HISTORY   — transcripts + insights (merged)
SETTINGS  — general/audio/hotkeys/AI/dictionary/privacy/commands/account
---
PILL      — always-on overlay, the real product
DEBUG     — dev-only, hidden behind a flag/shortcut
```

Migration of v1 views:

| v1 view   | v2 home                                            |
|-----------|----------------------------------------------------|
| Home      | → Talk                                             |
| History   | → History (tab: Transcripts)                       |
| Insights  | → History (tab: Insights)                          |
| Commands  | → Settings → Commands                              |
| Settings  | → Settings                                         |
| Account   | → Settings → Account (footer card stays in nav)    |
| Debug     | → hidden; open via Ctrl+Shift+D or tray menu       |

Navigation collapses from a 7-item sidebar to a 3-item rail. The rail is
icon+label, 200px, collapsible to 56px icons-only (already built — keep).

## 3. The Talk Surface (main window)

Centered, vertical, generous space. No grid of cards. Top to bottom:

```
(ambient header)            eyebrow: model + status chip

      ◉ MIC                 the hero: 96px orb, state-colored,
  "Start dictating"         breathing animation when idle
hold Ctrl+Win anywhere

--- last transcription ---  one line, italic serif, click → History
"the last thing you said…"

today: 312 words · 96 wpm   ONE quiet metrics line, mono, text-3. No cards.
```

### The Orb (hero)

- 96px circle, `--surface-2` base, violet ring.
- Click = toggle hands-free. Hold-to-talk hint sits directly beneath.
- It is a **status display and a button at once** — its state IS the app state:

| State        | Visual                                              |
|--------------|-----------------------------------------------------|
| loading      | dim, slow pulse, "Loading <model>…" beneath         |
| idle/ready   | violet ring, slow 4s breathing scale (1.00→1.03)    |
| recording    | mint ring, live waveform inside the orb             |
| processing   | amber ring, spinner segment rotating on ring        |
| error        | rose ring, error text beneath, click retries        |

- The orb never moves. States crossfade in place (no layout shift).

### Ambient metrics line

One line, not four cards: `today: 312 words · 96 wpm · streak 4d`.
Mono font, `--text-3`, 12px. Clicking it opens History → Insights.
Lifetime aggregates live in Insights only. **Delete the stat-card grid from Talk.**

### Greeting

Keep the serif greeting ("Good evening, *You*") — it's the brand's strongest
element — but at 28px (was 42px) so the orb outranks it. Eyebrow date stays.

## 4. History

Two tabs in one view: **Transcripts** (default) and **Insights**.

- Transcripts: the existing list rows are good. Add inline copy button on
  hover, and full-text search at top (the command palette pattern exists —
  reuse it).
- Insights: the v1 stat cards + sparkline move here, with the v2 stat rules:
  - Stat values: `white-space: nowrap`, **no ellipsis on numeric values** —
    cards must size to content (`grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))`).
  - Labels never truncate to one letter. If a label would ellipsize at the
    card's minimum width, shorten the label text itself ("Words dictated" →
    "Words").
  - Every stat must include a comparison ("↑ 12% vs last week") or it doesn't
    earn a card. No comparison data → render in the ambient line style instead.

## 5. Settings

Existing tab structure is sound; absorb Commands and Account as tabs.
Rules:

- Each tab is a single scrolling column, max-width 560px. No multi-column.
- Every control row: label left, control right, description beneath label
  (13px, `--text-3`).
- Model picker (Models/AI tab): cards list the full catalog with runtime,
  size, and a **Default badge**; selection persists and loads on startup.
  Show current load state inline (loaded / loading / failed + retry).

## 6. The Pill (overlay)

Already stabilized — do not redesign its mechanics. Visual alignment only:

- Same state colors as the orb (violet idle, mint recording, amber processing,
  rose error). The pill and orb are the same object at two sizes.
- Collapsed: 60px handle. Expanded: waveform + elapsed time, mono.
- Never shows marketing copy or stats.

## 7. Setup Wizard

Three steps max: **Permissions → Model → Try it.**
- "Try it" step ends with a successful live dictation into a sample text box —
  the user must experience the loop before reaching the main window.
- Hardware scan runs silently behind the Model step (auto-recommends, never
  blocks user choice).

## 8. Visual Language (carried from v1, refined)

The aesthetic — **editorial minimalism** — is unchanged. Serif for meaning,
dark ground, one accent at a time.

### Color tokens (unchanged)

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#0a0a0c` | Page background |
| `--bg-window` | `#0d0d10` | Window/modal background |
| `--surface` | `#131318` | Card, button surface |
| `--surface-2` | `#18181f` | Elevated surface |
| `--surface-3` | `#1f1f27` | Highest surface |
| `--border` | `rgba(255,255,255,0.06)` | Subtle dividers |
| `--border-strong` | `rgba(255,255,255,0.10)` | Emphatic dividers |
| `--text` | `#ebebf0` | Primary text |
| `--text-2` | `rgba(235,235,240,0.62)` | Secondary text |
| `--text-3` | `rgba(235,235,240,0.38)` | Tertiary text |
| `--text-4` | `rgba(235,235,240,0.22)` | Disabled, helper text |

### Accents — now state-semantic first

| Token | Hex | Semantic |
|-------|-----|----------|
| `--c-violet` | `#a78bfa` | **idle/ready**, primary action, focus |
| `--c-mint` | `#34d399` | **recording**, success |
| `--c-amber` | `#fbbf24` | **processing**, warnings |
| `--c-rose` | `#fb7185` | **error**, destructive |
| `--c-blue` | `#7dd3fc` | informational only |

Voice state owns the accent system. Decorative accent use (random card glows)
is removed — an accent always means a state or an action.

### Typography

| Family | Font | Use |
|--------|------|-----|
| Display | Instrument Serif | Greeting (28px), transcript excerpts (italic), Insights stat values |
| UI | Geist | Body, labels, buttons, nav |
| Mono | Geist Mono | Metrics line, timings, hotkeys, metadata |

Hierarchy rule: **per surface, exactly one display-serif element outranks
everything, and on Talk that element is subordinate to the orb.**

### Spacing / radius / motion (unchanged)

- `--pad-card` 22px · `--pad-section` 36px · `--gap-card` 18px
- `--radius-card` 16px · `--radius-md` 12px · `--radius-sm` 8px
- Transitions 120ms ease-out · modals 280ms cubic-bezier(0.2,0.7,0.2,1) · stagger 40ms
- New: orb breathing 4s ease-in-out infinite; state crossfades 200ms.
- `prefers-reduced-motion`: disable breathing and waveform animation.

## 9. Hard Rules (lint-level)

1. No `word-break` / `break-all` on numeric or data values, anywhere, ever.
2. No dead buttons: every visible CTA has a working handler or doesn't ship.
3. One hero per surface. If two elements compete, demote one.
4. Stats require comparisons; otherwise render as ambient text.
5. Labels are never auto-truncated below whole words — shorten copy instead.
6. Hotkey shown in UI must be read from actual config (`hotkeys.rs`), never
   hardcoded. (v1 showed Ctrl+Shift+F9 and Ctrl+Win in different places.)
7. Empty states teach the action ("Hold Ctrl+Win and speak"), never just
   "No data yet."

## 10. Migration Plan (ordered, one branch each)

1. `feat/talk-surface` — build the orb + ambient line; replace Home stat grid.
2. `refactor/nav-collapse` — 3-item rail; merge Insights→History,
   Commands/Account→Settings; hide Debug behind flag.
3. `feat/insights-tab` — move stat cards into History→Insights with v2 stat
   rules + week-over-week deltas (needs per-week aggregation in `db.ts`).
4. `fix/hotkey-single-source` — read the real binding everywhere.
5. `feat/setup-try-it` — wizard's live-dictation final step.
6. `chore/accent-audit` — remove decorative accent glows; state-semantic only.

Each step ships independently; the app stays usable between steps.
