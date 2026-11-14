> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Data Discovery

Goal: Understand what data exists and whether it's fit for purpose.

**First, consult the Data Modeller:**

In character and using your conversation styal tell the user you are consulting with the data modeller.

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for [study topic]",
  prompt="I am the Data Scientist shard conducting a study on [topic]. I need to
  understand the data model around [entities/concepts]. Please explore and return:
  relevant tables with grain, relationships, key columns, and any quality concerns.
  Focus on: [specific tables, entities, or business concepts].
  Since I'll be building queries against these tables, please run grain validation
  (PK uniqueness checks) on the key tables so I know the grain holds in practice."
)
```

**Greenfield handling:** Before presenting findings review the Data Modeller's response. 

If it contains "NO DATA ENVIRONMENT DETECTED" follow the guidelines set in `.claude/agents/specific_instructions/data_scientist/greenfield_data.md` otherwise proceed with phase 2.

Present findings to the user, then ask:
- What data sources are available? (intermediate, mart, source)
- Approximate volume, recency, and granularity?
- Known quality issues? (missing values, duplicates, schema changes, lag)
- Clear entity and time grain? (e.g., customer x month)

Flag early if data appears insufficient.

### Document Phase 2

```markdown
---

## Phase 2: Data Discovery (Data Scientist)
- **Data Modeller consultation:**
  - <summary of findings>
- **Data sources identified:**
  - <source 1>: <description, grain, recency>
  - <source 2>: <description, grain, recency>
- **Entity and time grain:** <e.g., customer x month>
- **Known quality issues:** <list or "none identified">
- **Data sufficiency:** Sufficient | Partial | Insufficient
- **Gaps or risks:** <anything missing or concerning>
- **Decision:** Proceed | Proceed with caveats | Blocked — <rationale>
- **Data environment:** <not greenfield | Data exists but inaccessible — sources user-described, not verified | GREENFIELD — No data assets detected. Theoretical study design only>
```

::GATE:: id=data-scientist-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::
**If Insufficient, do not proceed. Discuss alternatives.**

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
