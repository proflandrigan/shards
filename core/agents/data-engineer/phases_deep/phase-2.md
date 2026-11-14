> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

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

After the Data Modeller responds (and any greenfield path is resolved), apply the Reviewer Verdict Protocol (see shared protocol — `data-modeller` row).

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

::GATE:: id=data-engineer-deep-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::
**If Insufficient, do not proceed. Discuss alternatives.**

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-3.md` in full and follow its instructions starting from Deep Phase 3.
