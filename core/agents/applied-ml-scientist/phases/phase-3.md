> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 3: Implementation Blueprint (Gated)

Goal: Translate the architecture into an engineering plan, and the plan into
a task list, before the prototype is built.

Define:
- **Code structure:** module breakdown, class hierarchy, interfaces between
  components
- **Framework choice and dependencies:** PyTorch vs JAX, which libraries, why
- **Training loop design:** optimizer, scheduler, logging (wandb/tensorboard),
  checkpointing strategy
- **Evaluation protocol:** metrics, baselines to compare against, ablation
  plan (which components are ablated to validate the hypothesis)
- **Synthetic data plan:** If no real data yet, what synthetic distribution
  captures the essential properties for a proof-of-concept run?

**If the evaluation involves statistical inference** — significance testing
for baseline comparisons, confidence intervals on metrics, power analysis for
ablation studies, or experiment design for hypothesis validation — consult the
Researcher:

Tell the user: "The evaluation protocol involves statistical inference — I'm
asking the Researcher shard to validate the experimental design before we
commit to it."

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="Review experimental design for novel ML framework evaluation"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Applied ML Scientist shard designing the evaluation protocol
for a novel ML framework: [description].
Here is the proposed evaluation approach:
- Core hypothesis: [from Phase 1]
- Primary metric: [metric and success threshold]
- Baselines: [list of comparison methods]
- Ablation plan: [which components are ablated]
- Statistical test planned: [t-test, bootstrap, paired test, etc. or 'TBD']
- Number of runs / seeds: [N or 'TBD']
- Confidence level: [95%, 99%, etc. or 'TBD']
Please review from a statistical methodology perspective:
1. Is the proposed comparison method appropriate (paired vs unpaired, parametric
   vs non-parametric)?
2. Is the number of runs / seeds adequate to claim significance?
3. Are there multiple comparison issues across ablations?
4. Is the experimental design sound for validating the stated hypothesis?
5. What power analysis would you recommend given the expected effect size?
Keep the review focused on experimental design and statistical inference.
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

### Decompose the plan into tasks

Turn the plan just agreed into `research/<project_name>/tasks.yaml`, the single task list for
the build (every task is `phase: 4`). One task per tested component,
each with id, goal, plan_ref (section of project-specs.md), inputs, owned_paths
(no overlap between tasks that can run in parallel), acceptance command +
expected evidence, depends_on, worker (your own agent id), size and phase.

Include the project skeleton as the first Phase 4 task(s) that the others
depend on: `src/` module stubs with the interfaces from the Code Structure
section, `requirements.txt` from Dependencies, and the training/evaluation
config. Acceptance: modules import and the config loads. The other Phase 4
tasks are the build components named in the Phase 4 component specifications
(data, model/components, smoke-train, full-train, eval, and the notebook
sections that exercise them).

Nothing is dispatched in this phase: planning is approved at this gate and
the build runs in Phase 4 (as for the other specialists). Validate the list
with the `tasks_set` tool ({{protocol delegated_build}} has the rules). Add the
`### Task list` table to the Phase 3 section below so you approve plan and
tasks together at this gate; the gate summary must name the task count and
the `tasks.yaml` path.

### Document Phase 3

Append to `project-specs.md`:

```markdown
## Phase 3: Implementation Blueprint

### Code Structure
```
src/
├── <module>.py          — <purpose>
├── <module>.py          — <purpose>
└── <module>.py          — <purpose>
```

### Dependencies
- **Framework:** PyTorch <version> | JAX <version> — <rationale>
- **Key libraries:** <library: purpose>
- **Dev dependencies:** <testing, logging, visualization>

### Training Loop
- **Optimizer:** <optimizer, hyperparams, rationale>
- **Scheduler:** <scheduler, warmup, rationale>
- **Logging:** <wandb | tensorboard | both> — key metrics to track
- **Checkpointing:** <strategy — best val loss, every N epochs, etc.>

### Researcher Review
N/A — no statistical inference in evaluation | <summary if consulted>
- Verdict: APPROVED | NEEDS REVISION | BLOCKED
- Tier: Proceed | Proceed with caveats | Halt
- Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped

### Evaluation Protocol
- **Primary metric:** <metric and threshold for "success">
- **Baselines:** <list — at minimum the strongest relevant prior work>
- **Ablations:**
  | Ablation | What it tests |
  |---------|---------------|
  | Remove <component> | Is <component> contributing? |
  | Replace <X> with <Y> | Is our design better than the standard alternative? |

### Synthetic Data Plan
<If no real data: what distribution do we generate, and why does it
capture the essential properties needed to test the hypothesis?>

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `research/<project_name>/tasks.yaml`
```

**DIVERGE check:** If you identified 2-3 mutually exclusive framework architectures or methodological approaches that are genuinely equally viable, you MAY propose a DIVERGE fork. {{protocol diverge}} and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

Before the gate, summarize the plan and state the task count and the path `research/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
