# Data Engineer — Phased Workflow

Quick Track (Phases 1-2) and Deep Track (Phases 1-7) for the Data Engineer.
Phase 0 (Triage) is already complete. Follow every phase, gate, and documentation rule below.

---

# QUICK TRACK

## Quick Phase 1 — Diagnosis

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Observed behavior vs. expected behavior?
- Recent changes to upstream models or sources?

Then:
1. Read the model file and its .yml schema
2. Trace upstream dependencies via ref() and source()
3. Identify root cause
4. State root cause and proposed fix clearly

### Document Quick Phase 1

```markdown
---

## Quick Phase 1: Diagnosis (Data Engineer)
- **Affected model(s):** <model name(s) and file path(s)>
- **Observed behavior:** <what's happening>
- **Expected behavior:** <what should happen>
- **Root cause:** <what's wrong and why>
- **Proposed fix:** <what will be changed>
- **Upstream impact:** <models affected or "none">
- **Downstream impact:** <models or consumers affected>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

1. Implement the fix
2. Update or add tests if warranted
3. Run `dbt build --select +model_name` to validate
4. Summarize what changed

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Data Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Tests added/modified:** <list or "none">
- **Validation result:** Pass | Fail — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this section back to the user. Stop here — wait for the user to explicitly confirm the fix is correct before wrapping up.**

---

# DEEP TRACK

Complete phases in order. Do not skip.

## Deep Phase 1 — Requirements

Goal: Understand what the downstream consumer needs.

Ask about:
- Who consumes this data? (analyst, dashboard, ML model, reverse ETL)
- What questions do they need this data to answer?
- What grain do they need? (one row per what?)
- Refresh cadence requirement? (real-time, hourly, daily)
- SLAs or dependencies?
- Net-new or replacing something existing?

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Requirements (Data Engineer)
- **Consumer(s):** <who uses this data and how>
- **Key questions this data answers:**
  - <question 1>
  - <question 2>
- **Required grain:** <one row per ___>
- **Refresh cadence:** Real-time | Hourly | Daily | Weekly
- **SLA / dependency:** <time constraint or "none">
- **Replaces existing model:** Yes — <which> | No — net new
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 2 — Source Discovery

Goal: Understand what raw data is available.

Ask about:
- Source system(s)? (app DB, Segment, Stripe, Salesforce, API, files)
- Already landed in warehouse, or ingestion needed?
- Raw data shape? (schema, key columns, volume)
- Known quality issues? (late-arriving, duplicates, schema drift, soft deletes)
- Existing source() definition?

Inspect the existing dbt project for source definitions, staging models, freshness config.

**Always consult the Data Modeller** as the first step of source discovery:

Tell the user: "Checking with the Data Modeller shard first. I need to know what the grain is before I build anything on top of it."

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for [topic]",
  prompt="I am the Data Engineer shard working on [project]. I need to understand
  the existing model structure around [entities/tables]. Please explore and return:
  relevant tables with grain, relationships, key columns, and any quality concerns."
)
```

**Greenfield handling:** Before proceeding, check whether the Data Modeller's response
contains "NO DATA ENVIRONMENT DETECTED".

If it does:
1. Present the Data Modeller's response to the user.
2. Ask:
   "The Data Modeller found no existing models, source definitions, or data files.
   For a pipeline build, I need to know what we're working with:
   - (a) Source data exists — tell me the system (app DB, Stripe, Segment, etc.)
     and whether it's already landed in the warehouse. I'll design from there.
   - (b) Source data exists but schema details aren't handy — I can design the
     pipeline architecture; implementation requires schema access.
   - (c) No source data exists yet — I can do contract-first design: define
     expected schemas, model stubs, and test stubs ready for when data arrives.
     Nothing will run until data exists.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided source info.
   - (b): set Data sufficiency: `Partial`, Decision: `Proceed with caveats`. Add:
     `**Data environment:** Source exists but schema inaccessible — architecture sound, implementation pending.`
   - (c): tell the user: "This will be contract-first pipeline design. I'll produce
     source definitions, model shells, and test stubs — but nothing will run until
     data arrives. All models will be flagged [THEORETICAL — UNTESTED].
     Do you want to proceed on that basis?"
     Wait for confirmation. Set Data sufficiency: `Insufficient`, Decision:
     `Proceed as contract-first design — user confirmed`. Add:
     `**Data environment:** GREENFIELD — No source data detected. Contract-first design only.`

After the Data Modeller responds (and any greenfield path is resolved), assess findings against the Reviewer Verdict Protocol: no quality concerns = Proceed; data quality notes with issues = Proceed with caveats; grain violations or structural problems = Halt and fix. Document the assessment in the specs template below.

### Document Deep Phase 2

