# Workflow: AI Engineering, Eval-First

The AI Engineer's default posture. Before building the prompt chain or the RAG pipeline, build the evaluation. Every subsequent change is measured against it.

## Flow

Start with `/shards:ai-engineer` (or `/shards:syn` to triage). Phase 0 triage asks whether the problem is an AI problem at all, then the phases run in order, each ending in a `gate_request` tool call:

```
/shards:ai-engineer
  ├─ Phase 0: triage (is this actually an AI problem, or a regex?)
  ├─ Phase 1: ground the system in a business problem
  ├─ Phase 2: technical boundaries and infrastructure realities
  ├─ Phase 3: AI architecture (models, prompts, retrieval, tools)
  ├─ Phase 4: evaluation framework (metrics, test sets)   <- Researcher consult
  ├─ Phase 5: safety and guardrails
  ├─ Phase 6: build prompts, eval harness, integration, eval results (validated gate)
  └─ Phase 7: backend review, Syn sign-off, service card, handoff
```

Output: `shards/<project>/` with the eval dataset, prompts, evaluation runs and deployment notes; service code integrates into the existing codebase at the confirmed targets.

The evaluation is designed in Phase 4, before any build, and the Phase 6 gate is validated: it carries `validates=ai-engineer` and expects executed eval results as evidence. Build work can be split into a task manifest and run by workers (see [Delegated build](../03-protocols/delegated-build.md)), with `checkpoint` gates between components per [incremental testing](../03-protocols/incremental-testing.md).

## The "could this be a regex?" check

Phase 0 explicitly asks whether the problem needs an LLM. Many apparent AI tasks are classification with clear rules (a rules engine), extraction from structured text (a parser) or deterministic transformation (code). If it is regex-able, the AI Engineer says so and redirects, saving inference cost and operational surface.

## Consults

Consults run as subagents in `consult` mode: the Researcher reviews metric rigor, the ML Engineer reviews production infrastructure feasibility, the MLOps Engineer reviews deployment and monitoring needs, and Syn signs off at Phase 7. Backend review applies to `.py` code.

## Prompt Lab mode (`[PL]`)

For iterative prompt design, choose `[PL]` from the AI Engineer's menu. It scans the project's `prompts/` files and their metadata headers, lets you edit and evaluate prompt variants against the eval dataset and versions them. The mode file (`core/agents/ai-engineer/modes/prompt_lab.md`) is still written around a browser panel; check [Studio](../04-studio/overview.md) for what the current panel supports before relying on the side-by-side view.

## AR mode (`[AR]`)

A budget-bounded autonomous loop. The AI Engineer proposes hypotheses, re-runs the eval and auto-keeps or auto-reverts based on metric direction. You can steer mid-loop by editing the research brief. See [Autonomous Research](../03-protocols/autonomous-research.md).

## DIVERGE

When the approach space itself is unclear (RAG vs. fine-tune vs. pure prompt), fork parallel branches and let Syn's arbiter compare them. See [DIVERGE exploration](diverge-exploration.md).

## See also

- [AI Engineer](../02-agents/ai-engineer.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- [DIVERGE](../03-protocols/diverge.md)
- [Gate pattern](../03-protocols/gate-pattern.md)
