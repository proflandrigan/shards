# Placement Protocol

Decides where every file an agent writes goes. Shards adds one folder to your project, `shards/`. Everything else lands where your project already keeps that kind of thing.

## Two kinds of output

| Kind | Examples | Location |
|------|----------|----------|
| Bookkeeping | `project-specs.md`, `tasks.yaml`, reports, handoff files, experiment records, scratch notebooks and queries | `shards/<project>/` (the agent's `output_dir`) |
| Deliverables | model code, services, pipelines, dbt models, dashboards, tests | The confirmed targets |

## Targets on the plan gate

In the planning phase the specialist scans the repo for existing modules, where similar artifacts live, build and test layout and naming conventions. It prefers extending existing files over adding new ones, and follows the repo's conventions over Shards' defaults. It records the proposal in a `## Placement` table in `project-specs.md` (deliverable, target path, new or existing, pattern followed) and passes the paths as `targets` on the `gate_request` that closes the planning phase. You confirm them with the plan. A location you state always wins.

Targets are root-relative paths inside the project. Absolute, `..`-escaping and root paths are rejected. Agents name specific files or the narrowest directory, because everything under a target is included in the gate's git snapshot. See [Gates](../03-protocols/gate-pattern.md).

In a greenfield project there is nothing to integrate into, so the default is a subfolder of `shards/<project>/` (for example `shards/<project>/src/`). If a target changes later, the next gate passes the full updated list and the change is treated as a plan change.

## Commit paths

When a gate is confirmed, the git snapshot covers the agent's `output_dir` plus the current target list: the `targets` passed on this gate, or, if it passed none, those of the most recent confirmed gate of the same agent and project in the session. A target you drop from a later list is no longer committed.

## Legacy

Projects created before this layout in `analysis/`, `studies/`, `models/`, `services/`, `data_models/`, `dashboards/`, `research/`, `brainstorm/`, `fixes/` and `projects/` are still read. Nothing new is written there. See the [Output Directory Map](../06-outputs/directory-map.md).

- Source: `core/protocols/placement.md`
