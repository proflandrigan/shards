# Output Directory Map

Where each agent writes. Output directories live at the project root and are created on demand. The mapping comes from `output_dir` in each agent's `core/agents/<id>/agent.yaml` (`{project}` is the project name).

## Specialist outputs

| Agent | Directory |
|---|---|
| Data Analyst | `analysis/<project>/` |
| Data Scientist | `studies/<project>/` |
| Data Engineer | `models/<project>/` |
| Data Modeller | `data_models/<project>/` |
| Analytics Engineer | `data_models/<project>/` |
| ML Engineer | `models/<project>/` (greenfield); the existing service directory when iterating |
| AI Engineer | `services/<project>/` (greenfield); the existing service directory when iterating |
| Applied ML Scientist | `research/<project>/` |
| Deep Learning Engineer | `services/<project>/` |
| MLOps Engineer | `services/<project>/` |
| BI Engineer | `dashboards/<project>/` |
| Researcher, Academic, Backend Engineer | none (review only) |

## Syn

Syn's `output_dir` is mode-dependent.

| Mode | Directory |
|---|---|
| Fixer | `fixes/<project>/` (fix notes as `fix_<slug>.md`) |
| Brainstorm | `brainstorm/` (`brainstorm_<project>.md` plus a `.state.json` sidecar) |
| Slides | `presentations/<deck_slug>/` |
| Panel Review | `panels/<dirname>/` |
| PM | `projects/<project>/` (`project-plan.md`; specialists still write to their own directories) |
| PR Review | none |

Slides depends on a presentation binding, which is not built yet; see [integrations status](../08-bindings/integrations-status.md).

## Project files

Each specialist project directory holds a `project-specs.md` (the decisions record, written at each gate) and the agent's deliverables. Templates live in `core/templates/`.

## `.shards/` runtime state

Shards keeps its own state under `<root>/.shards/`. It is runtime state, not deliverables, and should be gitignored (`shards doctor` checks this; `shards doctor --fix` adds it).

| Path | Contents |
|---|---|
| `.shards/state/global.json` | State schema version. |
| `.shards/state/sessions/<sessionKey>/` | Per-session `frames.json` (agent stack), `gates.json`, `session.json`, `leases.json`, plus `prompts.jsonl` and `hooks.json` from the hooks. |
| `.shards/state/handshake/` | SessionStart handshake files (pruned after 24 hours). |
| `.shards/state/git-pending.json` | Gate commits waiting to replay. |
| `.shards/state/gate-operator.log.jsonl` | Operator gate confirms and force-closes. |
| `.shards/state/hook-errors.log` | Hook errors (hooks fail open). |
| `.shards/sessions/INDEX.json` | The durable session index; see [sessions](../05-commands/sessions.md). |
| `.shards/events.jsonl` | Artifact events appended by `artifact_emit`, read by Studio. |
| `.shards/content/` | Skill content from `shards install --project`. |
| `.shards/project-install.json` | Record of a project skills install. |
| `.shards/archive/legacy-gates/` | Archived v1 gate files after `shards migrate`. |

Configuration is separate: `shards.config.yaml` and `bindings/` at the project root (see [config](../08-bindings/config.md)). Reference knowledge is not stored by Shards; see [knowledge](../03-protocols/knowledge.md). Exported v1 ledger entries land in `docs/knowledge/`.
