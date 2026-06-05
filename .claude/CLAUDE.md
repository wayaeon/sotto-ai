# Wispr Clone — Development Standards

## Git Workflow: Branch-Per-Feature, Commit-As-You-Go

**Rule: One feature or fix per branch. Commit incrementally after each logical chunk.**

### When Starting Work

1. Create a feature branch:
   ```bash
   git checkout -b feat/feature-name     # for new features
   git checkout -b fix/bug-name          # for bugfixes
   git checkout -b perf/optimization     # for performance work
   git checkout -b docs/description      # for documentation
   ```

2. Do NOT work on `main`. Ever.

### During Development

After each logical piece (e.g., "add API endpoint", "fix lock contention", "wire up UI component"):

```bash
git add <specific files>
git commit -m "verb: short summary

Optional longer explanation if context is non-obvious."
```

**Commit message format:** `<type>: <subject>`
- `feat:` new feature
- `fix:` bugfix
- `perf:` performance improvement
- `refactor:` code structure change (no behavior change)
- `test:` test additions/fixes
- `docs:` documentation
- `chore:` dependency updates, config

Keep subjects under 50 characters. Reference the "why" in the body if not obvious.

### For Parallel Work

**Do NOT switch branches mid-work.** Use git worktrees to isolate checkouts:

```bash
# You're on feat/audio-pipeline, want to explore feat/ui-redesign
git worktree add .claude/worktrees/ui-redesign feat/ui-redesign
cd .claude/worktrees/ui-redesign
# work freely here; main workspace untouched
cd ../..  # back to audio-pipeline
```

Worktrees are cleaned up automatically when the branch is deleted.

### When Done

Push to remote and create a PR:
```bash
git push origin feat/your-feature
# Then create PR on GitHub
```

Each commit is reviewable and can be cherry-picked or reverted independently.

---

## Benefits of This Workflow

- **Isolation:** Changes are scoped. If a regression appears, `git bisect` finds it in 1-2 minutes.
- **Testability:** Test after each commit. Failures are tied to specific changes.
- **Revertability:** Remove a feature? Revert 3 commits. Remove a change from 28? Much harder.
- **Code review:** Reviewers see the progression of thought, not a wall of code.
- **Focus:** Clear scope per branch = no context switching tax.

---

## Code Quality Checkpoints

These are automated — Claude enforces them:

1. **No modifications to `main` in this session.** Must branch first.
2. **Commits are atomic.** One logical unit per commit (not "WIP", not 15 unrelated changes).
3. **Tests pass before commit.** If there's a test suite, run it.
4. **Commit messages are clear.** Reviewers should understand the change from the message.

---

## Project Structure & Maintenance

```
wispr-clone/
├── DESIGN.md              # Design system (typography, colors, layout)
├── sidecar/               # Python STT processor
│   ├── recorder.py        # PTT + hands-free modes
│   ├── models.py          # Model loading, benchmarking
│   ├── hardware.py        # GPU detection, tier classification
│   ├── ipc.py             # Tauri-sidecar communication
│   └── main.py            # Entry point
├── src/                   # React + TypeScript frontend
│   ├── components/        # UI components (Home, settings, setup wizard)
│   ├── hooks/             # Custom hooks (useSidecar)
│   ├── stores/            # App state (Zustand)
│   ├── lib/               # Utilities (tauri.ts, db.ts)
│   └── index.css          # Global styles (dark theme, editorial-minimalism)
├── src-tauri/             # Tauri backend
│   ├── src/commands.rs    # Tauri command handlers
│   └── tauri.conf.json    # Tauri config
└── tests/                 # Python sidecar tests
```

### Maintenance Standards

- **DESIGN.md is the source of truth** for all UI decisions. Update it before adding new components.
- **Lock contention is forbidden.** Blocking I/O must never hold locks (see `recorder.py` for pattern).
- **No busy-waits.** Always add sleep/timeout to polling loops.
- **Performance is measured.** Use timing instrumentation (see `PipelineDebug.tsx` for telemetry).
- **Tests are run before commit.** At minimum: `python -m pytest tests/sidecar/`.

---

## When Claude Proposes Work

If Claude suggests:
- "Let me explore the codebase first" → do it (no waits)
- "Let me check if tests pass" → always yes
- "Let me create a worktree for this parallel task" → strongly encouraged

If Claude commits without branching → stop, branch, recommit.

---

## One-Off Cleanup (Optional but Encouraged)

If you notice:
- Unused imports → remove them
- Dead code → delete it
- Inconsistent naming → fix it
- Missing docstrings on public functions → add them

These are separate commits: `chore: remove dead code`, etc. They don't block features; they ride the wave of ongoing work.

---

**TL;DR:** Branch per feature. Commit after each logical piece. Push when done. Repeat. This workflow buys you focus, safety, and speed — the three things that matter for shipping.
