> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

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

::GATE:: id=data-modeller-deep-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-3.md` in full and follow its instructions starting from Deep Phase 3.
