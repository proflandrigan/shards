# Syn — Orchestrator

> Friendly, structured. The entry point to everything.

Syn is the orchestrator of the Shards suite. It triages incoming requests, decides which specialist should handle the work, creates the project directory and `project-specs.md`, and hands off by switching the session to that specialist. Syn is also the universal final reviewer: every specialist consults Syn for sign-off before execution.

## Activation menu

On a switch, Syn shows this menu and waits for input.

- `[T]` **Triage**: tell Syn what you need and it works out who handles it.
- `[F]` **Fix**: a quick fix or minor update to something that exists. Syn applies the fix directly, suspending the "facilitate don't generate" rule.
- `[P]` **Project**: a multi-specialist project. Syn plans, coordinates and reviews the whole thing.
- `[S]` **Status**: check on a current project.
- `[B]` **Brainstorm**: bring a problem (or nothing) and let the shards ideate.
- `[D]` **Diff**: compare two projects side by side.
- `[G]` **GitHub PR**: walk through PR review comments and apply fixes with approval.
- `[PR]` **Panel Review**: convene a panel of specialists to review a directory, coalesce findings, and plan sequenced fixes.
- `[FF]` **Free Form**: general assistant mode. Chat or work directly, spawning shards or any installed agents or skills as subagents.

`[PR]` reviews a local directory. To walk through GitHub PR review comments, use `[G]`.

## Modes

Syn's mode files live in `core/agents/syn/modes/`. Three of them are also consult entries (`agent.yaml` `consult_entries`) that other agents call as one-shot subagents.

| Mode | File | Purpose |
|---|---|---|
| Brainstorm | `brainstorm.md` | `[B]` Multi-agent ideation with parallel specialist fan-out. Writes `shards/brainstorm/brainstorm_<project>.state.json` and emits it as a `brainstorm` artifact (`artifact_emit`) for Studio. Also reached through the `brainstorm` skill. |
| Fixer | `fixer.md` | `[F]` Direct fix mode. Syn implements minor fixes without a specialist handoff. |
| PM | `pm.md` | `[P]` Project Manager. Orchestrates a multi-specialist project from a `project-plan.md`; each workstream runs under its specialist. |
| Free Form | `free_form.md` | `[FF]` General assistant mode: no phases or gates, direct work plus spawning shards or any installed agents or skills as subagents. |
| Panel Review | `panel_review.md` | `[PR]` Multi-specialist review of any directory, coalesced into a prioritized report and a sequencing plan. |
| Notebook Walkthrough | `notebook_walkthrough.md` | Live cell-by-cell notebook walkthrough through the runtime's notebook kernel. Started with the `notebook-walkthrough` skill (no menu code). Needs [Studio](../04-studio/overview.md) running for the walkthrough panel. |
| PR Review | `pr_review.md` | `[G]` Walks through GitHub PR comments with guided fixes. Also reached through the `review-pr` skill. |
| Diff | `diff.md` | `[D]` Cross-project comparison into a structured diff report. |
| Final Review | `final_review.md` | Consult entry `final_review`. Specialists call it for sign-off; it checks `gates_open` and returns `APPROVED` / `NEEDS REVISION` / `BLOCKED`. |
| Code Review | `code_review.md` | Consult entry `code_review`. Partitions artifacts by type and routes them: `.sql` to the Analytics Engineer, `.py` to the Backend Engineer, `.ipynb` to the Data Scientist or ML Engineer, config and infrastructure to the MLOps Engineer. |
| Arbiter | `arbiter.md` | Consult entry `arbiter`. Compares DIVERGE branch reports, builds a leaderboard and recommends a winner. |

Reference material comes through the `knowledge` job rather than a Syn mode; see [Knowledge](../03-protocols/knowledge.md).

**Swarm protocol.** For genuinely large tasks, Syn defaults to **decompose-and-swarm**: it splits the work into bounded slices, runs several same-type subagents in parallel over leased slices, then merges the results. See [Decompose & Swarm](../03-protocols/swarm.md), `core/protocols/swarm.md` and [Activation Modes](../03-protocols/activation-modes.md). This applies in PM Mode, Free Form and general orchestration; small work stays on a single agent.

## Phases

Syn has no phases of its own. It runs a **Phase 0 Triage** that selects a specialist, creates the project directory and the `project-specs.md` scaffold, and confirms the triage at a `gate_request` gate. It then switches the session to the specialist with `activate(agent="<specialist>", mode="switch")`. All later phases belong to that specialist, and `return` pops back to Syn.

## Consulted by

Every specialist consults Syn for final review through the `final_review` entry, which runs as a read-only subagent. Syn returns a three-tier verdict; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md). Code review and DIVERGE arbitration use the `code_review` and `arbiter` entries the same way.

## Output directory

Syn has no single output directory (`output_dir: null`). It writes to:

- `shards/brainstorm/` for brainstorm sessions.
- `shards/fixes/fix_<slug>.md` for a standalone Fixer fix (a fix inside an existing project is appended to its `project-specs.md`).
- `shards/panels/diff_<project_A>_vs_<project_B>.md` for Diff mode.
- `shards/<project_name>/` for PM Mode (`project-plan.md` and `workstreams.json`).
- `shards/panels/<dirname>/` for Panel Review (the default; you can override it).
- `<project_dir>/.shards/branches/` for DIVERGE branches.
- The target project directory when acting as final reviewer.
- Free Form writes where you ask (there is no default). Swarmed workstreams nest slices under the specialist's own convention (for example `shards/<name>/slice-<n>/`).

Syn's jobs are `record`, `tasks`, `knowledge`, `review`, `artifacts` and `presentation`. Gate-confirmed work is committed to git as the record; see [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:syn` (switch skill; calls `activate`).
- **Codex:** `$shards:syn`, or `codex -p shards-syn` (profile file installed by `shards install --codex`).
- **Utility skills:** `/shards:brainstorm`, `/shards:review-pr`, `/shards:notebook-walkthrough`, `/shards:resume`, `/shards:end`, `/shards:agents`.
- **Consult subagents:** `syn-final_review`, `syn-code_review`, `syn-arbiter`.

Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [The Gate Pattern](../03-protocols/gate-pattern.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- [DIVERGE](../03-protocols/diverge.md): Syn Arbiter mode
- [Decompose & Swarm](../03-protocols/swarm.md): parallel slices for large work
- [Activation Modes](../03-protocols/activation-modes.md)
- Source: `core/agents/syn/AGENT.md`, `core/agents/syn/agent.yaml`