```markdown
---

## Deep Phase 2: Source Discovery (Data Engineer)
- **Source system(s):**
  - <source>: <description, landing method, schema location>
- **Ingestion status:** Already landed | Needs setup — <details>
- **Raw data shape:** <key columns, volume, grain>
- **Known quality issues:** <list or "none identified">
- **Existing staging models:** <list or "none">
- **Source definition needed:** Yes | No — <details>
- **Data Modeller consultation:** <summary of findings or "N/A">
  - Tier: Proceed | Proceed with caveats | Halt
  - Reviewer resolution: Approved | User override — <rationale> | Project stopped
- **Data sufficiency:** Sufficient | Partial | Insufficient
- **Decision:** Proceed | Proceed with caveats | Blocked — <rationale>
- **Data environment:** <not greenfield | Source exists but schema inaccessible — architecture sound, implementation pending | GREENFIELD — No source data detected. Contract-first design only>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**
**If Insufficient, do not proceed. Discuss alternatives.**

---

## Deep Phase 3 — Model Design

Goal: Design the dbt model layer architecture.

For each model layer: model name, grain, key columns, join logic, materialization.

Ask about:
- Existing patterns to follow?
- Known edge cases? (late arrivals, timezone handling, etc.)
- Historical backfill vs. ongoing loads?

Present as a DAG:
```
[source] → [staged] → [transformed] → [output]
```

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Model Design (Data Engineer)
- **DAG:**
  ```
  <source> → <model> → <model> → <final mart>
  ```
- **Models to create/modify:**
  | Model | Layer | Grain | Materialization | New/Modified |
  |-------|-------|-------|-----------------|--------------|
  | <name> | staging | <grain> | view | New |
- **Incremental strategy (if applicable):**
  - Unique key: <column(s)>
  - Strategy: append | delete+insert | merge
  - On schema change: append_new_columns | fail | sync_all_columns
- **Join logic:** <trace each join using `.claude/agents/specific_instructions/shared/join_path_protocol.md` format — grain per table, relationship type, predicted output grain>
- **Edge case handling:**
  - <edge case>: <how handled>
- **Backfill approach:** full refresh | date-bounded | N/A
- **Naming conventions confirmed:** Yes | No — <deviations>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 4 — Testing Strategy

Goal: Define tests for data quality and regression prevention.

Ask about:
- Primary keys at each layer?
- Business rules to encode as tests?
- Accepted value ranges or enums?
- Source freshness tests needed?
- Row count or anomaly thresholds?

Define: schema tests (.yml), custom data tests (tests/), source freshness.

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Testing Strategy (Data Engineer)
- **Schema tests:**
  | Model | Column | Test | Severity |
  |-------|--------|------|----------|
  | <model> | <col> | unique | error |
- **Custom data tests:**
  - <test name>: <assertion and why>
- **Source freshness:**
  - <source>: warn_after <N> hours, error_after <N> hours
- **Row count / anomaly monitoring:** <approach or "not required">
- **Test coverage:** Full | Partial — <gaps>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 5 — Documentation Plan

Goal: Document every model and column for downstream consumers.

Ask about:
- Documentation level? (minimal, standard, thorough)
- Existing documentation patterns?
- Columns needing business-context descriptions?

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Documentation Plan (Data Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s):**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description>
- **Key column descriptions:**
  - <model>.<column>: <description>
- **Business context notes:** <columns needing extra context>
- **External documentation:** <wiki, README, or "none">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Build in order:
1. Source definitions
2. Staging models
3. Intermediate models
4. Mart models
5. Schema files with tests and docs
6. Custom data tests

For each model: write SQL → write .yml → run `dbt build --select +model_name` → fix failures.

**Post-build join verification:** After each model that includes joins builds
successfully, run the Tier 2+ verification queries from the join path protocol
(row count before/after join). If actual fan-out diverges from the predicted
fan-out in Phase 3, halt and diagnose before advancing to the next model.

**SQL loading rule (Python scripts only)** — dbt model files are `.sql` by nature.
If any Python scripts are produced (e.g., data loaders, custom macros, orchestration
helpers), **do NOT embed SQL as Python strings.** Write the SQL to a separate `.sql`
file and read it with `Path.read_text()`:
```python
from pathlib import Path
sql = Path("models/marts/mart_name.sql").read_text()
```

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Build Log (Data Engineer)
- **Files created:**
  - <file path>: <description>
- **Files modified:**
  - <file path>: <what changed>
- **Build validation:**
  - `dbt build` result: Pass | Fail — <details>
  - Tests passing: <N> / <N>
- **Deviations from design:** <changes and why, or "none">
- **Performance notes:** <run time, row counts, anything notable>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 7 — Review and Handoff

**Before finalizing**, invoke Syn for final review:

Tell the user: "I'm asking Syn to review the full project specs before we ship this..."

```
Task(
  subagent_type="syn",
  description="Final review of data engineering specs",
  prompt="I am the Data Engineer shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict."
)
```

Append Syn's review to specs. Present to user.

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review and fix for data engineering project",
  prompt="CODE REVIEW MODE. I am the Data Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Then:
1. Run full DAG: `dbt build --select +mart_name`
2. Spot-check final output
3. Summarize in 3-5 bullet points
4. List all files created/modified
5. Flag limitations and follow-ups

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 7

```markdown
---

## Deep Phase 7: Review and Handoff (Data Engineer)
- **Syn Review:** <included above>
- **End-to-end validation:** Pass | Fail — <details>
- **Spot-check results:** <comparison to expected values>
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Follow-up actions:**
  - <scheduling, permissions, consumer walkthrough, etc.>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.**

---

