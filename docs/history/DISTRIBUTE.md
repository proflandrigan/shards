# Shards IDE — Distribution Guide

## Prerequisites

- Node.js v18+
- npm
- macOS, Windows, or Linux

## Development Mode

Run the Electron app from source without packaging:

```bash
cd electron
npm install
npm start -- /path/to/project
```

If no project path is provided, the app opens the most recent project or shows a folder picker.

## Download Vendor Assets

CDN dependencies (Tabulator, Plotly, Mermaid, xterm.js, Inter font) must be downloaded locally for offline use. This happens automatically during `npm run build`, or manually:

```bash
cd electron
bash download-vendor.sh
```

## Building Distributables

### Current Platform

```bash
cd electron
npm run build
```

### Platform-Specific

```bash
npm run build:mac      # macOS DMG (x64 + arm64)
npm run build:win      # Windows NSIS installer (x64)
npm run build:linux    # Linux AppImage + deb (x64)
npm run build:all      # All platforms (requires cross-compilation setup)
```

Build output lands in `electron/dist/`.

### Artifacts Produced

| Platform | Format | File |
|----------|--------|------|
| macOS | DMG | `Shards-IDE-<version>-arm64.dmg`, `Shards-IDE-<version>-x64.dmg` |
| Windows | NSIS installer | `Shards-IDE-<version>-x64.exe` |
| Linux | AppImage | `Shards-IDE-<version>-x64.AppImage` |
| Linux | Debian package | `Shards-IDE-<version>-x64.deb` |

## App Icons

Place platform-specific icons in `electron/icons/`:

- `icon.png` — Linux (512x512 or 1024x1024) — included
- `icon.icns` — macOS (generate from PNG, see below)
- `icon.ico` — Windows (generate from PNG, see below)

### Generating Icons

```bash
cd electron/icons

# macOS .icns (requires macOS + iconutil)
mkdir icon.iconset
for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size icon.png --out icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

# Windows .ico (requires ImageMagick)
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

Or use `electron-icon-builder`:

```bash
npx electron-icon-builder --input=icon.png --output=.
```

## Code Signing

### macOS

Requires an Apple Developer account ($99/year) and certificates installed in Keychain:

```bash
# Set environment variables before building
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
npm run build:mac
```

For notarization (required for Gatekeeper on macOS 10.15+), add to `electron/package.json` under `build.mac`:

```json
"notarize": {
  "teamId": "YOUR_TEAM_ID"
}
```

And set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` environment variables.

### Windows

Requires a code signing certificate (EV or OV). Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables before building.

## CI Builds (GitHub Actions)

A workflow at `.github/workflows/build-electron.yml` builds installers for all three platforms automatically. It runs on macOS, Ubuntu, and Windows runners in parallel — solving the problem that native dependencies like `node-pty` can only compile for the OS they're built on.

### How to trigger a build

**Option A: Push a version tag**

```bash
# Bump version in electron/package.json first
cd ~/shards
git add -A && git commit -m "bump to v0.2.0"
git tag v0.2.0
git push origin feature/electron-app --tags
```

This triggers the full pipeline: build on all 3 platforms, then create a draft GitHub Release with all installers attached.

**Option B: Manual trigger**

Go to the repo on GitHub > Actions tab > "Build Shards IDE" > "Run workflow". Pick the branch and click run. This builds all platforms but skips the release step (artifacts are downloadable from the workflow run).

### What the workflow does

1. Checks out the repo on macOS, Ubuntu, and Windows runners (in parallel)
2. Installs Node.js 20 and Linux build deps (rpm, fakeroot, dpkg)
3. Runs `npm install` in `electron/`
4. Runs `download-vendor.sh` to fetch CDN assets
5. Builds the platform-specific installer
6. Uploads artifacts to the workflow run
7. If triggered by a version tag: creates a draft GitHub Release with all artifacts

### Where the installers end up

Build artifacts land in two places depending on how the workflow was triggered:

1. **Workflow Artifacts (always)** — downloadable from the Actions tab. Go to the repo > Actions > click the workflow run > scroll to the "Artifacts" section at the bottom. You'll see `shards-ide-macOS`, `shards-ide-Linux`, and `shards-ide-Windows` as zip downloads. These expire after 90 days by default.

2. **Draft GitHub Release (only on tag push)** — when triggered by pushing a `v*` tag, the `release` job creates a draft release under Releases with all the `.dmg`, `.AppImage`, `.deb`, and `.exe` files attached directly. You review it and click "Publish" to make it public. These persist permanently.

If you trigger the workflow manually (via "Run workflow"), you only get #1 — no release is created.

### Downloading artifacts without a release

Go to Actions > click the workflow run > scroll to "Artifacts" at the bottom. Download `shards-ide-macOS`, `shards-ide-Linux`, or `shards-ide-Windows`.

### Publishing a release

After the tag-triggered workflow finishes:

1. Go to the repo > Releases
2. Find the draft release created by the workflow
3. Edit the release notes if needed
4. Click "Publish release"

The auto-updater in the app checks this release feed on startup.

### Code signing in CI (optional)

To sign builds so users don't get security warnings, add these as repository secrets (Settings > Secrets and variables > Actions):

**macOS:**
- `MAC_CERTIFICATE` — base64-encoded .p12 certificate
- `MAC_CERTIFICATE_PASSWORD` — password for the .p12
- `APPLE_ID` — your Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from appleid.apple.com
- `APPLE_TEAM_ID` — your Apple Developer Team ID

Then uncomment the CSC/APPLE env vars in the workflow file.

**Windows:**
- `WIN_CSC_LINK` — base64-encoded code signing certificate
- `WIN_CSC_KEY_PASSWORD` — certificate password

## Auto-Updates

The app checks for updates from GitHub Releases on startup. To publish an update:

1. Bump the version in `electron/package.json`
2. Commit and tag: `git tag v0.2.0 && git push --tags`
3. Wait for CI to build all platforms (~5-10 min)
4. Go to Releases, review the draft, click "Publish release"

The app will detect the new release and prompt users to download and install. Updates are downloaded in the background and installed on next app restart.

## Installation Result

When a user installs the packaged app:

| Platform | What they get |
|----------|---------------|
| macOS | "Shards IDE" in `/Applications/`, launchable from Spotlight and Dock |
| Windows | Desktop shortcut + Start Menu entry named "Shards IDE" |
| Linux (deb) | `.desktop` entry, launchable from application menu |
| Linux (AppImage) | Self-contained clickable executable |
