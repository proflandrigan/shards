# Writing a binding

A binding is a single file, `bindings/<name>.md`. The git binding (`bindings/git.md`) is the worked example; the full spec is `bindings/README.md`.

## Principles

1. The agent calls the host's MCP tools itself. The runtime holds no third-party credentials and never writes externally.
2. After each external write, the agent calls `copy_report(gate_id, target, ok, error?)` so the runtime can record the outcome and queue retries. (The runtime tool exists; no built integration calls it yet.)
3. Git is the source of truth. Write local files and commit first; external copies are one-way.
4. External writes need a confirmed gate or explicit user confirmation, never mid-phase.
5. Send summaries and decisions, not raw query results or data samples.
6. Make writes idempotent: put a marker such as `[shards-gate:<id>]` in the title, body or a property so a retry updates the earlier copy.

## File layout

```markdown
---
name: example
description: One line.
jobs: [record]
required_settings: [space]
expected_tools: [example_create_page, example_update_page]
verbs:
  record: [record.write, record.read]
---

## verb: record.write
1. Read the local record (git is the source of truth).
2. Build a summary: decisions, open questions, next gate. No raw data.
3. Search for a page titled with `[shards-gate:<gate_id>]`; update it or create it.
4. Call `copy_report(gate_id, "example", ok, error?)`.
```

## Frontmatter

Validated by `core/schema/binding.schema.json`; unknown keys are rejected.

| Field | Rules |
|-------|-------|
| `name` | Required. Lowercase letters, digits, hyphens, starting with a letter; must equal the filename without `.md`. |
| `description` | Optional, one line. |
| `jobs` | Required. One or more of `record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`; no duplicates. |
| `required_settings` | Required (may be empty). Keys the user sets under `bindings.<name>`; lowercase with underscores. |
| `expected_tools` | Required (empty for git). Host MCP tool names the agent calls; no duplicates. |
| `verbs` | Required. Map from job name to a non-empty list of verbs. |

## Verbs

Each verb is `<prefix>.<action>`; the prefix is the job name, except the `artifacts` job, which uses `artifact.`.

| Job | Standard verbs |
|-----|----------------|
| record | `record.write`, `record.read` |
| tasks | `tasks.create`, `tasks.update`, `tasks.list` |
| knowledge | `knowledge.search`, `knowledge.read`, `knowledge.write` |
| review | `review.fetch`, `review.comment` |
| artifacts | `artifact.emit`, `artifact.list` |
| presentation | `presentation.create`, `presentation.update` |

A binding implements the subset it supports.

## Body

One `## verb: <verb>` section per verb in the frontmatter, written as steps the agent can follow without interpretation: the MCP tool and arguments (including the marker), what to return for `read` and `list`, the `copy_report` call after external writes, and what to do on error (usually report `ok: false` and stop; the runtime queues the copy).

## Validation

The runtime loads bindings through `runtime/config/bindings.js`. `parseBinding` checks the schema, that `name` equals the filename, that `jobs` and `verbs` keys agree, that each verb carries its job prefix and that the body has a section for every verb.

## See also

- `core/protocols/external_writes.md`: the agent-side rules for external writes (gate marker, summaries only, `copy_report`, replay)
- [Jobs and bindings](overview.md)
- [Configuration](config.md)
- [Integrations status](integrations-status.md)
