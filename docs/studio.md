# Studio

Studio is the optional browser UI for Shards. It is a files-only add-on: it reads what the runtime writes and does not run agents, gates or hooks itself.

## What it is

- Package: `@proflandrigan/shards-studio`
- Bin: `shards-studio`
- Optional. The runtime, the agents and the gates work without it. Nothing in the runtime depends on Studio.
- Desktop build: not planned for v2.0. See [ADR 0010](adr/0010-studio-desktop-build.md).

## How to run

From the project root:

```bash
npx @proflandrigan/shards-studio
```

Studio serves a page on localhost and prints the address. Open it in a browser. It reads the project in the directory you ran it from, so run it there.

## Where its data comes from

Studio has no relay and no runtime hooks. It reads three things:

1. **`.shards/events.jsonl`.** Each `artifact_emit(type, path, meta)` call appends one line. Studio uses these lines to decide which artifact to show and where it lives. The line shape and the rules for `path` are in [`docs/runtime.md`](runtime.md) (section on the events log) and in [`docs/artifact-contract.md`](artifact-contract.md).
2. **The project's output folders.** Studio reads the files at the paths named in the events, and watches them, so a re-written file refreshes its view.
3. **Gate state.** `.shards/state/sessions/<sessionKey>/gates.json`, written by the runtime (see [`docs/gates.md`](gates.md)). Studio polls these files and shows a banner while a gate is `pending`, with the `shards gates confirm` command to run. Studio never parses chat text for gates and never writes gate state. Server routes: `GET /gates`, `GET /gates/stream` (SSE `gate-update` events), `GET /gates/mode`.

Studio writes no Claude Code hooks and shows no permission cards; Claude Code handles approvals itself. Its state files are `.shards/studio.pid`, `.shards/studio.port` and `.shards/studio.log`.

If Studio shows nothing, check that the agent has emitted events (`.shards/events.jsonl` exists and has lines) and that the artifact path is inside the project.

## Artifact types

Studio renders the 10 artifact types that `artifact_emit` accepts:

| Type | Shows |
|------|-------|
| `data-viewer` | Tabular data |
| `chart` | A chart |
| `dag` | A dependency graph |
| `experiment-dashboard` | Experiment results |
| `eval-dashboard` | Evaluation results |
| `model-card` | A model card |
| `prompt-lab` | Prompt editing and evaluation |
| `brainstorm` | Brainstorm results from several specialists |
| `pr-review` | A pull request review |
| `notebook-walkthrough` | A notebook walked cell by cell |

Studio also has two Studio-only panels, `diagram` and `diff`. They are not among the 10 types above.

## Retired commands

The `/shards-ui` and `/shards-guide` commands are retired. Start Studio with `npx @proflandrigan/shards-studio` instead.

## Developer Guide

The Developer Guide is the markdown tree under `src/docs/` with its `manifest.json` as the table of contents. Studio's guide panel reads that one manifest; there is no separate copy. It looks for the guide in this order: the project's `docs/shards-guide/` (the installed copy), `docs/` inside the Studio package, then `src/docs/` of a monorepo checkout. When you add or remove a guide page, update `src/docs/manifest.json` only.
