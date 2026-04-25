---
name: knowledge-harvest-protocol
description: Shared protocol for extracting reusable knowledge at project completion — all specialists
type: reference
---

# Knowledge Ledger — Harvest Protocol

This protocol runs once, after all reviews in the final phase are complete and before marking `Status: Complete`. It extracts reusable knowledge from the project and writes it to the workspace-wide Knowledge Ledger (`.shards/knowledge/`).

---

## Special case: Autonomous Research (`[AR]`) fan-out

When an AR session ran as a **fan-out** (multiple parallel branches converged by Syn Arbiter — see `autonomous_research.md` Section H):

- **Losing branches do NOT run this protocol independently.** Running harvest in each branch would flood the ledger with duplicate or conflicting candidates across branches exploring adjacent territory.
- **Only the parent specialist runs harvest**, after promotion (`diverge_protocol.md` Section G), as part of the consolidated Phase 3.
- Harvest candidates come from:
  1. The **winning branch's** artifacts (research_brief.md, results.json, iteration files).
  2. **Cross-branch patterns** that Syn Arbiter flagged in the leaderboard (e.g., "three of four branches hit the same data leakage issue"). These are worth harvesting even when no single branch would have flagged them, because they reveal structural properties of the data or methodology.

For **solo AR** sessions, run this protocol normally at Phase 3 per the agent's `research.md`. Candidate sources are the AR artifacts (brief, results.json, per-iteration files) and the final `research_summary.md` patterns section.

---

---

## Steps

### 1. Review the project

Read the full `project-specs.md` for this project. Identify candidates across four categories:

| Category | Directory | What to look for |
|----------|-----------|-----------------|
| **Entities** | `entities/` | Data table quirks, column semantics that surprised you, grain discoveries, type mismatches (e.g., "user_id is a string UUID in billing but an integer in events"), unexpected nullability |
| **Infrastructure** | `infrastructure/` | Warehouse behaviors, API rate limits, system quirks, connection patterns, freshness guarantees (or lack thereof) |
| **Patterns** | `patterns/` | Reusable SQL snippets, Python patterns, transformation techniques, join strategies that solved a non-obvious problem |
| **Features** | `features/` | Verified ML features with SQL, grain, and performance data — **Data Scientist and ML Engineer only** |

### 1b. Check for contradiction resolutions

Search `project-specs.md` for lines matching the structured template:

```
**Knowledge contradiction:** "<title>" claims ...
```

This template is written by the checkpoint protocol (`knowledge_checkpoint.md`) whenever an agent observes data that contradicts a ledger entry during execution.

For each contradiction found where "Ledger update needed: Yes":

- Identify the existing knowledge file path from INDEX.md (match by title)
- Draft an **update candidate** with:
  - **Action:** Update (not a new entry — overwrite the existing file)
  - **Existing entry:** `.shards/knowledge/<category>/<filename>.md`
  - **Change:** old claim → new claim (extracted from the contradiction template)
  - **New confidence:** re-assess based on observed data (usually downgrade or upgrade from original)

When multiple contradictions exist in a single project, group them in the harvest candidate list as a subsection:

```
Ledger updates from contradictions:
1. Update "<title>" — old claim: <X> → new claim: <Y> (confidence: <new>)
2. Update "<title>" — old claim: <X> → new claim: <Y> (confidence: <new>)
```

Present these alongside new candidates in Step 3 so the user can confirm or reject them as a batch.

**On confirm:** Overwrite the existing knowledge file — update the `date`, `confidence`, and content fields in place. Do **not** create a `_v2` file for contradiction resolutions. Update the INDEX.md row to reflect the new date and confidence.

If no contradiction lines are found in `project-specs.md`, skip this step.

### 1c. Check for validation findings worth harvesting

Read the `## Validation` section of `project-specs.md` (per `shared/validation_protocol.md`). Validation that caught a real issue is often the highest-signal source of harvest candidates — the check surfaced something that would have quietly been wrong otherwise.

Look for:

- **Checks with `Pass/Fail: ✗` that were fixed.** The issue that was caught is a candidate entity/infrastructure/pattern entry ("billing.revenue column contains negative values on refunds"; "incremental predicate on `updated_at` misses rows when source clock drifts").
- **Checks with surprising `Observed` values even when Pass/Fail = ✓.** Distribution shifts, null-rate anomalies, unexpected fan-out multipliers — the check passed but the value is worth remembering (e.g., "orders-to-items fan-out is 4.8x on this warehouse, not the industry-typical 2-3x — use for capacity planning").
- **`n/a` with an instructive justification.** When a check is genuinely inapplicable for a non-obvious reason, that reason is a pattern (e.g., "DL-09 inference parity is n/a for this service because training and serving share the same feature module — note the pattern, not the skip").
- **Downstream impact discoveries.** Consumers that were affected in non-obvious ways. These are often infrastructure or feature-level knowledge.

