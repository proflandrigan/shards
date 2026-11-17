## Shards — Tool-call conventions

This section describes what counts as routine tool-call activity inside a Shards session. It is read by Claude and, when the user has enabled Claude Code's auto mode, by the auto-mode classifier, so that ordinary specialist operations are not mistaken for unusual behavior.

### File writes

Shards specialists write artifacts into a fixed set of project-root subdirectories: `analysis/`, `studies/`, `models/`, `services/`, `data_models/`, `dashboards/`, `research/`, `presentations/`, `panels/`, `fixes/`, `brainstorm/`, `projects/`. They also write to the `.shards/` state directory. Writes inside these scopes (each project's `project-specs.md`, generated notebooks, SQL files, dashboard code, service code) are normal specialist work. Writes outside these scopes are unusual and warrant review.

### Routine Bash commands

These are part of normal validation and execution flow:

- **dbt:** `dbt show`, `dbt ls`, `dbt parse`, `dbt compile`, `dbt deps`, `dbt debug`, `dbt source freshness`, plus runs against developer-configured (non-production) targets: `dbt run`, `dbt build`, `dbt test`, `dbt seed`, `dbt snapshot`. Production-target invocations (`--target prod*`) need explicit user approval.
- **Notebook execution:** `jupyter nbconvert --execute` on notebooks under the output directories above.
- **Python tests:** `pytest` and `python -m pytest` against the project's test suite.
- **Warehouse exploration:** `bq query --dry_run`, `bq query --max_rows`, `bq show`, `bq ls`, `bq head`, and `SELECT`-only use of `psql`, `snowsql` and similar CLIs against developer-configured warehouses. This is read-only validation, not exfiltration.

### Workflow gates vs. safety boundaries

Phase transitions in a Shards session are tracked by the Shards MCP runtime. The agent calls the `gate_request` tool to open a gate and the `gate_advance` tool to move on once the user has confirmed. There are no `::GATE::` fences in text. Gates are **workflow checkpoints**: they pause the agent so the user can review a phase before it advances. They are not safety boundaries.

The gate tools that advance or override a gate (`gate_advance`, `gate_force_close`, `gate_confirm`, `gate_suspend`) must always prompt the user. They are never pre-approved by permission rules. Safety is enforced by the permission allow, deny and ask rules in `.claude/settings.json` and, when active, the auto-mode classifier. Use `shards gates status` for diagnostics.

### What is unusual

These should prompt for explicit user approval regardless of permission mode:

- Writes outside the output directories above, especially `.git`, `node_modules`, system paths, or other projects' directories.
- Network requests beyond developer-configured warehouses and read-only documentation lookups.
- Production-target dbt invocations, force pushes, pushes to `main` or `master`, and destructive shell commands.
- Approving or force-closing a gate without the user having reviewed the phase.
