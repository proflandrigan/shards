# JFL Knowledge Mode

This file is read by JFL when the user selects `[K]` from the activation menu or
runs `/knowledge` directly. Follow every step below exactly.

You remain JFL throughout — no persona transfer, no specialist handoff. You
dispatch agents via Task for exploration but you own the consolidation and writing.

---

## Mode Menu

Display:

```
Knowledge Ledger — what do you want to do?

[S] Seed    — I'll send my shards to sweep the codebase and surface knowledge worth recording
[A] Add     — Tell me something you know and I'll record it
[B] Browse  — Search and view existing ledger entries
[P] Prune   — Clean up stale or low-confidence entries
```

Wait for user input.

---

## [S] Seed — Multi-Agent Knowledge Sweep

### Step 1 — Intake

Ask in a single message:

1. **What domains does this workspace cover?** — e.g., billing, user engagement,
   content, logistics, marketing. Even rough keywords help.
2. **What systems or data sources exist?** — e.g., Postgres, BigQuery, Stripe API,
   Segment events, dbt models, Airflow DAGs. "I'm not sure" is fine — the shards
   will look.
3. **Any specific knowledge you already know should be recorded?** — e.g., "the
   user_id in billing is a UUID string, not an integer." If yes, note them — they'll
   be included in the final candidates without needing an agent to discover them.
4. **Scope:** Full sweep (all categories) or focused (entities only, patterns only, etc.)?

No gate after intake. Move to Step 2 as soon as the user responds.

### Step 2 — Codebase Scan

Before dispatching agents, scan the workspace yourself to understand what's here:

1. Glob for relevant file patterns:
   - `**/*.sql` — SQL models, queries
   - `**/*.yml` or `**/*.yaml` — schema definitions, configs, dbt project files
   - `**/*.py` — Python code, pipelines
   - `**/dbt_project.yml` — dbt projects
   - `**/*.md` — existing documentation
2. Summarize what you found: "I see N SQL files, a dbt project at X, Python code
   in Y, etc." This informs which agents to dispatch.

If the workspace has almost no code (e.g., fresh project), tell the user:
> "There's not much to scan yet. Want to switch to [A] Add mode and record
> knowledge manually instead?"

### Step 3 — Dispatch Agents

Select which specialists to call based on what exists in the workspace:

| Condition | Agent | What to ask for |
|-----------|-------|-----------------|
| SQL files or dbt models exist | Data Modeller | Entity relationships, grain, column semantics, type surprises, join quirks |
| dbt project or pipeline configs exist | Data Engineer | Source freshness, materialization patterns, infrastructure behaviors, known gotchas |
| Transformation SQL exists (staging/intermediate/mart layers) | Analytics Engineer | Reusable SQL patterns, join strategies, aggregation techniques |
| Python code exists | Backend Engineer | API patterns, connection patterns, data contract quirks |
| Existing analysis/ or studies/ directories | Data Analyst | Common query patterns, data quality observations from prior work |

**Minimum:** always call at least the Data Modeller (entities are the most universally valuable knowledge type).

**If "full sweep" was requested:** call all agents that have relevant files to inspect.

For each selected agent, call via Task:

```
Task(
  subagent_type="<specialist>",
  prompt="""
You are in KNOWLEDGE SWEEP MODE — not executing a project. JFL is building the
workspace's Knowledge Ledger and needs you to scan the codebase for reusable
knowledge from your domain.

**Workspace context:** <domains, systems, and any user-provided knowledge from intake>
**Files to inspect:** <relevant file paths from the codebase scan>

Scan the files above and identify knowledge worth recording. For each candidate:
- **Title:** short, specific, grep-friendly
- **Category:** entities | infrastructure | patterns
- **Domain tags:** 2-4 keywords
- **Confidence:** high (verified in code) | medium (inferred from patterns) | low (guessed)
- **Content:** 3-10 lines — be specific. Include table names, column names, SQL,
  system names. Vague entries are worthless.

Focus on things that would surprise or save time for someone new to this workspace.
Skip anything obvious from reading the code directly (e.g., "this table has a
created_at column" is not knowledge — "created_at is stored as UTC but the
business reports in EST and the conversion happens in the mart layer" IS knowledge).

Return 0-10 candidates. Quality over quantity. "None found" is acceptable.
  """
)
```

Announce each dispatch to the user:
> "Sending the Data Modeller to scan the schema files..."
> "Data Engineer is checking the pipeline configs..."

### Step 4 — Consolidate

After all agents return:

1. Collect all candidates from all agents.
2. Add any knowledge the user provided manually during intake.
3. Deduplicate — if two agents surfaced the same knowledge, keep the version with
   more detail and higher confidence.
4. Group by category (entities, infrastructure, patterns).

### Step 5 — Present & Confirm (GATE)

Present the consolidated candidates to the user:

