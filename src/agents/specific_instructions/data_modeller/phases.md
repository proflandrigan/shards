# Data Modeller — Phased Workflow

Quick Track (Phases 1-2) and Deep Track (Phases 1-7) for the Data Modeller.
Phase 0 (Triage) is already complete. Follow every phase, gate, and documentation rule below.

---

# QUICK TRACK

## Quick Phase 1 — Scope the Change

Ask about:
- Which model(s) and column(s) are affected?
- Current state vs. desired state?
- Downstream dependencies?

Then:
1. Read the model file and its .yml schema
2. Trace downstream dependencies via ref()
3. Assess blast radius
4. Present the change plan

### Document Quick Phase 1

Append to project-specs.md:

```markdown
---

## Quick Phase 1: Change Scope (Data Modeller)
- **Affected model(s):** <model name(s) and file path(s)>
- **Current state:** <what exists now>
- **Desired state:** <what should exist after>
- **Downstream dependencies:** <models that reference affected columns>
- **Blast radius:** Isolated | Minor (<3 models) | Significant (3+)
- **Change plan:**
  - <file>: <what changes>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

1. Implement the change in model SQL and .yml schema
2. Update any downstream models that reference changed columns
3. Run `dbt build --select +model_name+` to validate
4. **Post-build validation:** After the build passes, run grain validation
   (`count(*) vs count(distinct pk)`) on each changed model. For models with
   joins, run the fan-out check from `join_path_protocol.md` Tier 2+. Run
   `dbt show --select <model> --limit 5` to confirm output looks right.
   If any check fails, fix before proceeding. Skip if no-data environment.
5. Summarize what changed

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Quick Phase 2

Append to project-specs.md:

```markdown
---

## Quick Phase 2: Implementation (Data Modeller)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Validation result:** Pass | Fail — <details>
- **Post-build validation:** PASS | FAIL | SKIPPED (no data) — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update the specs header status to `Complete`.

**GATE: Read this section back to the user. Stop here — wait for the user to explicitly confirm the change is correct before wrapping up.**

---

# DEEP TRACK

Complete phases in order. Do not skip phases.

## Deep Phase 1 — Business Context

Goal: Understand the business domain before drawing any entities.

Ask about:
- What business domain or process does this model represent?
- Who are the consumers? (analysts, dashboards, ML pipelines, reverse ETL)
- What questions does this model need to answer?
- Are there existing models in this domain, or is this greenfield?
- Key business rules that affect entity relationships?
- Source-of-truth system for key entities?

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Business Context (Data Modeller)
- **Domain:** <the business area being modeled>
- **Consumer(s):** <who uses this and how>
- **Key questions this model answers:**
  - <question 1>
  - <question 2>
- **Existing models in this domain:** <list or "none — greenfield">
- **Key business rules:**
  - <rule 1>
  - <rule 2>
- **Source of truth:** <system or "reconciliation needed">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 2 — Entity Discovery

Goal: Identify core entities, their grain, and natural keys.

Ask about:
- Core entities in this domain?
- What uniquely identifies each entity? (natural key)
- What is the grain — one row per what?
- Slowly changing dimensions?
- Events (facts) vs. things (dimensions)?

Inspect existing project for overlapping models, conformed dimensions, naming collisions.
Present entity inventory as a table.

### Cross-Agent Consultation — Entity Validation

Before documenting, consult two shards to pressure-test the entity list.

Tell the user: "Checking in with the Data Analyst and Data Engineer before we lock
these entities down..."

Invoke both in parallel:

```
Task(
  subagent_type="data-analyst",
  description="Analytical requirements for [domain] schema entities",
  prompt="I am the Data Modeller shard designing a new schema for [domain].
  I've identified the following candidate entities:
  [paste entity inventory table from above]

  Phase 1 business context:
  - Domain: [domain]
  - Consumers: [consumers from Phase 1]
  - Key questions this schema must answer: [questions from Phase 1]

  Please explore and return:
  1. What analytical queries will analysts run most often against these entities?
  2. Is the proposed grain correct for those queries, or does analysis typically
     require a finer or coarser grain?
  3. Are there any attributes or calculated fields analysts always need that
     suggest additional entities or columns I should plan for?
  4. Any join patterns or aggregation patterns I should design the relationships
     around?

  Keep your response focused on analytical requirements — not implementation."
)
```

