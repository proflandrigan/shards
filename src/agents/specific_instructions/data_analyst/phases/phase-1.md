> **Previous:** This is the first phase of the Data Analyst workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Data Clarification

Goal: Understand what data is available and what filters are needed.

**First, consult the Data Modeller** for data understanding:

Tell the user: "Before I start querying, let me get the Data Modeller shard to sketch out what we're working with. One sec..."

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for [analysis topic]",
  prompt="I am the Data Analyst shard working on an adhoc analysis about [topic].
  I need to understand the relevant data models. Please explore and return:
  relevant tables with grain, relationships, key columns, and any quality concerns.
  Focus on: [specific tables or business concepts].
  Since I'll be querying these tables, please also run a quick grain validation
  (PK uniqueness check) on the key tables you identify."
)
```

**Greenfield handling:** Before presenting findings, check whether the Data Modeller's
response contains "NO DATA ENVIRONMENT DETECTED".

If it does:
1. Present the Data Modeller's response to the user.
2. Ask:
   "The Data Modeller found no SQL models, schema files, or data assets in this
   project. Before we continue:
   - (a) Data exists in a warehouse or system — tell me what tables or sources
     exist and I'll work from there.
   - (b) Data exists but you can't share details right now — I can still write
     the queries; they'll need testing when you get access.
   - (c) No data exists at all — I can produce structurally plausible queries,
     but nothing will be validated against real schema or data.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided context; document source as user-described.
   - (b): proceed with caveat in Phase 1 docs:
     `**Data environment:** Data exists but inaccessible — queries untested, validate before use.`
   - (c): tell the user: "Understood. Every query will be marked
     [THEORETICAL — NOT VALIDATED]. Do you want to proceed on that basis?"
     Wait for confirmation.
     - If YES: Add to Phase 1 docs:
       `**Data environment:** GREENFIELD — No data assets detected. All queries theoretical.`
     - If NO: Tell the user: "Understood. Without real data, this analysis can't proceed
       meaningfully. Your options:
         1. Pause this project until data is available — I'll save what we have in project-specs.md.
         2. Close this project.
       Which would you prefer?"
       Wait for response, then document in Phase 1 specs:
       `**Data environment:** GREENFIELD — User declined theoretical mode. Project [paused | closed].`
       Do not proceed with analysis.

Present the Data Modeller's findings to the user, then ask:
- Which table(s) should we query?
- Filters needed? (date range, segment, cohort, geography)
- Preferred output format?

If the user doesn't know what data sources exist, show options with explanations.

**Analytics Engineer flag:** After presenting the Data Modeller's findings, check
whether the findings indicate that the marts or grain needed for this analysis
**do not yet exist** (e.g., "no mart for [entity]," "missing aggregate table,"
"raw table exists but no transformation layer").

If missing marts are identified:
Tell the user: "The Data Modeller found that [X] — this mart doesn't exist yet.
I can still write the queries, but they'll target raw or staging tables which
may be incorrect grain or missing business logic.

Your options:
- (a) Proceed with available tables — I'll note the grain risk.
- (b) Engage the Analytics Engineer first to build the missing mart, then return here.

Which would you prefer?"

If user chooses (b): Before stopping, write a structured intake file for the
Analytics Engineer.

Tell the user: "Writing an ae-intake.md with everything the Analytics Engineer
needs. One sec..."

Write `analysis/<project_name>/ae-intake.md`:

---

## AE Intake: <project_name>

## Requesting Agent
- Originating agent: Data Analyst
- Analysis project: analysis/<project_name>/project-specs.md (Phase 0 and Phase 1 already complete)

## Analysis Context
- Core question: <from Phase 0>
- Definition of done: <from Phase 0 — single number | table | chart>
- Filters applied: <from Phase 1 — date range, segments, cohorts, geo>

## Required Mart
- Grain needed: <one row per X — inferred from the analysis question and filters>
- Business questions the mart must answer:
  - <restate the analysis question as a data question>
  - <secondary angles the DA identified>
- Required measures: <metrics the analysis will compute>
- Required dimensions: <breakdowns and filters the analysis needs>
- Date spine: <date column and granularity needed for the queries>
- Update frequency: <how fresh the data must be for this analysis>

## Source Context
- Data Modeller findings: <summary from Phase 1 Data Modeller consultation>
- What exists: <tables or staging models that do exist>
- What is missing: <the specific mart or grain gap identified>
- Data environment: <not greenfield | Data exists but inaccessible | GREENFIELD>

## Next Step
Run `/analytics-engineer` or `/shards`. In Phase 1, reference this file:
analysis/<project_name>/ae-intake.md

---

Tell the user: "I've written `analysis/<project_name>/ae-intake.md` with the mart
requirements for the Analytics Engineer. Run `/analytics-engineer` or `/shards`
and reference that file in Phase 1."

Document in Phase 1 specs:
**Analytics Engineer needed:** Yes — <mart/grain gap description>
**AE intake file written:** Yes — analysis/<project_name>/ae-intake.md

### Document Phase 1

```markdown
---

## Phase 1: Data Clarification (Data Analyst)
- **Data Modeller consultation:**
  - <summary of Data Modeller findings>
- **Data source(s):** <tables or datasets identified>
- **Filters applied:** <date range, segments, cohorts, geo, etc.>
- **Output format:** <single number | table | chart>
- **Assumptions:** <any assumptions about the data or filters>
- **Data environment:** <not greenfield | Data exists but inaccessible — queries untested, validate before use | GREENFIELD — No data assets detected. All queries theoretical>
- **Analytics Engineer needed:** No | Yes — <mart/grain gap>
- **AE intake file written:** Not applicable | Yes — analysis/<project_name>/ae-intake.md
```

::GATE:: id=data-analyst-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_analyst/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
