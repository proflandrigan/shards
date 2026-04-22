# Slash Command Reference

Every installed slash command and what it does.

## Orchestration

| Command | Agent / Mode | When to use |
|---|---|---|
| `/shards` | Syn — triage | Default entry point. You describe the problem; Syn delegates. |
| `/brainstorm` | Syn — brainstorm | Multi-agent ideation session. |
| `/knowledge` | Syn — knowledge | Seed, browse, and manage the Knowledge Ledger. |
| `/review-pr` | Syn — PR review | Threaded review of an open PR. |

## Specialists

| Command | Agent | Typical output |
|---|---|---|
| `/data-analyst` | Data Analyst | `analysis/<project>/` |
| `/data-scientist` | Data Scientist | `studies/<project>/` |
| `/data-engineer` | Data Engineer | `models/<project>/` |
| `/data-modeller` | Data Modeller | `data_models/<project>/` |
| `/analytics-engineer` | Analytics Engineer | `data_models/<project>/` |
| `/ml-engineer` | ML Engineer | `models/<project>/` or existing service dir |
| `/ai-engineer` | AI Engineer | `services/<project>/` |
| `/applied-ml-scientist` | Applied ML Scientist | `research/<project>/` |
| `/deep-learning-engineer` | Deep Learning Engineer | `services/<project>/` |
| `/mlops-engineer` | MLOps Engineer | `services/<project>/` |
| `/bi-engineer` | BI Engineer | `dashboards/<project>/` |
| `/backend-engineer` | Backend Engineer | review only — no files |
| `/researcher` | Researcher | review only — no files |
| `/academic` | Academic | review, or `research/<project>/` in report mode |

## UI

| Command | Action |
|---|---|
| `/shards-ui` | Start the UI server and open the browser |
| `/shards-guide` | Open the Developer Guide panel in the UI |

## How commands work

Each command file at `src/commands/<name>.md` is ~30 lines and does three things:

1. Sets the agent persona.
2. References the agent file at `.claude/agents/<name>.md`.
3. Provides startup instructions — usually "read the agent file and begin Phase 0".

At install time, commands are copied to `.claude/commands/` in the target project. Claude Code discovers them automatically.

## Adding a new command

1. Create `src/commands/<name>.md` with YAML frontmatter.
2. Re-run `node tools/install.js` in the target project.
3. Confirm it appears in Claude Code's `/` autocomplete.

## See also

- [Agents Overview](../02-agents/overview.md)
- [Install & Setup](../01-getting-started/install.md)
