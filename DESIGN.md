# Wispr — Design System

## Aesthetic: Editorial Minimalism

Spare, principled design. Dark background, serif typography for hierarchy, restrained color. Every element earns its space.

## Color Palette

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

### Accent Colors

Used sparingly for status, interactive states, and semantic emphasis.

| Token | Hex | Semantic |
|-------|-----|----------|
| `--c-violet` | `#a78bfa` | Primary action, focus |
| `--c-blue` | `#7dd3fc` | Slack, secondary |
| `--c-amber` | `#fbbf24` | Docs, warnings |
| `--c-mint` | `#34d399` | Active, success, health |
| `--c-rose` | `#fb7185` | Errors, destructive |

## Typography

| Family | Font | Use |
|--------|------|-----|
| **Display** | Instrument Serif | Titles, page heads, stat values (42px+) |
| **UI** | Geist | Body, labels, buttons, nav |
| **Mono** | Geist Mono | Code, timing, metadata |

## Layout & Spacing

| Token | Value | Use |
|-------|-------|-----|
| `--pad-card` | 22px | Card internal padding |
| `--pad-section` | 36px | Section padding |
| `--gap-card` | 18px | Grid gap |
| `--radius-card` | 16px | Card, button corners |
| `--radius-md` | 12px | Medium elements |
| `--radius-sm` | 8px | Small elements |

## Components

### Cards & Surfaces

Cards are the primary grouping unit. Use `--surface` with subtle top border glow (gradient accent). No shadow except modals.

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: var(--pad-card);
}
```

### Buttons

- **Primary**: White text on dark surface, mint/violet accent
- **Ghost**: Transparent, no border, text-colored
- **Disabled**: 40% opacity

### Input Fields

Rounded containers with subtle border. Glow on focus (violet border).

### Modals & Overlays

Dark scrim (`rgba(0,0,0,0.55)`) with backdrop blur. Modal animates in with scale + opacity (cubic-bezier(0.2,0.7,0.2,1)).

## Motion

- Transitions: 120ms ease-out
- Modals: 280ms cubic-bezier(0.2,0.7,0.2,1)
- Stagger: 40ms increments

## Principles

1. **Restraint** — negative space is material; only add color when semantic
2. **Hierarchy** — serif for importance, sans for information
3. **Consistency** — all interactive elements have consistent feedback (120ms ease)
4. **Accessibility** — maintain contrast ratios (text-2 on surface meets AA)
