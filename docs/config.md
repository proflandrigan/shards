# shards.config.yaml reference

`shards.config.yaml` is the single source of truth for where each Shards job sends its output, how gates behave, and what git does with confirmed output. It lives at the project root.

## Purpose and lifecycle

- **Created automatically on first use.** If the file is missing, the runtime writes a commented template with git-only defaults (`loadOrCreateConfig` in `runtime/config/index.js`). No setup is required to start.
- **Never rewritten once it exists.** The runtime reads the file but never re-serializes it, so your comments, ordering and formatting are preserved. Edit it freely.
- **Validated on every load.** Invalid YAML, unknown keys, bad values or model names outside `tiers` raise a `ConfigError` that lists every problem.

The schema is `core/schema/shards-config.schema.json`. Unknown top-level keys are rejected.

## Keys

### `version`

Must be `1`. This is the only accepted value.

### `jobs`

Maps each of the six jobs to a binding (`bindings/<name>.md`). Each value is either a binding name (short form) or an object with `binding` and optional `options` (long form). See "Short and long form" below.

| Job | Meaning |
|-----|---------|
| `record` | Durable project record (the specs document agents write at each gate). |
| `tasks` | Task list the agent creates and updates. |
| `knowledge` | Reference material the agent searches and writes to. |
| `review` | Where review material is fetched from and comments are posted. |
| `artifacts` | Generated files (models, reports, data products). |
| `presentation` | Decks and presentation source. |

### `gates.policy`

Controls how much human confirmation a gate needs. Default: `phase`.

| Value | Meaning |
|-------|---------|
| `strict` | A human confirms every gate, including checkpoint and confirm gates. |
| `phase` | Default. `phase`, `final`, `execute` and `handoff` gates need a human. `checkpoint` and `confirm` gates are recorded automatically. |
| `plan` | You approve the plan and budget once; everything after that is recorded and shown as a notice. |

### `git`

| Key | Default | Meaning |
|-----|---------|---------|
| `git.commit` | `true` | Commit confirmed-gate output paths on the current branch. |
| `git.push` | `false` | Push after committing. Shards never pushes unless this is `true`. |
| `git.denylist.globs` | see below | Glob patterns that are never committed, even if tracked. |
| `git.denylist.max_file_size_bytes` | `5242880` (5 MiB) | Files larger than this are not committed. |

Default denylist globs: `*.parquet`, `*.feather`, `*.arrow`, `*.pkl`, `*.pickle`, `*.joblib`, `*.pt`, `*.pth`, `*.ckpt`, `*.safetensors`, `*.onnx`, `*.h5`, `*.npy`, `*.npz`, `*.db`, `*.sqlite`, `*.sqlite3`, `*.csv.gz`, `*.zip`, `*.tar`, `*.tar.gz`.

Setting `denylist.globs` replaces the default list (arrays are replaced, not merged). Re-list any defaults you still want.

### `tiers`

Optional map from a tier hint (`small`, `standard`, `large`) to a model string:

```yaml
tiers:
  small: <model string you choose>
  large: <model string you choose>
```

`tiers` is the **only** place a model name may appear, and only when you write it yourself. Shards never picks or suggests a model name. A model-looking literal anywhere else in the config (for example `model: claude-...` under a job) is rejected with `model name "..." is not allowed here`. If no tiers are set, the session's model is used.

### `bindings.<name>`

Per-binding settings, keyed by binding name. Each binding file lists its `required_settings` in its frontmatter; those keys go here. The schema only requires an object; the binding validates its own keys.

```yaml
bindings:
  confluence:
    space: ENG
```

## Short and long form

A job value can be written two ways:

```yaml
jobs:
  tasks: jira                          # short form: binding name only
  tasks: { binding: jira, options: { project: ABC } }   # long form
```

`options` are binding-specific. They are passed to the binding's verbs as-is.

## Zero-config defaults

Every job defaults to the `git` binding. These are the values used when a job is absent from the file (and the values written into the template).

| Job | Default binding and options | Where output goes |
|-----|-----------------------------|-------------------|
| `record` | `git`, `path: {output_dir}/project-specs.md` | The agent's `project-specs.md`. |
| `tasks` | `git`, `path: TASKS.md` | `TASKS.md` at the project root, mirroring the task manifest (`<output_dir>/tasks.yaml`). |
| `knowledge` | `git`, `paths: [docs/]`, `git_log: true` | Searches `docs/` and the git log. |
| `review` | `git`, no options | Local diff and `gh` if present. |
| `artifacts` | `git`, `path: {output_dir}` | The agent's output directory. |
| `presentation` | `git`, no options | Local files under `presentations/<slug>/`. |

`{output_dir}` is substituted by the runtime with the active agent's output directory.

The `tasks` job mirrors the task manifest to `TASKS.md`, so the checklist is readable in the repo without tooling.

## Merge behaviour

Your file is merged over the defaults with these rules:

- **Top-level objects deep-merge.** Keys you do not set keep their defaults.
- **Arrays are replaced.** `git.denylist.globs` and `knowledge.paths` replace the default array.
- **Job default options apply only while the job keeps the git binding.** If you set `jobs.record: confluence`, the `path: {output_dir}/project-specs.md` default is dropped, because it belongs to git. Pass the options the new binding needs under `options`.
- **String form is normalized** to `{ binding, options: {} }` before merging.

## Runtime API

Module: `runtime/config/index.js`.

- `loadOrCreateConfig(projectRoot)` returns `{ config, created, path }`. Creates the template if missing, validates, and merges defaults. `created` is `true` only on the call that wrote the file. Throws `ConfigError`.
- `validateConfig(obj)` returns `{ ok, errors }` without throwing. Checks the schema and rejects model literals outside `tiers`.
- `DEFAULT_CONFIG` is the frozen, git-only default object that user config is merged over.
- `resolveJob(config, jobName)` returns `{ binding, options }` for one job, applying the same default-option rules. Throws `ConfigError` for an unknown job name.
- `ConfigError` extends `Error`, with `name = 'ConfigError'` and an `errors` array of individual messages.
- The module also exports `JOBS` and `CONFIG_FILENAME` (`shards.config.yaml`).

## Example: Confluence for records, Jira for tasks

```yaml
version: 1

jobs:
  record: confluence      # short form; add options: here if the binding needs them
  tasks:
    binding: jira
    options:
      project: ABC
  knowledge: git          # docs/ plus git log
  review: git
  artifacts: git
  presentation: git

gates:
  policy: phase

git:
  commit: true            # output still committed locally
  push: false

bindings:
  confluence:
    space: ENG            # required_settings from bindings/confluence.md
  jira:
    site: https://example.atlassian.net
```

Notes:

- `record` now points at Confluence, so the `{output_dir}/project-specs.md` default path no longer applies. Confluence receives the record through its own options.
- Git still commits the local outputs, so the repo stays the source of truth (ADR 0005). Confluence and Jira receive one-way copies.
- The `confluence` and `jira` binding files are not shipped in `bindings/` yet. Until they exist, `validateConfig` accepts the names but the runtime cannot load them.
