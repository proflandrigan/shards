# Output Directory Map

Where each agent writes. Shards adds one folder to your project, `shards/`. It is created on demand. The mapping comes from `output_dir` in each agent's `core/agents/<id>/agent.yaml` (`{project}` is the project name).

The `shards/` folder holds bookkeeping: `project-specs.md`, `tasks.yaml` and `TASKS.md`, reports, handoff files and experiment records. Deliverables (code, dbt models, services, dashboards, tests) go where you want them. During planning the specialist scans the repo, proposes target paths that follow its conventions, records them in a `## Placement` table in `project-specs.md` and passes them as `targets` on the plan gate. In a greenfield project the default is a subfolder of `shards/<project>/`. See [Placement](../03-protocols/placement.md). Projects created before this layout are described under [Legacy layout](#legacy-layout).

## Specialist outputs

| Agent | Directory |
|---|---|
| Data Analyst | `shards/<project>/` |
| Data Scientist | `shards/<project>/` |
| Data Engineer | `shards/<project>/` |
| Data Modeller | `shards/<project>/` |
| Analytics Engineer | `shards/<project>/` |
| ML Engineer | `shards/<project>/` |
| AI Engineer | `shards/<project>/` |
| Applied ML Scientist | `shards/<project>/` |
| Deep Learning Engineer | `shards/<project>/` |
| MLOps Engineer | `shards/<project>/mlops/` |
| BI Engineer | `shards/<project>/` |
| Researcher, Academic, Backend Engineer | none (review only) |

## Syn

Syn's `output_dir` is mode-dependent.

| Mode | Directory |
|---|---|
| Fixer | appended to the project's `project-specs.md` when the fix belongs to a project; otherwise `shards/fixes/fix_<slug>.md` |
| Brainstorm | `shards/brainstorm/` (`brainstorm_<project>.md` plus a `.state.json` sidecar) |
| Panel Review | `shards/panels/<dirname>/` |
| PM | `shards/<project>/` (`project-plan.md` and `workstreams.json`; specialists write to their own project folders) |
| PR Review | none |
| Diff | `<dir_A>/diff_vs_<project_B>.md` |

`brainstorm`, `fixes`, `panels` and `academic_reports` are reserved under `shards/`: no project can use those names.

## Project files

Each project folder `shards/<project>/` holds a `project-specs.md` (the decisions record, written at each gate, including the `## Placement` table) and the agent's bookkeeping files. Deliverables live at the confirmed targets, which can be inside or outside this folder. Templates live in `core/templates/`.

## Legacy layout

Projects created before the `shards/` layout live in `analysis/`, `studies/`, `models/`, `services/`, `data_models/`, `dashboards/`, `research/`, `brainstorm/`, `fixes/`, `panels/` and `projects/`. Syn's status and resume read them; validation's specs lookup and Studio read most of them. Nothing new is written there, and `shards migrate` does not move them.

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
