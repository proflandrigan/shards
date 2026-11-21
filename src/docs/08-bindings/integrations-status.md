# Integrations status

Read this before configuring anything other than git.

## What exists

- The git binding (`bindings/git.md`), for all six jobs.
- The binding format and loader: frontmatter schema, verb sections, `loadBinding` / `listBindings`. See [Writing a binding](writing-a-binding.md).
- `shards.config.yaml` validation, which accepts any well-formed binding name.

## What does not exist yet

No binding other than `git` ships in `bindings/`. If you set a job to `confluence`, `jira` or anything else, config validation passes but the runtime cannot load the binding, so the job does not work.

The following are planned in Stage 6 of the suite plan and are **not built**:

- Confluence and Jira bindings (records, tasks, publishing knowledge to Confluence, build tasks as Jira sub-tasks).
- Google Drive and Google Slides bindings.
- GitHub and Bitbucket review bindings.
- The `/shards:sync` skill that replays queued external copies through MCP. (The runtime half exists: `copy_report` records outcomes and queues failures, and `shards sync --status` lists the queue.)
- Utility skills `connect`, `sync`, `doctor` and `publish-knowledge`. The build deliberately skips them (they are marked deferred in `build/skills.js`). Use the `shards doctor` CLI command instead of a doctor skill.
- Backfill during onboarding. (`shards connect` itself exists: it checks which MCP servers are registered and prints the `mcp add` commands for missing ones.)

The external-write guardrails are enforced already, even with no integration built: the PreToolUse hook (`hooks/lib/enforce.js`) and `runtime/guardrails/` require a `[shards-gate:<id>]` marker for a confirmed gate on external writes and refuse raw data. The rules are in `core/protocols/external_writes.md` and [Writing a binding](writing-a-binding.md).

## What to use meanwhile

Git alone is complete: records, tasks, knowledge, review, artifacts and presentations all work as local files committed at confirmed gates. Present them elsewhere manually, or write your own binding following the format spec.

## See also

- [Jobs and bindings](overview.md)
- [Configuration](config.md)
- [CLI reference](../05-commands/cli.md)
