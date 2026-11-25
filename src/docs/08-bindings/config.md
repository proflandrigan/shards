# Configuration: shards.config.yaml

`shards.config.yaml` at the project root controls where each job sends its output, how gates behave and what git does with confirmed output.

- **Created on first use** with commented, git-only defaults. No setup is required.
- **Never rewritten** once it exists, so your comments and ordering survive. Edit it freely.
- **Validated on every load.** Invalid YAML, unknown keys, bad values or model names outside `tiers` raise an error listing every problem.

The schema is `core/schema/shards-config.schema.json`. Unknown top-level keys are rejected.

## Keys

### `version`

Must be `1`.

### `jobs`

Maps each of the six jobs (`record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`) to a binding. A value is a binding name (short form) or `{ binding, options }` (long form):

```yaml
jobs:
  tasks: jira                                              # short
  tasks: { binding: jira, options: { project: ABC } }      # long
```

`options` are binding-specific and passed to the binding's verbs as-is. The bundled bindings are `git` and `jira`. Jira serves the tasks job (see [Integrations status](integrations-status.md)).

### `gates.policy`

How much human confirmation a gate needs. Default `phase`.

| Value | Meaning |
|-------|---------|
| `strict` | A human confirms every gate, including checkpoint and confirm gates. |
| `phase` | Default. `phase`, `final`, `execute` and `handoff` gates need a human; `checkpoint` and `confirm` gates are recorded automatically when the agent passes `evidence: { status: "pass" }` to `gate_request`. |
| `plan` | You approve a plan and budget once through the reserved gate `plan-approval`; later gates are recorded as notices until evidence fails or the budget runs out. Without a confirmed `plan-approval`, behaves like `phase`. |

Plan budget:

```yaml
gates:
  policy: plan
  budget:
    max_gates: 100       # default 100
    max_minutes: 120     # optional
    max_tool_calls: 500  # optional
```

See [Gate pattern](../03-protocols/gate-pattern.md) for gate kinds and proof tiers.

### `git`

| Key | Default | Meaning |
|-----|---------|---------|
| `git.commit` | `true` | Commit confirmed-gate output on the current branch. |
| `git.push` | `false` | Reserved; Shards does not push. |
| `git.denylist.globs` | binary and data formats (`*.parquet`, `*.pkl`, `*.pt`, `*.onnx`, `*.db`, `*.zip`, ...) | Never committed, even if tracked. Setting it replaces the default list. |
| `git.denylist.max_file_size_bytes` | `5242880` (5 MiB) | Larger files are not committed. |

### `tiers`

Optional map from `small`, `standard` or `large` to a model string you write yourself. It is the only place a model name may appear; a model name anywhere else is rejected. If unset, the session's model is used.

### `bindings.<name>`

Per-binding settings, keyed by binding name. A binding's `required_settings` go here.

## Zero-config defaults

| Job | Default |
|-----|---------|
| `record` | `git`, `path: {output_dir}/project-specs.md` |
| `tasks` | `git`, `path: TASKS.md` |
| `knowledge` | `git`, `paths: [docs/]`, `git_log: true` |
| `review` | `git` |
| `artifacts` | `git`, `path: {output_dir}` |
| `presentation` | `git` |

`{output_dir}` is the active agent's output directory.

## Merge behaviour

- Top-level objects deep-merge over the defaults; unset keys keep defaults.
- Arrays (`git.denylist.globs`, `knowledge` `paths`) are replaced, not merged.
- Git's default job options apply only while the job keeps the git binding; switching a job to another binding drops them.

## See also

- [Jobs and bindings](overview.md)
- [Git binding](git-binding.md)
- [Doctor](../05-commands/doctor.md)
