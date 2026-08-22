# Verba Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Publish signed Windows and macOS updater artifacts from GitHub Releases and let installed Verba builds discover, install, and restart into a newer release.

**Architecture:** Tauri's signed updater plugin will validate a public key embedded in `tauri.conf.json`; GitHub Actions will keep the private key in `TAURI_SIGNING_PRIVATE_KEY` and publish `latest.json` plus platform artifacts for `v*` tags. The React shell will perform a non-blocking startup check and show a compact install-and-restart notice only when a signed update is available.

**Tech Stack:** Tauri 2 updater/plugin-process, React 19, TypeScript, pnpm, GitHub Actions, pytest source-contract tests.

## Global Constraints

- Keep transcripts, models, and preferences local; the updater must not alter local-data paths.
- Never commit or print the updater private key; it belongs only in the developer's local key file and GitHub Actions secret.
- Keep unsigned macOS installs supported; updater signatures do not replace Apple's Developer ID signing/notarization.
- Release builds are triggered only by `v*` tags and must publish a non-draft GitHub Release for the static updater endpoint to work.

---

### Task 1: Signed updater configuration

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces updater endpoint `https://github.com/wayaeon/sotto-ai/releases/latest/download/latest.json`.
- Produces the Tauri updater public-key configuration; the private key remains outside the repository.

- [ ] Write a failing contract test asserting the updater plugin, endpoint, public-key field, updater artifacts, and permission exist.
- [ ] Run the new test and confirm it fails because the updater is not configured.
- [ ] Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`, their Rust counterparts, updater artifacts, endpoint, public-key value, and `updater:default` permission.
- [ ] Run the contract test and dependency/type checks.

### Task 2: Native updater runtime and UI

**Files:**
- Modify: `src-tauri/src/main.rs`
- Create: `src/lib/updater.ts`
- Create: `src/components/UpdateNotice.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `checkForAppUpdate(): Promise<UpdateInfo | null>` never throws into the app shell and returns a safe display object.
- `UpdateNotice` accepts `{ update, onInstall, onDismiss }` and exposes an accessible install button.

- [ ] Add failing source-contract tests for native plugin registration and a non-blocking update notice.
- [ ] Register `tauri_plugin_updater` and `tauri_plugin_process` in the desktop builder.
- [ ] Implement a delayed startup check guarded by `isTauri()`; ignore network/plugin failures and never block setup or dictation.
- [ ] Implement signed download/install followed by `relaunch()` only after the user confirms.
- [ ] Render the notice outside the pill window and add compact on-theme styles.
- [ ] Run focused tests, TypeScript build, and Rust check.

### Task 3: Release publication

**Files:**
- Modify: `.github/workflows/release.yml`
- Create: `docs/AUTO_UPDATE.md`

**Interfaces:**
- A pushed `v*` tag produces signed Windows and macOS updater artifacts and a published release containing `latest.json`.

- [ ] Add a failing workflow contract asserting `createUpdaterArtifacts`, a non-draft release, and the updater signing secret.
- [ ] Update the workflow to publish (not draft) tagged releases and retain the existing Windows/macOS matrix.
- [ ] Document one-time key generation, GitHub secret names, tag/release flow, and the unsigned-macOS Gatekeeper limitation without exposing secrets.
- [ ] Run the workflow contract and YAML parse check.

### Task 4: Verification and handoff

**Files:**
- Modify: `tests/test_updater_contract.py`

- [ ] Run focused updater tests.
- [ ] Run `pnpm run build` and the Windows Rust check.
- [ ] Run the full pytest suite and report unrelated pre-existing failures separately.
- [ ] Confirm the working tree contains no generated private key or secret.
- [ ] Commit the updater implementation with a detailed message.

