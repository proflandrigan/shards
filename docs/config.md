# shards.config.yaml reference

`shards.config.yaml` is the single source of truth for where each Shards job sends its output, how gates behave, and what git does with confirmed output. It lives at the project root.

## Purpose and lifecycle

- **Created automatically on first use.** If the file is missing, the runtime writes a commented template with git-only defaults (`loadOrCreateConfig` in `runtime/config/index.js`). No setup is required to start.
- **Never rewritten once it exists.** The runtime reads the file but never re-serializes it, so your comments, ordering and formatting are preserved. Edit it freely.
- **Edits apply on the next tool call.** The server re-reads the file whenever its mtime or size changes; no restart is needed. A file that fails validation is never cached.
- **Config errors fail closed for gates.** If the file cannot be loaded, `gate_request` and `load_phase` treat the gate policy as `strict` (a human confirms every gate; nothing auto-confirms) and include the `ConfigError` text in their result (`config_error` in `gate_request`'s data, a `WARNING` line in both texts).
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

Checkpoint and confirm gates are auto-recorded under `phase` only when the agent passes `evidence: { status: "pass" }` to `gate_request`. A `fail` or `anomaly` status, or no evidence, leaves the gate pending for a human. The auto-recorded proof tier is `auto-evidence`.

Under `plan`, the agent first requests the reserved gate `plan-approval` (kind `phase`, summary = plan plus budget) and a human confirms it. After that, every gate is recorded as a notice (proof tier `plan-notice`, advancing kinds still commit) until evidence is `fail`/`anomaly` or the budget runs out; then the gate stays pending for a human. Without a confirmed `plan-approval`, `plan` behaves like `phase`.

```yaml
gates:
  policy: plan
  budget:
    max_gates: 100      # notices allowed after plan approval (default 100)
    max_minutes: 120    # optional wall-clock bound since plan approval
    max_tool_calls: 500 # optional; enforced only if a tool-call counter is written to the session policy state
```

`scripts/count-approvals.js` counts human approvals, auto-evidence records and plan notices per kind from a project's gate state.

### `git`

| Key | Default | Meaning |
|-----|---------|---------|
| `git.commit` | `true` | Commit confirmed-gate output paths on the current branch. |
| `git.push` | `false` | Push after committing. Shards never pushes unless this is `true`. |
| `git.denylist.globs` | see below | Glob patterns that are never committed, even if tracked. |
| `git.denylist.max_file_size_bytes` | `5242880` (5 MiB) | Files larger than this are not committed. |

Default denylist globs: `*.parquet`, `*.feather`, `*.arrow`, `*.pkl`, `*.pickle`, `*.joblib`, `*.pt`, `*.pth`, `*.ckpt`, `*.safetensors`, `*.onnx`, `*.h5`, `*.npy`, `*.npz`, `*.db`, `*.sqlite`, `*.sqlite3`, `*.csv.gz`, `*.zip`, `*.tar`, `*.tar.gz`.

Setting `denylist.globs` replaces the default list (arrays are replaced, not merged). Re-list any defaults you still want.

### `guardrails`

External-write guardrails (E6.11). The runtime never writes to external systems and holds no credentials (D4); the agent writes through the host's MCP tools. The PreToolUse hook (`hooks/lib/enforce.js`, policy in `runtime/guardrails/`) polices those calls.

| Key | Default | Meaning |
|-----|---------|---------|
| `guardrails.write_tools` | `[]` | Extra MCP tool names treated as external writes. Full name (`mcp__server__tool`) or a bare tool name (matches any server prefix); `*` is a wildcard. Added to the `write_tools` of every binding configured under `jobs`. |
| `guardrails.allow_raw_data` | `false` | Allow external writes that carry raw query results. Default: summaries only. |

Which tools count as writes: a binding file lists them in its `write_tools` frontmatter (a subset of `expected_tools`). With only the git binding, nothing is policed.

For a policed tool the hook checks the call before it runs:

1. The content must carry a `[shards-gate:<id>]` marker (the idempotency marker every binding already adds) naming a gate that is **confirmed** in this session. All markers present must be confirmed.
2. No marker, or a marker for an unknown, pending or changes-requested gate: on Claude Code the user gets a permission prompt (their yes is the explicit confirmation); on Codex, which cannot ask from a hook, the call is denied. Each refusal is logged to `.shards/state/gate-violations.jsonl` (see `shards gates violations`).
3. A payload that looks like raw query results (25 or more table, TSV or CSV rows in one string) is denied even for a confirmed gate, unless `allow_raw_data` is `true`. This is a heuristic backstop; the protocol (`core/protocols/external_writes.md`) tells agents to send summaries only.

`SHARDS_GUARDRAILS=0` or `SHARDS_GATE_ENFORCE=0` disables the hook check. The hook fails open on internal errors.

```yaml
guardrails:
  write_tools: [createConfluencePage, updateConfluencePage]
  allow_raw_data: false
```

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
- **Arrays are replaced.** `git.denylist.globs` and `jobs.knowledge.options.paths` replace the default array.
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

## External copies: `copy_report`, `shards sync --status`, `shards connect`

**Copy reporting (E6.8).** After each external write the agent calls the runtime tool `copy_report(gate_id, target, ok, error?)`. The gate must be confirmed. The runtime records the outcome in `copies.json` in the session state:

- `ok: false` queues the copy (`queued`). The state header shows it as `q=<n>`, and every `gate_request` response lists the queue (`copy_queue` in the data block plus a line of text), so the agent redoes the queued copies at the next gate and reports again.
- After 5 failed attempts the copy becomes `stuck`: the header shows `stuck=<n>`, `gate_request` lists it under `copy_stuck`, the agent stops retrying and tells the user, and `shards doctor` reports a failing `copies` check.
- `ok: true` marks the copy `done` and removes it from the queue.

The runtime only records and queues; it never retries an external write itself. The retry relies on the agent following the instructions.

**Queue status (E6.9, CLI half).** `shards sync --status [--json] [--all] [--root <dir>]` lists pending and stuck copies per gate and target across all sessions (`--all` adds completed ones). It is read-only. The `/shards:sync` skill that replays the queue through MCP is not built yet.

**Connecting (E6.10, CLI half).** `shards connect [--host claude|codex] [--only atlassian,drive,github] [--json] [--root <dir>] [--home <dir>]` reads, never writes, the host config (`.mcp.json`, `.claude/settings*.json`, `~/.claude.json` including this project's entry, `.codex/config.toml`, `~/.codex/config.toml`) and reports which of Atlassian, Google Drive/Slides and GitHub are registered. For missing ones it prints the vendor's `claude mcp add ...` / `codex mcp add ...` command. It does not run the commands, call the network or handle credentials; authenticate in the host (Claude Code: `/mcp`; Codex: `codex mcp login <name>`). GitHub's remote server needs a fine-grained personal access token that you supply: replace the `YOUR_GITHUB_PAT` placeholder in the Claude Code command, or export `GITHUB_PAT_TOKEN` where Codex runs. Shards never sees or stores it. claude.ai connectors (for example Google Drive) are not visible in config files, so for those it prints the connector instructions. Verify the printed commands against `claude mcp add --help` for your version. A registered Atlassian server whose URL contains `mcp.atlassian.com/v1` (the deprecated `/v1/sse` or `/v1/mcp` endpoints) is reported as `WARN` with the re-registration command for v2 (`claude mcp remove [-s <scope>] <name> && claude mcp add [-s <scope>] --transport http <name> https://mcp.atlassian.com/v2/mcp`, or the `codex mcp remove/add` pair); `--json` adds a `warnings: [{code: "deprecated-endpoint", server, file, message, command}]` array to that row and a top-level `warnings` count. A v2 registration, if present, is the one reported as the registered server.
