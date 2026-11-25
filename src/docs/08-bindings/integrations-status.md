# Integrations status

## Working from Jira

Authenticate the host’s Atlassian connection with access to the target site and project. Run `shards connect --only atlassian` to inspect the host configuration. Use a browse URL when multiple sites have the same project key.

| Request | What happens |
| --- | --- |
| “Syn, captain https://example.atlassian.net/browse/ML-100” | Syn reads the epic and its children, identifies ready and blocked issues, and proposes specialist assignments. |
| “Syn, take ML-104” | Syn reads the issue, uses its requirements to select a shard, and hands off the issue context. |
| “Data Engineer, implement ML-104” | The Data Engineer uses the issue’s acceptance criteria in its usual planning and verification workflow. |

A planning-only request ends with the plan. During execution, Shards keeps local evidence for the work. Configure `jobs.tasks: jira` to use the Jira tasks binding for external updates. The host account determines which issues the agent can see and which writes it can perform.

## What exists

- The Jira tasks binding (`bindings/jira.md`).
- The git binding (`bindings/git.md`), for all six jobs.
- The binding format and loader: frontmatter schema, verb sections, `loadBinding` / `listBindings`. See [Writing a binding](writing-a-binding.md).
- `shards.config.yaml` validation, which accepts any well-formed binding name.

## What does not exist yet

The following are planned in Stage 6 of the suite plan and are **not built**:

- Confluence bindings for records and published knowledge.
- Google Drive and Google Slides bindings.
- GitHub and Bitbucket review bindings.
- The `/shards:sync` skill that replays queued external copies through MCP. (The runtime half exists: `copy_report` records outcomes and queues failures, and `shards sync --status` lists the queue.)
- Utility skills `connect`, `sync`, `doctor` and `publish-knowledge`. The build deliberately skips them (they are marked deferred in `build/skills.js`). Use the `shards doctor` CLI command instead of a doctor skill.
- Backfill during onboarding. (`shards connect` itself exists: it checks which MCP servers are registered and prints the `mcp add` commands for missing ones.)

The external-write guardrails are enforced for integration writes: the PreToolUse hook (`hooks/lib/enforce.js`) and `runtime/guardrails/` require a `[shards-gate:<id>]` marker for a confirmed gate on external writes and refuse raw data. The rules are in `core/protocols/external_writes.md` and [Writing a binding](writing-a-binding.md).

## What to use meanwhile

Git alone is complete: records, tasks, knowledge, review, artifacts and presentations all work as local files committed at confirmed gates. Present them elsewhere manually, or write your own binding following the format spec.

## See also

- [Jobs and bindings](overview.md)
- [Configuration](config.md)
- [CLI reference](../05-commands/cli.md)