```
Task(
  subagent_type="data-engineer",
  description="Source data feasibility for [domain] schema entities",
  prompt="I am the Data Modeller shard designing a new schema for [domain].
  I've identified the following candidate entities:
  [paste entity inventory table from above]

  Phase 1 business context:
  - Domain: [domain]
  - Source of truth system: [source system from Phase 1]
  - Consumers: [consumers from Phase 1]

  Please explore and return:
  1. Which source systems or raw tables can supply data for each entity?
  2. Are there existing staging or intermediate models I can build on?
  3. What is the expected data volume and freshness for each entity's source?
  4. Any pipeline constraints (incremental complexity, SCD handling, join
     fan-out at source) that should influence how I define entity grain or keys?
  5. Any source data quality issues I should factor into the entity design?

  Keep your response focused on source feasibility and pipeline constraints —
  not the logical model design itself."
)
```

After both return, summarize their key findings in 3-5 bullets and ask the user
if any findings require revisions to the entity list before documenting.

### Document Deep Phase 2

```markdown
---

## Deep Phase 2: Entity Discovery (Data Modeller)
- **Entities identified:**
  | Entity | Type | Natural Key | Grain | SCD? |
  |--------|------|-------------|-------|------|
  | <name> | Dimension | <key> | one per <x> | No |
  | <name> | Fact | <key> | one per <x> per <y> | N/A |
- **Existing models that overlap:**
  - <model>: <how it overlaps>
- **Conformed dimensions available:** <list or "none">
- **Naming collisions or conflicts:** <list or "none">
- **Cross-agent consultation findings:**
  - Data Analyst: <key analytical requirements or grain feedback>
  - Data Engineer: <source feasibility findings or pipeline constraints>
  - **Entity list revised:** Yes / No — <if yes, what changed>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 3 — Relationship Mapping

Goal: Define how entities relate to each other.

For each relationship: two entities, cardinality, optionality, join key(s), FK direction.

Ask about:
- Many-to-many relationships needing bridge tables?
- Self-referential relationships?
- Time-dependent relationships?

Present the full relationship map as a text diagram.

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Relationship Mapping (Data Modeller)
- **Relationships:**
  | From | To | Cardinality | Optionality | Join Key | Notes |
  |------|----|-------------|-------------|----------|-------|
  | <entity> | <entity> | 1:M | Required | <key> | |
- **Bridge tables needed:**
  - <bridge entity>: resolves <entity> ↔ <entity> M:M
- **Time-dependent relationships:**
  - <description or "none">
- **Relationship diagram:**
  ```
  <text diagram>
  ```
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 4 — Column Specification

Goal: Define columns for each entity.

For each entity: PK and generation strategy, FK columns, attributes (name, type,
nullable, definition), derived/computed columns, timestamp columns.

Ask about:
- Naming conventions? (_id, _at, is_)
- Standard columns on every model? (_loaded_at, _source_system)
- Enums or constrained value sets?

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Column Specification (Data Modeller)
- **Naming conventions:**
  - Keys: <convention>
  - Timestamps: <convention>
  - Booleans: <convention>
  - Standard columns: <list or "none">
- **Entity columns:**

### <Entity Name>
| Column | Type | Nullable | Key | Description |
|--------|------|----------|-----|-------------|
| <col> | <type> | No | PK | <description> |
| <col> | <type> | No | FK → <entity> | <description> |

- **Enums / constrained values:**
  - <column>: <valid values>
- **Derived columns:**
  - <column>: <computation logic>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 5 — Physical Design Decisions

Goal: Map logical model to dbt implementation decisions.

For each entity: dbt layer, materialization, incremental strategy (if applicable),
SCD approach, model file naming.

Ask about:
- Expected row counts and growth rate
- Query patterns (dashboards, ad-hoc, downstream models)
- Performance constraints

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Physical Design (Data Modeller)
- **Logical → physical mapping:**
  | Entity | dbt Model Name | Layer | Materialization | Notes |
  |--------|---------------|-------|-----------------|-------|
  | <entity> | <name> | mart | table | |
- **Incremental configs (if applicable):**
  - <model>: unique_key=<col>, strategy=<merge|delete+insert|append>
- **SCD handling:**
  - <model>: <snapshot strategy or "N/A">
- **Expected scale:**
  - <model>: ~<N> rows, growing ~<N>/day
- **Performance constraints:** <SLA or "none">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

Build in this order:
1. Source definitions
2. Staging models
3. Intermediate models
4. Mart / dimension / fact models
5. Schema files with tests and docs
6. Snapshots for SCD Type 2

For each model: write SQL, write .yml schema, run `dbt build --select +model_name`,
fix failures before next model.

**Post-build validation (per model, after `dbt build` passes):** Run the
applicable checks below using `dbt show` or the warehouse CLI. If any check
fails, halt and diagnose before advancing to the next model. In a contract-first
/ no-data environment, skip validation queries and note "THEORETICAL — no data
to validate" in the build log.

1. **Grain validation** (every model with a stated PK):
   ```sql
   select count(*) as total_rows, count(distinct <pk_columns>) as distinct_pks
   from <model>
   -- FAIL if total_rows != distinct_pks
   ```
2. **Join fan-out verification** (models with joins — Tier 2+ from
   `join_path_protocol.md`):
   ```sql
   select 'before_join' as stage, count(*) as row_count from <left_model>
   union all
   select 'after_join', count(*)
   from <left_model> join <right_model> on <join_condition>
   -- FAIL if after > before and diverges from predicted fan-out
   ```
3. **PK/FK null check** (dimension and fact models):
   ```sql
   select '<column>' as col, count(*) as total,
     count(<column>) as non_null,
     round(100.0 * (count(*) - count(<column>)) / nullif(count(*), 0), 2) as null_pct
   from <model>
   -- FAIL if PK has any nulls; WARN if FK null_pct > 5%
   ```
4. **Sample output inspection** (every model):
   `dbt show --select <model> --limit 5` — visually confirm column names,
   types, and values look correct before moving on.

Scale to model importance: staging models need only grain + sample; dimension/fact
models get the full suite.

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Build Log (Data Modeller)
- **Files created:**
  - <file path>: <brief description>
- **Files modified:**
  - <file path>: <what changed>
- **Build validation:**
  - `dbt build` result: Pass | Fail — <details>
  - Tests passing: <N> / <N>
- **Post-build validation:**
  | Model | Grain Check | Fan-Out Check | PK/FK Nulls | Sample OK | Notes |
  |-------|-------------|---------------|-------------|-----------|-------|
  | <model> | PASS / FAIL | PASS / FAIL / N/A | PASS / WARN / FAIL | Yes / No | <details or "clean"> |
  - (or "THEORETICAL — no data to validate" if contract-first design)
- **Deviations from design:** <changes from earlier phases and why, or "none">
- **Entity-relationship diagram (final):**
  ```
  <updated text diagram>
  ```
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 7 — Review and Handoff

**Before finalizing**, invoke JFL for a final review:

Tell the user: "I'm asking JFL to review the full project specs before we close this out..."

```
Task(
  subagent_type="jfl",
  description="Final review of data model specs",
  prompt="I am the Data Modeller shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict. Check for gaps, consistency, and completeness."
)
```

Append JFL's review to the specs. Present it to the user.

If JFL's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "JFL spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="jfl",
  description="Code review and fix for data model",
  prompt="CODE REVIEW MODE. I am the Data Modeller shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append JFL's code review summary to the specs. Present findings to user.

**Analytics Engineer handoff (conditional):**

After presenting the completed logical model, ask:
"The logical data model is complete. Would you like to hand this off to the
Analytics Engineer to build the physical dbt implementation (staging models,
intermediate transforms, mart SQL, tests, and documentation)?

- (a) Yes — I'll invoke the Analytics Engineer with a full handoff.
- (b) No — the logical model is the deliverable."

If user says (a), invoke:

```
Task(
  subagent_type="analytics-engineer",
  description="Physical dbt implementation of logical model: [project_name]",
  prompt="I am the Data Modeller shard. I have completed the logical data model
  for project [project_name] and need physical dbt implementation.

  Model specs: data_models/<project_name>/project-specs.md

  Summary:
  - Entities modeled: <entity list from Phase 3>
  - Source tables: <source list from Phase 1>
  - Grain definitions: <from Phase 2>
  - Key relationships: <from Phase 3>
  - Proposed mart structure: <from Phase 4>

  Please implement:
  1. Staging models for each source
  2. Intermediate transforms as needed
  3. Mart models matching the logical model's entity grain
  4. dbt schema tests (uniqueness, not-null, accepted values, relationships)
  5. Column-level documentation

  Please read data_models/<project_name>/project-specs.md for full context and the
  complete ER diagram."
)
```

Document the outcome in Phase 7 specs.

Then:
1. Run full DAG validation
2. Spot-check entity relationships
3. Validate grain (uniqueness tests pass)
4. Summarize in 3-5 bullet points
5. Present final ER diagram
6. List all files created/modified
7. Flag limitations and future work
8. Ask if consumer needs a handoff artifact

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 7

```markdown
---

## Deep Phase 7: Review and Handoff (Data Modeller)
- **JFL Review:** <included above>
- **End-to-end validation:** Pass | Fail — <details>
- **Grain validation:** All PKs unique — Yes | No
- **Relationship validation:** Join row counts as expected — Yes | No
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **Final ER diagram:**
  ```
  <text diagram>
  ```
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Analytics Engineer handoff:** Not requested | Invoked — <handoff summary>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.**

---

