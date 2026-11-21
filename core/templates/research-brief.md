<!-- Produced by: [AR] Autonomous Research mode -- core/protocols/autonomous_research.md Section A.3. Written to <project_dir>/experiments/research_brief.md; it is the steering document re-read every iteration. -->
# Research Brief: {{PROJECT_NAME}}

- **Agent:** {{AGENT_NAME}}
- **Date:** {{DATE}}
- **Preset:** {{PRESET}}

<!-- Preset: interactive | overnight | custom (record overrides) -->

---

## Objective

{{OBJECTIVE}}

---

## Primary Metric

- **Metric:** {{PRIMARY_METRIC}}
- **Direction:** {{DIRECTION}}
- **Baseline value:** {{BASELINE_VALUE}}
- **Baseline source:** {{BASELINE_SOURCE}}
- **Target value:** {{TARGET_VALUE}}

---

## Constraints

- **Iteration budget:** {{ITERATION_BUDGET}}
- **Per-iteration time limit:** {{ITERATION_TIME_LIMIT}}
- **Max consecutive regressions:** {{MAX_CONSECUTIVE_REGRESSIONS}}
- **Metric degradation floor:** {{METRIC_FLOOR}}
- **Epsilon (GREEN/YELLOW/RED threshold):** {{EPSILON}}
- **Cost ceiling:** {{COST_CEILING}}
- **Reviewer cadence:** {{REVIEWER_CADENCE}}
- **Plateau window W:** {{PLATEAU_WINDOW}}
- **Diminishing returns threshold:** {{DIMINISHING_RETURNS_THRESHOLD}}
- **Full eval cadence M:** {{FULL_EVAL_CADENCE}}

---

## Scope

Anything not listed as mutable is immutable by default.

- **Mutable:**
  - {{MUTABLE_SCOPE}}
- **Immutable:**
  - {{IMMUTABLE_SCOPE}}

---

## Steering Notes

<!-- User-editable. Empty at creation. Re-read every iteration. Examples: "prioritize feature engineering over hyperparameter tuning"; "avoid transformer-family". A standalone STOP, PAUSE, or HALT directive halts the loop. -->

---

## Research Log

<!-- Append-only, one line per iteration:
- **Iter N** (<green|red|yellow>, <kept|reverted>): <hypothesis> — <metric> <before> → <after>
-->
