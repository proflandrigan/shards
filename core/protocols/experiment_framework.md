---
name: experiment-framework
description: >
  Shared protocol for planning and building a multi-approach experiment
  framework inside a phased build. The planning phase proposes an experiment
  plan (baseline plus candidate approaches, one shared evaluation, a decision
  rule) with a single-approach opt-out; the build phase produces a reusable
  `experiments/` harness (approach modules behind a common interface, a
  registry, one runner, a leaderboard) driven by the project notebook.
  Referenced by the Data Scientist (modelling studies), ML Engineer and AI
  Engineer.
type: reference
---

# Experiment Framework Protocol

Phased builds should not silently commit to one approach. When the work involves
choosing between algorithms, model families, architectures or prompt designs,
the planning phase lays out an **experiment plan** and the build phase produces
an **experiment harness** the user keeps: they can compare the planned approaches
now and add more later without rebuilding.

Who uses it, and where:

| Agent | Planning (Section A) | Build (Sections B-D) | Applies when |
|-------|----------------------|----------------------|--------------|
| Data Scientist | Phase 4 | Phase 6 (write-only) | Modelling studies only. Analysis-only studies skip Phase 4 and this protocol. |
| ML Engineer | Phase 4 | Phase 6 (and Phase 6.5 reads the leaderboard) | Always |
| AI Engineer | Phase 3 (designs), Phase 4 (shared eval) | Phase 6 | Always |

---

## Section A — Experiment plan (planning phase)

### A.1 Propose, don't decide

Do not present a single approach as the plan. Propose:

1. **Baseline** — the simplest credible approach; the floor to beat (for example
   logistic regression, popularity ranking, a rule, a single prompt on the cheapest
   model tier).
2. **Candidate approaches (2-4)** — genuinely different options worth comparing,
   each with a one-line hypothesis: *why might this beat the baseline, and at
   what cost?* Prefer variety across a real axis (model family, feature strategy,
   architecture rung, prompt strategy, retrieval method, model tier) over
   near-duplicates (the same model with two learning rates is tuning, not an
   approach).
3. **Shared evaluation** — every approach is scored the same way: the same data
   split or test set, the same primary metric (and direction), the same secondary
   metrics and constraint checks (latency, memory, cost per request, interpretability).
4. **Decision rule** — how the winner is picked: best primary metric among
   approaches that pass every constraint, with a stated tie-break (simpler wins
   ties within <tolerance>). Name the tolerance.

Mark one candidate as your **recommended lead** and say why. Recommending is fine;
skipping the comparison is not.

### A.2 The single-approach opt-out

Ask the user, in your own voice:

> "Do you want the experiment harness so you can compare these (and add more
> later), or should I commit to <recommended lead> alone?"

- **Harness** (default) — keep the baseline plus the candidates the user selects
  (they may add or drop any). The build produces the harness in Sections B-D.
- **Single approach** — build only the recommended lead (plus the baseline as a
  floor, unless the user drops it too). No `experiments/` harness is built; the
  build phase follows its existing single-model / single-design path. Record the
  opt-out and the user's reason.

Never take the opt-out on the user's behalf. If the user has already said they
want one specific approach, still offer the harness once, briefly, then respect
the answer.

### A.3 Document the plan

Add this block to the phase's documentation in `project-specs.md`:

```markdown
- **Experiment plan:**
  - Mode: Harness | Single approach (opted out — <user's reason>)
  - Baseline: <approach> — <why it is the floor>
  - Candidates:
    - <approach_id>: <description> — hypothesis: <why it might win, at what cost>
    - <approach_id>: <description> — hypothesis: <...>
  - Recommended lead: <approach_id> — <why>
  - Shared evaluation: <split or test set>; primary metric <metric> (<higher|lower> is better); secondary: <metrics>; constraints: <latency/memory/cost/interpretability budgets>
  - Decision rule: <best primary metric among constraint-passing approaches; ties within <tolerance> go to the simpler approach>
```

`<approach_id>` is a short snake_case identifier (`logreg_baseline`,
`lightgbm`, `rag_hybrid`, `single_prompt_small_tier`). It becomes the module
name in Section B.

### A.4 Relationship to DIVERGE

Prefer the harness when approaches share the same data, the same evaluation and
the same deliverable — that is a comparison, not a fork. Propose DIVERGE
(`protocols/diverge.md`) only when the approaches would change the project's
shape: different data sources, different deliverables, or different downstream
phases.

---

## Section B — Harness layout (build phase)

Built only when the experiment plan mode is **Harness**. Location:
`<output_dir>/experiments/`, alongside the project's notebook.

```
<output_dir>/experiments/
  __init__.py
  base.py              # the common interface (Section C)
  registry.py          # loads experiments.yaml, imports enabled approaches
  experiments.yaml     # which approaches exist, which are enabled, their params
  approaches/
    __init__.py
    <approach_id>.py   # one module per approach (baseline included)
  run_experiments.py   # evaluate every enabled approach the same way
  leaderboard.csv      # written by the runner: one row per approach run
  leaderboard.md       # same table, human-readable, decision-rule verdict at the top
```

`experiments.yaml`:

```yaml
primary_metric: <metric>
direction: maximize | minimize
tie_tolerance: <number>
approaches:
  - id: <approach_id>
    module: approaches.<approach_id>
    enabled: true
    role: baseline | candidate
    params: { <key>: <value> }
```

