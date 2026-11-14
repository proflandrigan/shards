> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 3: Implementation Blueprint (Gated)

Goal: Translate the architecture into an engineering plan before writing code.

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

```
Task(
  subagent_type="researcher",
  description="Review experimental design for novel ML framework evaluation",
  prompt="I am the Applied ML Scientist shard designing the evaluation protocol
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
  Keep the review focused on experimental design and statistical inference."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

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
- Verdict: Sound | Concerns | Revise
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
```

**DIVERGE check:** If you identified 2-3 mutually exclusive framework architectures or methodological approaches that are genuinely equally viable, you MAY propose a DIVERGE fork. Read `.claude/agents/specific_instructions/shared/diverge_protocol.md` and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

::GATE:: id=applied-ml-scientist-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/applied_ml_scientist/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