These candidates blend in with the Step 1 / Step 2 draft list — tag them clearly so the user sees that they came from the validation section:

```
4. [patterns] "orders-items fan-out is 4.8x in this warehouse" (high confidence, from Validation AE-06)
   — Verified across two quarters of data. Use for capacity planning and query tier assessment.
```

If the `## Validation` section is absent or contains nothing worth harvesting, skip this step.

### 2. Draft candidates

For each candidate, draft:

- **Title:** short, specific, grep-friendly (e.g., "billing.user_id is string UUID not integer")
- **Category:** entities | infrastructure | patterns | features
- **Domain tags:** 2–4 keywords for INDEX.md matching
- **Confidence:** high (verified in production data) | medium (observed in this project) | low (inferred, not directly tested)
- **Content:** 3–10 lines explaining the knowledge. Be specific — include table names, column names, SQL snippets, system names. Vague entries are worthless.

For **feature** candidates (Data Scientist / ML Engineer only), also draft:
- **SQL snippet:** the feature computation
- **Feature type:** numeric | categorical | boolean | temporal | embedding
- **Grain:** one row per what
- **Verified by:** which agent, in which project, with what metric impact

**Minimum:** explicit assessment — 1+ candidates or "None — trivial project". For Quick tracks, default to "None" unless something genuinely surprising was discovered during the fix.

### 3. Present to user (GATE)

Present all candidates to the user in a numbered list:

```
Knowledge harvest — candidates for the Knowledge Ledger:

1. [entities] "billing.user_id is string UUID not integer" (high confidence)
   — billing.users.user_id is VARCHAR(36) UUID, not INT. Joins to events.user_id require CAST.

2. [patterns] "incremental merge for slowly changing dims in BigQuery" (medium confidence)
   — MERGE pattern that handles late-arriving updates without full refresh. SQL included.

3. [features] "days_since_last_login" (high confidence, grain: user-day)
   — Verified: +3.2% AUC in churn model. SQL: DATEDIFF(CURRENT_DATE, last_login_at).

Add, edit, or remove? Or confirm to write.
```

::GATE:: id=specific-instructions-shared-knowledge-harvest-phase0 phase=0 kind=phase
Do not write any files until the user confirms.
::ENDGATE:: The user may edit titles, remove candidates, adjust confidence, or add new ones.

### 4. Create directory structure

If `.shards/knowledge/` does not exist, create it with subdirectories:

```
.shards/knowledge/
  INDEX.md          (copy from templates/knowledge-index.md if missing)
  entities/
  infrastructure/
  patterns/
  features/
```

### 5. Write knowledge files

For each confirmed candidate, write a markdown file:

**File path:** `.shards/knowledge/<category>/<slugified-title>.md`

Slugify: lowercase, replace spaces with hyphens, remove special characters, max 60 characters.

**Conflict handling:** if a file with that name already exists, append `_v2` (or `_v3`, etc.) to the filename and note the prior entry in the content.

**File format:**

```markdown
---
title: <title>
domain: [<keyword1>, <keyword2>, <keyword3>]
source_project: <project directory path>
contributed_by: <agent name>
date: <YYYY-MM-DD>
type: <entities | infrastructure | patterns | features>
confidence: <high | medium | low>
---

<content — 3-10 lines, specific, with table/column/system names>
```

**Extended frontmatter for features:**

```markdown
---
title: <title>
domain: [<keyword1>, <keyword2>, <keyword3>]
source_project: <project directory path>
contributed_by: <agent name>
date: <YYYY-MM-DD>
type: features
confidence: <high | medium | low>
sql_snippet: |
  <the SQL that computes this feature>
feature_type: <numeric | categorical | boolean | temporal | embedding>
grain: <one row per what>
verified_by: <agent name> in <source_project> — <metric>: <impact>
---

<content — what this feature captures, when to use it, caveats>
```

### 6. Update INDEX.md

Append one row per entry to the table in `.shards/knowledge/INDEX.md`:

```
| <YYYY-MM-DD> | <type> | <title> | <domain keywords> | <confidence> | <category>/<filename>.md |
```

**Size warning:** if INDEX.md exceeds 200 entries after appending, warn the user:

> "INDEX.md now has <N> entries. Consider pruning stale or low-confidence entries to keep retrieval fast."

### 7. Report

Tell the user what was written:

```
Knowledge harvested:
- <title> → .shards/knowledge/<type>/<filename>.md
- <title> → .shards/knowledge/<type>/<filename>.md

INDEX.md updated (<N> total entries).
```
