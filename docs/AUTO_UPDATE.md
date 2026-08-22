# Verba auto-updates

Verba checks for a signed update a few seconds after startup. If one is available, the app shows an on-theme notice; selecting **Install update** downloads the signed artifact and relaunches Verba.

## One-time signing setup

The updater keypair is stored locally at:

```text
C:\Users\wayaa\.tauri\verba-updater.key
C:\Users\wayaa\.tauri\verba-updater.key.pub
```

The public key is committed in `src-tauri/tauri.conf.json`. Never commit or paste the private key into source control, chat, or issue comments.

Add these repository secrets in GitHub under **Settings → Secrets and variables → Actions**:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of `verba-updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional; omit it because this local key was generated without a password

## Publishing a release

Update the version in both `package.json` and `src-tauri/tauri.conf.json`, commit it, then push a version tag:

```powershell
git tag v0.1.5
git push origin v0.1.5
```

The release workflow builds Windows and both macOS architectures, creates signed updater artifacts, publishes the GitHub Release, and attaches `latest.json`. Ordinary branch pushes do not publish updates.

## macOS note

Updater signatures verify that an artifact came from Verba. They do not replace Apple Developer ID signing or notarization. The unsigned Mac build may still require the existing Gatekeeper approval steps after an update.
