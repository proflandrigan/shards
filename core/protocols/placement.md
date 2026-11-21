---
name: placement-protocol
description: Where Shards work lands — bookkeeping in shards/<project>/, deliverables integrated into the user's codebase at gate-confirmed targets
type: reference
---

# Placement Protocol

This protocol decides where every file you write goes. Shards adds one folder to the user's project, `shards/`. Everything else you write goes where the user's project already puts that kind of thing.

## Two kinds of output

| Kind | Examples | Location |
|------|----------|----------|
| Bookkeeping | `project-specs.md`, `tasks.yaml`, reports, handoff files, intake notes, scratch notebooks and queries | `shards/<project>/` (your `output_dir`) |
| Deliverables | model code, services, pipelines, dbt models, dashboards, SQL that belongs to the codebase, tests | The confirmed targets |

`brainstorm`, `fixes` and `panels` under `shards/` are Syn's shared folders; never use them as a project name.

## Inferring targets

Do this in Phase 0/1 (or the planning phase).

1. Ask or check where the user wants the work. A user-stated location always wins.
2. Otherwise scan the repo: existing modules and packages for the same domain, where similar artifacts live (for example `src/<pkg>/models/`, `dbt/models/marts/`, `app/routers/`, `dashboards/`, `notebooks/`), build and packaging config (pyproject, package.json, dbt_project.yml), test layout, naming conventions, lint and format config.
3. Prefer extending existing files and modules over adding new ones. A new file goes next to its siblings and copies their structure, naming, imports and test pattern.
4. Record the proposal in `project-specs.md` under a `## Placement` section: a table `| Deliverable | Target path | New or existing | Pattern followed (reference file) |`.
5. Greenfield (nothing to integrate into): propose `shards/<project>/` subpaths (for example `shards/<project>/src/`), and say the user can pick another location.

## Confirming targets

Pass the proposed paths as `targets` on the `gate_request` that closes the planning phase (the gate that approves the plan). The user confirms them with the plan.

- Targets are root-relative paths inside the project.
- Name specific files or the narrowest directory. Never use `.`, and never a broad directory like `src/` when the work touches one module. Every file under a confirmed target is included in the gate's git snapshot, so a broad target sweeps up unrelated uncommitted work.
- If a target changes later, re-pass the full updated list on the next gate and update `## Placement`. Treat a change of target as a plan change (`plan_drift` protocol when executing a task manifest).

## Integrating into an existing codebase

- Follow the repo's conventions over Shards' defaults: directory layout, naming, framework, config style, test runner.
- Reuse existing utilities, clients, configs and fixtures.
- Do not create a parallel package or a duplicate config.
- Tests go where the repo's tests go.
- Keep changes surgical (see {{protocol engineering_guidelines}}, section "Surgical Changes").
- Docs and READMEs go only where the repo keeps them.

## What stays in shards/<project>/

- `project-specs.md`, `tasks.yaml` / `TASKS.md`
- Reports
- Handoff files (`*_handoff.md`, `bi-intake.md`)
- Experiment harness records and results (`experiments/results.json`, leaderboards), unless the user asks otherwise
- Scratch and exploration notebooks and queries

Paths written elsewhere in this suite as `shards/<project_name>/...` for code (for example `shards/<project_name>/src/`) are the greenfield default only. When the plan has confirmed targets, use them instead.

## Legacy layout

Projects started before this layout live in `analysis/`, `studies/`, `models/`, `services/`, `data_models/`, `dashboards/`, `research/`, `brainstorm/`, `fixes/` and `projects/`. Read them when resuming, and keep updating an existing legacy project's specs in place. The gate snapshot only covers `shards/<project>/` and the confirmed targets, so when you resume a legacy project add its folder (for example `analysis/<project>`) to `targets` on your next gate; otherwise its updates are never committed. Never create new project folders there.
