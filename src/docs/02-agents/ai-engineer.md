# AI Engineer

> Existentially anxious. Deeply skeptical that AI is the right tool.

Specializes in production AI systems — LLM-powered workflows, prompt engineering, RAG pipelines, agentic systems, and generative AI integrations. Obsessed with evaluation, safety, and simplicity. Always asks "could this be a regex?" before designing a prompt chain.

## Activation menu

- `[T]` Triage — Greenfield vs. optimization? Is AI even needed?
- `[B]` Build — Full phased AI engineering workflow.
- `[R]` Review — Evaluate an existing AI system.
- `[ADV]` Advisory — Discuss options without committing to a build.
- `[EX]` Experiment — Targeted experiments on an existing AI system.
- `[AR]` Autonomous Research — Self-steering loop against a metric.
- `[PL]` Prompt Lab — Interactive prompt editing, evaluation, and versioning via the Shards UI.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Build) | `specific_instructions/ai_engineer/phases.md` | Full phased workflow. |
| Review | `specific_instructions/ai_engineer/review.md` | Review-only. |
| Advisory | `specific_instructions/ai_engineer/advise.md` | Advisor mode. |
| Experiment | `specific_instructions/ai_engineer/experiment.md` | Fixed-N experimentation. |
| Experiment UI | `specific_instructions/ai_engineer/experiment_ui_mode.md` | Experiment with UI dashboard. |
| Research | `specific_instructions/ai_engineer/research.md` | Autonomous Research loop. |
| Research UI | `specific_instructions/ai_engineer/research_ui_mode.md` | AR with UI dashboard. |
| Prompt Lab | `specific_instructions/ai_engineer/prompt_lab.md` | Interactive prompt lab. |
| Prompt Lab UI | `specific_instructions/ai_engineer/prompt_lab_ui_mode.md` | Prompt Lab with UI panel. |
| BI handoff | `specific_instructions/ai_engineer/bi_engineer_handoff.md` | Monitoring dashboard handoff. |

## Phases (Build mode)

1. **Business Requirements** — problem, decision, acceptable error rate, human-in-the-loop.
2. **Scope and Constraints** — model providers, data sensitivity, cost budget, latency, fallback.
3. **AI Architecture Design** — simplicity ladder: single prompt → chain → RAG → agent → multi-agent → fine-tune.
4. **Evaluation Framework Design** — Researcher review; dimensions, metrics, test set, golden eval.
5. **Safety and Guardrails Design** — input/output validation, human-in-the-loop, fallback, monitoring.
6. **Execute** — build prompts, eval test set, evaluation notebook, integration code.
7. **Review and Handoff** — triple review (Backend, ML Engineer, MLOps, Researcher), Syn final review, model card and report.

## Consultants

- **ML Engineer** — Phase 2, Phase 5 (production infrastructure).
- **Researcher** — Phase 4, Phase 7 (evaluation rigor).
- **Academic** — Phase 5, Phase 7 (ethics and safety).
- **Backend Engineer** — Phase 7 code review.
- **MLOps Engineer** — Phase 7 deployment review.
- **Syn** — Phase 7 final review.

## Output directory

`services/<project_name>/` (greenfield) or the existing service directory (iteration).

```
services/<project>/
├── project-specs.md
├── prompts/
├── eval/
├── notebooks/
├── eval-results.json
├── model-card.json
├── report.md
└── bi_engineer_handoff.md   (optional)
```

## Entry points

- Slash command: `/ai-engineer`
- Skill: `ai-engineer`
- Through Syn triage (`/shards`)

## See also

- [Prompt Lab](../04-ui/panels.md) — UI panel for prompt iteration
- [Example: AI Eval-First](../07-workflows/ai-eval-first.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `src/agents/ai-engineer.md`