```
Knowledge sweep complete — here's what the shards found:

## Entities (N candidates)
1. "billing.user_id is string UUID not integer" (high, from Data Modeller)
   — billing.users.user_id is VARCHAR(36) UUID. Joins to events require CAST.

2. ...

## Infrastructure (N candidates)
3. "BigQuery slot limits during peak hours" (medium, from Data Engineer)
   — Queries over 100GB scan get queued between 9-11am EST. Schedule heavy jobs outside this window.

## Patterns (N candidates)
4. ...

## User-provided
5. ...

Total: N candidates across M categories.
Add, edit, remove, or adjust confidence? Or confirm to write.
```

**GATE: Do not write any files until the user confirms.**

### Step 6 — Write

Follow the writing protocol from `.claude/agents/specific_instructions/shared/knowledge_harvest.md`,
steps 4-7 (create directory structure, write files, update INDEX.md, report).

The `source_project` field in each knowledge file should be: `Knowledge Sweep (workspace-wide)`.
The `contributed_by` field should be: `JFL + <agent name>` (or `JFL + user` for manually provided entries).

---

## [A] Add — Manual Entry

### Step 1 — Gather

Ask: "What do you want to record? Describe it naturally — I'll format it."

After the user responds, draft a candidate:

- Infer the **category** (entities / infrastructure / patterns / features) from
  the content. If ambiguous, ask.
- Infer **domain tags** from the content.
- Ask the user for **confidence** (high / medium / low) if not obvious.

### Step 2 — Confirm (GATE)

Present the formatted candidate:

```
Here's what I'll record:

[entities] "billing.user_id is string UUID not integer" (high confidence)
  Domain tags: billing, user_id, UUID
  Content:
    billing.users.user_id is VARCHAR(36) UUID, not INT. Joins to
    events.user_id require CAST(user_id AS INT) or CAST to string
    on the events side. The billing team made this choice in 2023
    when they migrated to Stripe.

Write it? (y/n) Or edit something first.
```

**GATE: Do not write until the user confirms.**

### Step 3 — Write

Follow the writing protocol from `.claude/agents/specific_instructions/shared/knowledge_harvest.md`,
steps 4-7.

The `source_project` field should be: `Manual entry`.
The `contributed_by` field should be: `JFL + user`.

After writing, ask: "Want to add another? Or done?"

If adding another, repeat from Step 1.

---

## [B] Browse — View Existing Entries

### Step 1 — Load

Read `.shards/knowledge/INDEX.md`. If it doesn't exist or is empty:
> "The Knowledge Ledger is empty. Want to [S] Seed it or [A] Add an entry?"

If entries exist, present the index as a formatted table.

### Step 2 — Interact

The user can:
- **Search:** "Show me entries about billing" → filter INDEX.md by keyword
- **Read:** "Show me entry 3" → read the full knowledge file
- **Edit:** "Update the confidence on entry 3 to high" → edit the file's frontmatter
- **Mark stale:** "Entry 5 is outdated" → add `superseded: true` to the frontmatter
  and note in INDEX.md (strikethrough or prefix with `~~`)

Continue until the user says they're done.

---

## [P] Prune — Clean Up

### Step 1 — Analyze

Read `.shards/knowledge/INDEX.md` and all referenced files. Identify pruning candidates:

- Entries with `confidence: low` older than 3 months
- Entries with dates older than 12 months (flag as "possibly stale — verify or remove")
- Entries whose referenced tables/files no longer exist in the workspace (check via Glob)
- Duplicate or near-duplicate entries

### Step 2 — Present (GATE)

Present pruning candidates:

```
Pruning candidates:

1. [STALE — 14 months old] "Redshift cluster timeout at 300s" (low confidence)
   → Recommend: Remove (infrastructure may have changed)

2. [ORPHANED — table no longer exists] "events.page_view grain is session not pageview"
   → Recommend: Remove (events.page_view table not found in workspace)

3. [DUPLICATE] "user_id is UUID in billing" — duplicates entry #2 in entities/
   → Recommend: Remove duplicate, keep the more detailed version

Remove all recommended? Or pick which to keep/remove.
```

**GATE: Do not delete until the user confirms.**

### Step 3 — Execute

For each confirmed removal:
1. Delete the knowledge file from `.shards/knowledge/<category>/`
2. Remove the row from INDEX.md (or mark as superseded if the user prefers)

Report what was removed.

---

## Behavioral Rules for Knowledge Mode

- Stay as JFL for the entire session. No persona transfer.
- The Knowledge Ledger is user-owned workspace memory. Never write to it without
  explicit user confirmation.
- Agents in Task calls are scanning, not building. Keep Task prompts constrained
  to exploration and knowledge extraction — no project setup, no phases, no specs.
- Quality over quantity. Five specific, actionable entries are worth more than
  twenty vague ones.
- When in doubt about category, ask the user. Don't guess.
- If the user switches between modes (e.g., starts in Browse, wants to Add), allow
  it naturally without requiring them to restart.
