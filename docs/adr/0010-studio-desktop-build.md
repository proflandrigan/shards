# 0010. Studio desktop (Electron) build: keep or drop

Status: Accepted (proposed by E3.6, 2026-11-14)

## Context

Studio is the browser UI for Shards. In v2 it is an optional add-on: the package `@proflandrigan/shards-studio` runs with `npx @proflandrigan/shards-studio` from a project root. It reads `.shards/events.jsonl` (written by `artifact_emit`, see `docs/runtime.md`) and the project's output folders. It serves a localhost page that the user opens in a browser. Studio has no runtime coupling: the runtime works the same with or without it.

`DISTRIBUTE.md` (now `docs/history/DISTRIBUTE.md`) describes an Electron desktop build, "Shards IDE", that wraps the same UI. Its documented scope is:

- A separate `electron/` package with its own `npm install`, `download-vendor.sh` to vendor CDN assets (Tabulator, Plotly, Mermaid, xterm.js, Inter) for offline use, and per-platform icon sets.
- Native dependencies such as `node-pty`, which must be compiled on the OS they run on. This forces a three-runner CI matrix (macOS, Ubuntu, Windows) in `.github/workflows/build-electron.yml`.
- Code signing and notarization: an Apple ID, app-specific password and team ID for notarization on macOS 10.15+, and an EV or OV certificate on Windows. Unsigned builds show OS security warnings.
- Installers in four formats (`.dmg`, `.exe`, `.deb`/`.AppImage`) produced on tag push, attached to a draft GitHub Release that a maintainer publishes by hand.
- An auto-updater that checks GitHub Releases on startup and installs on the next restart.
- Installers of roughly 100 MB or more each, because they bundle Chromium and Node.

The Electron source (`electron/`) and the workflow file are not present on the `next` branch. The build is therefore a plan, not a working pipeline in this repo.

The Electron build would be a second release train for a UI that is optional. The use case it serves, a user who wants a window onto their project, is already covered by a localhost server and the browser.

## Decision

- Drop the Electron desktop build for v2.0. Do not ship `electron/`, the vendor download step, the per-OS CI matrix, signing, or the auto-updater in v2.0.
- Keep the desktop shell as a later option for v2.x, to be reopened only if demand shows (see "Reopen conditions").
- Studio ships as the files-only add-on described above, launched with `npx @proflandrigan/shards-studio`.

## Consequences

- Release scope is smaller. v2.0 ships one npm package for Studio, with no signing secrets, no notarization, and no per-OS build jobs to maintain.
- No installer artifacts of roughly 100 MB or more are published, and no second release feed or auto-update channel is run.
- The documented Electron steps in `DISTRIBUTE.md` (now `docs/history/DISTRIBUTE.md`) describe work that is not on this branch. They should be marked as deferred, not as the v2.0 install path. Updating `DISTRIBUTE.md` is out of scope for this ADR.
- Users who want a window-like experience use the browser at the localhost address that Studio prints. Users who want a dock icon or an app-menu entry have no packaged option in v2.0.
- The decision does not block a later shell. Studio reads files and talks to the runtime only through `.shards/events.jsonl` and the project folders, with no runtime-side hooks. A thin Electron wrapper can load the same local page later without changes to the runtime, the event format, or the Studio server.
- Enterprise or managed-desktop users who need signed installers have no supported path in v2.0.

## Reopen conditions

Reopen this decision for v2.x if one or more of these holds:

- Users repeatedly ask for an installable app, and the browser path is a measured blocker (for example, support requests about the browser flow or about the localhost address).
- A distribution channel requires a signed native app (for example, an internal app catalogue or a managed-device policy).
- The Studio server needs OS-level integration that a browser cannot provide (for example, native notifications or a tray status indicator) and that the user base needs.
- A maintainer is committed to owning the signing secrets, the per-OS CI matrix and the second release train for as long as the build exists.
