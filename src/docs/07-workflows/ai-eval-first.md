# Workflow: AI Engineering — Eval-First

The AI Engineer's default posture. Before building the prompt chain or the RAG pipeline, build the evaluation. Every subsequent change is measured against it.

## Flow

```
/ai-engineer
  ├─ Phase 0: triage (is this actually an AI problem, or a regex?)
  ├─ Phase 1: knowledge retrieval + problem framing
  ├─ Phase 2: eval dataset + metric definition
  │   └─ Researcher consult — statistical rigor of metric
  ├─ Phase 3: baseline (the simplest possible approach)
  │   └─ Record metric on baseline
  ├─ Phase 4: candidate approach(es)
  │   └─ Optional: DIVERGE into parallel branches
  │   └─ Optional: [AR] mode for budget-bounded refinement
  ├─ Phase 5: winner selection + human review
  ├─ Phase 6: productionization (ML Engineer consult for infra)
  ├─ Phase 7: monitoring spec (MLOps consult)
  └─ Phase 8: Syn final review
```

Output: `services/<project>/` with eval dataset, prompts, evaluation runs, and deployment notes.

## The "could this be a regex?" check

The AI Engineer's Phase 0 explicitly asks whether the problem actually needs an LLM. Many apparent AI tasks:

- Classification with clear rules → rules engine.
- Extraction from structured text → regex or parser.
- Deterministic transformation → code.

If regex-able, the AI Engineer refuses and redirects. This saves both inference cost and the operational surface area of an LLM in production.

## Prompt Lab mode (`[PL]`)

For iterative prompt design, the AI Engineer's `[PL]` mode pushes a `prompt-lab` UI panel:

- Prompt editor on the left.
- Eval dataset on the right.
- Run button triggers evaluation; results appear side-by-side.
- Version history lets you compare prompt variants.

## AR mode (`[AR]`)

Budget-bounded autonomous loop. The AI Engineer adapts hypotheses, re-runs evals, auto-keeps or auto-reverts based on metric direction. User can steer mid-loop by editing `research_brief.md`.

## DIVERGE

When the approach space itself is unclear (e.g., "RAG vs. fine-tune vs. pure prompt"), fork parallel branches. Each branch runs independently; Syn Arbiter compares.

## See also

- [AI Engineer](../02-agents/ai-engineer.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- [DIVERGE](../03-protocols/diverge.md)
