# Jobs and bindings

Shards does not own storage (ADR 0003). Instead, agents do their work through six **jobs**, and each job is pointed at a **binding** that says where the result goes. Git is the source of truth (ADR 0005): every output is written to local files and committed first, and any external copy is one-way, local to external.

## The six jobs

| Job | What it is |
|-----|-----------|
| `record` | The durable project record (the `project-specs.md` agents write at each gate). |
| `tasks` | The task list an agent creates and updates. |
| `knowledge` | Reference material the agent searches and writes to. |
| `review` | Where review material is fetched from and comments are posted. |
| `artifacts` | Generated files: models, reports, data products. |
| `presentation` | Decks and presentation source. |

Each agent declares which jobs it uses in its `agent.yaml` (for example, the Data Analyst uses `record`, `tasks`, `knowledge`, `review` and `artifacts`).

## Bindings

A binding is one markdown file, `bindings/<name>.md`. Its frontmatter names the jobs it serves, the settings it needs and the MCP tools it expects; its body has one `## verb: <verb>` section per operation (for example `record.write`, `tasks.create`, `knowledge.search`). The agent reads the section and follows it.

Two rules shape every binding:

- **The agent calls the host's MCP tools itself.** The runtime never holds third-party credentials and never writes to an external system.
- **External writes need a confirmed gate or explicit user confirmation.** Summaries and decisions go out; raw data does not.

Today one binding ships: [`git`](git-binding.md). The format for writing others is in [Writing a binding](writing-a-binding.md). What is and is not built is in [Integrations status](integrations-status.md).

## Selecting a binding per job

`shards.config.yaml` at the project root maps each job to a binding. Every job defaults to `git`, so no setup is needed.

```yaml
version: 1
jobs:
  record: git
  tasks: { binding: git, options: { path: TASKS.md } }
```

The file is created with git-only defaults on first use and never rewritten afterwards. See [Configuration](config.md) for every key.

## See also

- [Configuration](config.md)
- [Git binding](git-binding.md)
- [Gate pattern](../03-protocols/gate-pattern.md)
- [Knowledge](../03-protocols/knowledge.md)
