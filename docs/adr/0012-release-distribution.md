# 0012. Release distribution: plugin on a `marketplace` branch, npm publish opt-in

Status: Accepted (2026-11-17)

## Context

`/plugin marketplace add proflandrigan/shards` reads `.claude-plugin/marketplace.json` from the repo's default branch. The plugin itself (`plugins/shards`) is a build product: it bundles the runtime and about 28MB of production `node_modules`, so it must not be committed on `main` or `next`. We need a way to get the generated plugin in front of marketplace users that is simple, auditable and cannot publish by accident.

Options considered:

1. Commit `plugins/shards` to the default branch. Rejected: huge generated diffs on every release, drift, and the source tree stops being the source of truth.
2. Attach the plugin only as a GitHub Release asset. Rejected: marketplace sources cannot consume a release tarball.
3. Push the generated plugin to a dedicated branch and point the marketplace entry at it. Chosen.
4. Publish the plugin to npm and use an `npm` marketplace source. Rejected for now: it couples the plugin to npm publishing, which is opt-in (below).

## Decision

- `.github/workflows/release.yml` runs on `v*` tags and `workflow_dispatch`. It verifies (tests, lints, `scripts/pack-check.js`, `scripts/release-dry-run.sh`), builds every target (`shards build --target claude --marketplace`, `codex`, `skills`), packs and checks both npm tarballs, and uploads artifacts.
- Tag runs create a GitHub Release (pre-release when the tag has a `-` suffix) with the tarballs and the claude, codex and skills archives attached. The tag must equal `v<package.json version>`.
- The `marketplace-branch` job (tags, or dispatch with `push_marketplace: true`) commits the generated plugin as the **root** of a single-commit `marketplace` branch and force-pushes it. The job has `contents: write`; every other job is read-only.
- The committed `.claude-plugin/marketplace.json` uses a `github` plugin source with `ref: marketplace` (`build/package.js` `marketplaceText()`). `shards build --marketplace` writes the local variant (`./plugins/shards`) for offline `claude plugin validate`.
- npm publishing is a separate `npm-publish` job that runs only when the repo variable `SHARDS_NPM_PUBLISH` is `true` and the run is a tag run, and it needs the `NPM_TOKEN` secret. Otherwise it is skipped. It publishes the pre-checked tarballs with `--tag next`. Nothing else in the workflow can publish.

## Consequences

- `main`/`next` stay free of build output; the `marketplace` branch is disposable and rebuilt on every release.
- A marketplace install tracks the latest tagged build on that branch, not an arbitrary commit of `main`.
- The first tag run is the first real exercise of the workflow (it has not run yet; needs the repo pushed and Actions enabled).
