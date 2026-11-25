# Binding files

A binding connects one or more Shards jobs to a concrete destination: git (always on), or a host tool such as Confluence, Jira, or a warehouse. Each binding is a single file, `bindings/<name>.md`, and is selected per job in `shards.config.yaml`.

This document is the format spec for binding authors. The git binding is the worked example: [`bindings/git.md`](git.md).

## Principles

1. **The agent calls the host's MCP tools itself.** The Shards runtime never holds third-party credentials and never writes to an external system (decision D4). A binding's body tells the agent exactly which MCP tools to call and what to pass.
2. **The agent then reports the result to the runtime.** After each external write, the agent calls `copy_report(gate_id, target, ok, error?)` (E6.8). The runtime records the outcome and queues failures for retry at the next gate.
3. **Git is the source of truth.** Every output is first written to local files and committed. External copies are one-way: local to external. The Jira tasks binding reads issue scope and tracker status as inputs. Verification evidence and local execution state stay in git.
4. **External writes need a confirmed gate or explicit user confirmation.** Never write to a shared system mid-phase. The PreToolUse hook enforces this for the tools listed in `write_tools` (see `docs/config.md`, `guardrails`).
5. **Summaries only.** Send summaries and decisions to external tools, not raw query results, data samples or file dumps. Raw data is a git-denylist concern and a compliance concern.
6. **Writes are idempotent.** Every external write carries a marker such as `[shards-gate:<id>]` in its title, body or a property, so a retry finds and updates the earlier copy instead of duplicating it.

## File layout

```markdown
---
name: <binding-name>
description: <optional one line>
jobs: [record, tasks]
required_settings: [space]
expected_tools: [mcp_tool_name_a, mcp_tool_name_b]
write_tools: [mcp_tool_name_b]
verbs:
  record: [record.write, record.read]
  tasks: [tasks.create, tasks.update, tasks.list]
---
<markdown body: one section per verb>
```

## Frontmatter

Validated by `core/schema/binding.schema.json`. Unknown keys are rejected.

| Field | Required | Rules |
|-------|----------|-------|
| `name` | yes | Lowercase, digits and hyphens, starting with a letter (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`). Must match the filename without `.md`. |
| `description` | no | One line describing the binding. |
| `jobs` | yes | At least one of `record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`. No duplicates. |
| `required_settings` | yes | Keys the user must set under `bindings.<name>` in `shards.config.yaml`. Lowercase with underscores (`^[a-z][a-z0-9_]*$`). Empty for tool-free bindings. |
| `expected_tools` | yes | Host MCP tool names the agent calls. `/shards:doctor` checks that they are available. Empty for git. No duplicates. |
| `write_tools` | no | Subset of `expected_tools` that write to the external system (create, update, comment). The PreToolUse hook lets these run only for content carrying a `[shards-gate:<id>]` marker of a confirmed gate, and refuses raw tabular payloads (E6.11). List every writing tool; a tool not listed is not policed. |
| `verbs` | yes | Map from job name to a non-empty list of verbs for that job. Keys must be job names. |

### Verbs

Each verb is `<prefix>.<action>`, where `<action>` is lowercase letters and underscores. The prefix is the job name, with one exception: the `artifacts` job uses the prefix `artifact.`.

| Job | Verb prefix |
|-----|-------------|
| `record` | `record.` |
| `tasks` | `tasks.` |
| `knowledge` | `knowledge.` |
| `review` | `review.` |
| `artifacts` | `artifact.` |
| `presentation` | `presentation.` |

Verbs listed for a job should be real verbs of that job. The catalog below lists the standard set.

## Body

The body is markdown with one `## verb: <verb>` section per verb listed in the frontmatter. Each section tells the agent exactly how to perform that verb: which MCP tool to call, which arguments to build, what to check, what to return, and how to report the result.

Write instructions as steps the agent can follow without interpretation:

- Name the MCP tool and the arguments, including the marker format.
- Say what to return to the caller (for `read` and `list`, the shape of the result).
- End external writes with the `copy_report` call.
- Say what to do when a tool is unavailable or returns an error (usually: report `ok: false` with the error and stop; the runtime queues the copy).

## Skeleton for authors

```markdown
---
name: example
description: One line on what this binding does.
jobs: [record]
required_settings: [space]
expected_tools: [example_create_page, example_update_page]
verbs:
  record: [record.write, record.read]
---

# Example binding

Scope: records only. Reads the record from the local file; writes a summary to Example.

## verb: record.write

Input: the record path and the gate id.

1. Read the local record at the path given (git is the source of truth).
2. Build a summary (decisions, open questions, next gate). Do not include raw data.
3. Search Example for a page whose title contains `[shards-gate:<gate_id>]`.
4. If found, call `example_update_page` with the summary. If not, call `example_create_page` with title `<project> [shards-gate:<gate_id>]`.
5. Call `copy_report(gate_id, "example", ok, error?)` with the outcome.

## verb: record.read

1. Call `example_get_page` with the page id stored in the local record metadata.
2. Return the page text. Treat it as a summary of what was reported, not as authoritative state.
```

## Verb catalog

Standard verbs for each job. A binding implements the subset it supports, listed in its `verbs` frontmatter.

| Job | Verbs | Purpose |
|-----|-------|---------|
| record | `record.write`, `record.read` | Write the project record after a gate; read back a summary. |
| tasks | `tasks.create`, `tasks.update`, `tasks.list` | Create, update and list task items. |
| knowledge | `knowledge.search`, `knowledge.read`, `knowledge.write` | Search, read and add reference material. |
| review | `review.fetch`, `review.comment` | Fetch review material (diffs, threads); post comments. |
| artifacts | `artifact.emit`, `artifact.list` | Emit generated artifacts; list what exists. |
| presentation | `presentation.create`, `presentation.update` | Create and update presentation sources. |

## Loading bindings

Bindings are loaded by the runtime through `runtime/config/bindings.js`:

- `loadBinding(name)` reads `bindings/<name>.md`, validates the frontmatter against `binding.schema.json`, and returns the parsed frontmatter and body.
- `listBindings()` returns the available binding names.

`parseBinding(text, expectedName)` is the pure validator behind `loadBinding`; it returns `{ ok, errors, binding }`. Beyond the schema it checks that `name` equals the file name, that `jobs` and `verbs` keys agree, that each verb carries its job prefix, and that the body has a `## verb: <verb>` section per verb.

A job's binding comes from `resolveJob(config, jobName)` in `runtime/config/index.js`. See [`docs/config.md`](../docs/config.md) for how `jobs` values map to bindings and options.
