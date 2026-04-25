# Core Concepts

A handful of ideas show up everywhere in Shards. Understanding them makes everything else fall into place.

## Shards

A **shard** is a specialist agent — a fragment of Syn's brain with a distinct persona, a phased workflow, and an area of expertise. There are 14 specialist shards plus Syn, the orchestrator.

Every shard:

- Has a **persona** that flavors how it communicates (grumpy, intense, condescending, nerdy, etc.).
- Has an **activation menu** of mode codes like `[R]` Review, `[ADV]` Advise, `[EX]` Explain, `[AR]` Autonomous Research.
- Writes to a dedicated **output directory** (analyses, studies, models, services, etc.).
- Consults other shards via the Claude Code **Task tool** at specific points.

See [Agent Taxonomy](../02-agents/overview.md) for the full roster.

## Phases

Every specialist runs a numbered phased workflow — typically 4-8 phases. Phase names are specific to each agent, but the pattern is consistent:

1. **Phase 0 — Triage** (orchestrator only). Scope + specialist selection.
2. **Phase 1-N — Planning phases.** Decide scope, method, architecture, evaluation, safety, etc.
3. **Final phase — Execute + review.** Run the work, invoke reviewers, invoke Syn for sign-off, write the final report.

Phases are progressively loaded from `.claude/agents/specific_instructions/<agent>/phases/` — the agent reads `index.md` to orient on the full journey, then reads `phase-1.md` to start work. Each phase file ends with a pointer to the next phase file that only fires once the current gate is confirmed. This keeps the core agent file small and only one phase's content in context at a time. Dual-track agents (analytics_engineer, data_modeller, data_engineer) have `phases_quick/` and `phases_deep/` siblings.

## Gates

A **gate** is a point where the specialist must write its decision to `project-specs.md` and get your confirmation before advancing. Gates are machine-enforced via `::GATE:: ... ::ENDGATE::` fences parsed by three Claude Code hooks (`Stop`, `PreToolUse`, `UserPromptSubmit`). State is tracked in `.shards/gates/state.json`.

The rule is simple: **documentation is the gate**. If the decision isn't in `project-specs.md`, the specialist can't advance.

See [The Gate Pattern](../03-protocols/gate-pattern.md).

## project-specs.md

Every project produces one of these. It's a living document with:

- Project metadata (name, agent, date).
- One section per phase, containing the decisions made at that gate.
- Reviewer verdicts from Syn and any consulted specialists.
- Pointers to output artifacts (queries, notebooks, reports).

`project-specs.md` is the audit trail. Any reader — human or agent — can reconstruct the project's reasoning from this single file.

## Task tool consultations

Specialists call each other via Claude Code's Task tool. Two main shapes:

- **In-phase consultations** — e.g., the Data Scientist calling the Researcher to review methodology in Phase 3. These are scoped — the reviewer reads the relevant context, returns a verdict, and exits.
- **Final review** — every specialist's last phase invokes Syn for sign-off. Syn returns `APPROVED` / `NEEDS REVISION` / `BLOCKED`.

A full `/shards` session is a depth-2 nested Task call: Syn spawns a specialist; that specialist spawns Syn again for review.

## The Knowledge Ledger

`.shards/knowledge/` is persistent workspace memory — separate from any single project. It has four categories:

- `entities/` — data table quirks, column semantics, grain surprises.
- `infrastructure/` — warehouse/API/system behaviors.
- `patterns/` — reusable SQL/Python snippets.
- `features/` — verified ML features.

Before starting work, agents scan `INDEX.md` for entries relevant to the current project and flag them in `project-specs.md`. After Syn's final review, agents propose new knowledge entries for your confirmation before writing to the ledger.

See [Knowledge Ledger](../03-protocols/knowledge-ledger.md).

## Modes

Many shards support multiple **modes** beyond their default phased workflow. Common modes:

- `[R]` Review — critique an existing artifact without rebuilding it.
- `[ADV]` Advise — conversational advisor, no phases or files.
- `[EX]` Explain — walk through existing code or data for context.
- `[U]` Update — tweak an existing project.
- `[C]` Clean — structural cleanup without behavior change (Backend Engineer).
- `[AR]` Autonomous Research — budget-bounded self-steering research loop.
- `[EX]` Experiment — fixed-N experimentation with versioned checkpoints.
- `[PL]` Prompt Lab — interactive prompt engineering (AI Engineer).
- `[UI]` UI Mode — push structured output to the Shards web UI.

Each mode has its own instruction file under `.claude/agents/specific_instructions/<agent>/`.

## DIVERGE (Time-Travel branches)

When 2-3 viable approaches exist in a planning phase, specialists can propose **DIVERGE** — parallel branch execution. Each branch runs autonomously in `.shards/branches/<slug>/`, produces a `branch-report.md`, and Syn's arbiter builds a leaderboard and recommends a winner for promotion.

See [DIVERGE](../03-protocols/diverge.md).

## The UI

Optional but recommended. Launches with `/shards-ui` or `shards-ui` from the terminal. Provides:

- Live chat with any shard.
- A file explorer, Monaco code editor, notebook viewer, table grid, markdown renderer.
- Agent-pushed **panels** (experiment dashboards, prompt lab, knowledge map, PR review).
- Git status and diff viewing.
- A pinboard for adding file/snippet context to your prompts.
- Code intelligence (symbol search, go-to-definition).
- The Guide you are reading.

See [UI Overview](../04-ui/overview.md).

## See also

- [The Gate Pattern](../03-protocols/gate-pattern.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- [Agent Taxonomy](../02-agents/overview.md)
