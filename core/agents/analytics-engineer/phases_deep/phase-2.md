> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Deep Phase 2 — Source and Staging Assessment

Goal: Understand what staging models exist, what's missing, and whether the
upstream data is sound enough to build on.

Ask about:
- Which source systems are involved?
- Are staging models already defined? (stg_ prefix)
- Known data quality issues upstream?
- Existing intermediate models relevant to this work?
- Incremental strategies already in use?

Inspect the transformation project:
- Glob: `**/*.sql` filtered to staging and intermediate paths; look for project config files
- Grep for existing source reference calls to find defined sources
- Check for source definition files (e.g., `sources.yml` or equivalent) for freshness configs

**Consult Data Engineer as the first step of source assessment:**

Tell the user: "Let me check with the Data Engineer shard on the staging layer before we design anything on top of it."

```
Task(
  subagent_type="data-engineer",
  description="Staging layer assessment for [project]",
  prompt="I am the Analytics Engineer shard working on [project]. I need to assess
  the staging layer before designing a transformation pipeline. Please explore and
  return:
  1. Which staging models exist for [source systems / entities]? List model names
     and grain (one row per what).
  2. Are there existing intermediate models I can reuse or build on?
  3. Are source definitions present in sources.yml? Are freshness configs defined?
  4. Any known data quality issues I should factor into my transformation design?
     (late-arriving data, duplicates, schema drift, soft deletes)
  5. What incremental strategies are already in use? Any patterns I should follow
     for consistency?

  Keep your response focused on source layer soundness and staging model inventory —
  not the transformation logic I should build."
)
```

**Greenfield handling:** Before proceeding, check whether the Data Engineer's
response contains "NO DATA ENVIRONMENT DETECTED".

If it does:
1. Present the Data Engineer's response to the user.
2. Ask:
   "The Data Engineer found no existing staging models, source definitions, or
   dbt project files. For transformation work, I need to know what we're building on:
   - (a) Staged data exists — tell me the source system and whether it's already
     modeled in staging. I'll design the transformation layer from there.
   - (b) Raw data exists but no staging models yet — I'll need to flag that staging
     models are a prerequisite. I can design them alongside the transformation layer,
     but the Data Engineer should own the staging work.
   - (c) No data exists yet — I can do contract-first design: define expected staging
     models, intermediate shells, and mart stubs ready for when data arrives.
     Nothing will run until staging data exists.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided source info.
   - (b): note that staging is a prerequisite; scope includes staging design but
     implementation should be reviewed by Data Engineer.
   - (c): set Data sufficiency: `Insufficient`, proceed as contract-first design.
     All models will be flagged [THEORETICAL — UNTESTED].

### Document Deep Phase 2

```markdown
---

## Deep Phase 2: Source and Staging Assessment (Analytics Engineer)
- **Source system(s):**
  - <source>: <description, relevant tables or models>
- **Existing staging models:**
  - <stg_model> (<grain>): <brief description>
  - (or "none found")
- **Existing intermediate models relevant to this work:**
  - <int_model>: <what it contains>
  - (or "none")
- **Source definitions:** Present | Missing — <details>
- **Freshness configs:** Defined | Missing — <details>
- **Known data quality issues:**
  - <issue or "none identified">
- **Incremental patterns in use:** <pattern or "none — full refresh only">
- **Data Engineer consultation:** <summary of findings>
- **Data sufficiency:** Sufficient | Partial | Insufficient
- **Decision:** Proceed | Proceed with caveats | Blocked — <rationale>
- **Data environment:** <not greenfield | Staging exists, transform layer missing | GREENFIELD — no transformation layer detected. Contract-first design only>
```

::GATE:: id=analytics-engineer-deep-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::
**If Insufficient, do not proceed. Discuss alternatives.**

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/analytics_engineer/phases_deep/phase-3.md` in full and follow its instructions starting from Deep Phase 3. Do not pre-read further phase files.