Rules:

- **One approach per module.** Each module defines one class implementing the
  Section C interface. Approaches never import each other.
- **Shared evaluation lives in the runner, not in approaches.** Approaches only
  fit and predict (or run). Splitting, scoring, constraint checks and the
  leaderboard belong to `run_experiments.py`, so every approach is judged
  identically.
- **Adding an approach later** = one new file under `approaches/` + one entry in
  `experiments.yaml`. Nothing else should need to change; if it does, the
  harness is wrong.
- **Seeds and splits are fixed** in the runner (or loaded from the project's
  existing split) and reused for every approach.
- **Leaderboard columns:** `approach_id, role, primary_metric, <secondary metrics...>, <constraint measurements...>, constraints_pass, run_timestamp, params_hash`.
  The runner appends a row per run; `leaderboard.md` shows the latest row per
  approach, sorted by the primary metric, with the decision-rule winner marked.
- **Filenames do not collide with experiment mode.** Experiment mode
  (`modes/experiment.md`) writes `experiments/results.json`, `experiment_plan.md`
  and `experiment_<N>_<name>.md`; the harness never writes those names.

## Section C — Interfaces

`base.py` defines one abstract base class. Use the variant that fits the agent.

**Model variant (Data Scientist, ML Engineer):**

```python
from abc import ABC, abstractmethod

class Approach(ABC):
    id: str
    role: str  # "baseline" | "candidate"

    def __init__(self, **params):
        self.params = params

    @abstractmethod
    def fit(self, X_train, y_train): ...

    @abstractmethod
    def predict(self, X): ...

    def predict_proba(self, X):  # optional; override for probabilistic metrics
        raise NotImplementedError
```

**AI variant (AI Engineer):**

```python
from abc import ABC, abstractmethod

class Approach(ABC):
    id: str
    role: str  # "baseline" | "candidate"

    def __init__(self, **params):
        self.params = params

    @abstractmethod
    def run(self, example: dict) -> dict:
        """Return {"output": ..., "input_tokens": int, "output_tokens": int, "latency_ms": float}."""
```

AI approaches load their prompts from the project's `prompts/` files (versioned,
with metadata headers) rather than embedding prompt text in Python. Model choice
is a `params` entry in `experiments.yaml`, never hard-coded.

## Section D — Notebook driver and results

The notebook **drives** the harness; it does not re-implement it.

- The modelling / candidate / prompt-execution section imports the registry and
  calls the runner:
  ```python
  import sys; sys.path.insert(0, "..")
  from experiments.run_experiments import run_all
  leaderboard = run_all(X_train, y_train, X_test, y_test)   # model variant
  # leaderboard = run_all(test_set)                         # AI variant
  leaderboard
  ```
- A comparison cell shows the leaderboard (table and one chart of the primary
  metric per approach), then names the decision-rule winner.
- Downstream sections (model analysis, SHAP, error analysis, quality analysis)
  run on the winner, fetched from the registry by `approach_id`.
- **`eval-results.json`** (ML Engineer, AI Engineer) keeps its schema:
  - ML Engineer: `baseline` ← the baseline row; `bestCandidate` ← the
    decision-rule winner from the leaderboard, with `deltas` against the baseline.
  - AI Engineer: one `prompts[]` entry per approach (its `name` is the
    `approach_id`); top-level `dimensions` reflect the winner.
- **Data Scientist** builds are write-only: the harness and notebook are written,
  not executed. Acceptance is structural (Section E).

## Section E — Build tasks and acceptance

The build phase's task list gets these components, each citing this section
through `plan_ref`:

| Task | Owned paths | Acceptance |
|------|-------------|------------|
| Harness core | `experiments/__init__.py`, `base.py`, `registry.py`, `run_experiments.py`, `experiments.yaml` | Interface matches Section C; the registry imports only `enabled: true` entries; the runner applies one split/test set and one scoring path to every approach and writes both leaderboard files. |
| One task per approach | `experiments/approaches/<approach_id>.py` (+ its `experiments.yaml` entry, coordinated through `depends_on` on the harness-core task) | The class subclasses `Approach`, sets `id`/`role`, implements the interface, reads hyperparameters from `params`. |
| Notebook driver | notebook section group (chained by `depends_on` like other notebook tasks) | The section imports the runner, displays the leaderboard and names the winner; no approach logic is duplicated in the notebook. |

Execution-capable builds (ML Engineer, AI Engineer) additionally verify: each
approach smoke-runs on a small subset (<=1% of data, or 3-5 test examples)
before the full run, and the leaderboard has one row per enabled approach.
Data Scientist builds verify structurally only (read-back, grep, `python -m
py_compile` on the harness files is allowed; nothing is run against data).

## Section F — Iterating later

- **ML Engineer Phase 6.5** reads `experiments/leaderboard.csv` for state
  inspection; `[A]` Solo AR mutates only the leading approach's module and its
  `experiments.yaml` params; `[F]` fan-out uses one approach family per branch.
- **Experiment mode and AR** (`modes/experiment.md`, `modes/research.md`): when
  an `experiments/` harness exists, each experiment is a new or modified
  approach module plus a runner call, and the result is read from the leaderboard.
