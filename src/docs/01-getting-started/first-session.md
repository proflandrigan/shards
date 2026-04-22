# Your First Session

The quickest way to feel out Shards is to run `/shards` and describe a real problem.

## Start from the orchestrator

Open Claude Code in a project directory with Shards installed and type:

```
/shards
```

This activates **Syn**, the orchestrator. Syn greets you, runs a **Phase 0 triage**, and asks clarifying questions to decide which specialist shard is the right fit.

Example: "We had a revenue drop in APAC last week — I want to understand what happened."

Syn will:

1. Ask you to confirm the scope (a quick diagnostic vs. a full deep-dive study).
2. Decide which specialist is best suited (likely Data Analyst for a quick look, Data Scientist for a deep investigation).
3. Create a project directory with a `project-specs.md` scaffold.
4. Ask you to run `/compact` to clear context, then hand off to the specialist.

After `/compact`, Syn performs an **in-session persona transfer** — it reads the specialist's agent file and becomes that specialist. From there, the specialist runs its full phased workflow.

## Skip triage — go direct

If you already know which specialist you need, run the command directly:

```
/data-analyst     # quick adhoc analysis
/data-scientist   # deep study, EDA, modeling
/ml-engineer      # production ML, ranking, recommenders
/ai-engineer      # LLM workflows, RAG, prompt engineering
/data-engineer    # pipelines, dbt models
/data-modeller    # entities, relationships, grain
/analytics-engineer  # dbt transformation layers, marts
/bi-engineer      # dashboards, visualizations
/backend-engineer # Python code review
/applied-ml-scientist     # novel ML methodology
/deep-learning-engineer   # neural architectures
/mlops-engineer   # deployment, serving, monitoring
/researcher       # statistical methodology review
/academic         # safety, ethics, literature review
/brainstorm       # multi-agent ideation
/knowledge        # browse the Knowledge Ledger
/review-pr        # walk through GitHub PR comments
/shards-ui        # open the web UI
```

See the [Slash Command Reference](../05-commands/reference.md) for what each invokes.

## What to expect inside a phase

Every specialist follows the same rhythm:

1. **Gather context** — the specialist asks questions or reads existing project state.
2. **Propose** — it drafts a decision for the current phase (scope, methodology, architecture, etc.).
3. **Consult** — if the phase requires another specialist's input (e.g. the Data Scientist needs the Researcher to review its statistical approach), it spawns that specialist via the Task tool. You'll see this happen.
4. **Document** — the decision is written to `project-specs.md` in a `::GATE::` fence.
5. **Confirm** — the specialist reads the section back to you and waits for your confirmation before advancing.

This is the [Gate Pattern](../03-protocols/gate-pattern.md), and it's the single most important idea in Shards. Every decision is documented *before* execution, so you can audit or redirect at any point.

## The final review

At the end of every specialist's last phase, it invokes Syn via Task for a final review. Syn returns `APPROVED`, `NEEDS REVISION`, or `BLOCKED`. See [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md).

## When things go sideways

- **Stuck at a gate?** Run `shards-gates status` at the terminal for diagnostics. `shards-gates force-close` will unstick a session in a pinch.
- **Want to abandon a project?** Just close the session. The `project-specs.md` file is safe to keep or delete.
- **Need to come back later?** Re-open `/shards`, tell Syn you want to resume project `<name>`, and it'll pick up where `project-specs.md` left off.

## See also

- [Core Concepts](concepts.md) — agents, phases, gates, Knowledge Ledger
- [Agent Taxonomy](../02-agents/overview.md) — when to use which specialist
- [Example Workflows](../07-workflows/quick-analysis.md)
