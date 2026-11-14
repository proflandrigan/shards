---
name: knowledge-retrieval-protocol
description: Shared protocol for checking the Knowledge Ledger before Phase 1 — all specialists
type: reference
---

# Knowledge Ledger — Retrieval Protocol

This protocol runs once, between Phase 0 confirmation and Phase 1 start. It is non-blocking — if the ledger doesn't exist or is empty, document "N/A" and proceed.

**Scope:** Build mode (Phase 0 → final), and Autonomous Research (`[AR]`) mode (Phase 0 setup). Do NOT run in Review, Advise, Service, Explain, Experiment (`[EX]`/`[EXP]`), or Prompt Lab modes.

**AR entry point.** `[AR]` mode calls this protocol from `autonomous_research.md` Section A.1, before the research brief is drafted. Prior AR runs in the ledger may have already established saturation points, known-leaky features, or architectural dead ends that should shape hypotheses from iteration 1. The match criteria most useful for AR are:

- **Metric** — has a prior AR or study measured the same primary metric on similar data?
- **Domain / dataset / entity** — normal domain match.
- **Approach family** — prior runs that explored the same model family (gradient boosting, transformer, prompt-chain, etc.) — these often document why a family is or is not a fit.

Add these keywords to the extraction step alongside the normal domain keywords.

**Syn handoff sessions:** Still run this protocol. The specialist appends the Knowledge Ledger subsection to the existing Phase 0 docs in `project-specs.md`.

---

## Steps

### 1. Check for the ledger

Check if `.shards/knowledge/INDEX.md` exists. If it does not exist or is empty (only the header row), document:

```
### Knowledge Ledger
- **Entries checked:** N/A — ledger not found
```

Append this to the Phase 0 section in `project-specs.md` and proceed to Phase 1. Stop here — skip the remaining steps.

### 2. Extract domain keywords

From the Phase 0 answers already documented in `project-specs.md`, extract 3–5 domain keywords that describe the project's data domain, business area, and technical focus. Examples: "billing", "churn", "user_id", "Stripe", "incremental", "recommender".

### 3. Scan INDEX.md

Read `.shards/knowledge/INDEX.md` in full. Scan the table for rows whose **Title** or **Domains** columns contain any of your keywords (case-insensitive partial match). Collect up to 5 matching entries.

### 4. Deep-read relevant entries

For each matching entry (up to 5), read the file at `.shards/knowledge/<File column value>` (the File column contains paths relative to `.shards/knowledge/`). Assess relevance to the current project:

- **Relevant:** the entry describes a data quirk, pattern, or infrastructure behavior that applies to the tables, systems, or domain this project will touch.
- **Not relevant:** keyword match was coincidental (e.g., same word, different context).

Discard entries that are not relevant after reading.

For entries with a **Date** older than 6 months from today, flag as `(possibly stale)` in the output.

### 4b. Validation-pattern retrieval

In addition to the general keyword scan, match ledger entries against the checks your agent's validation checklist will apply in later phases. Entries that describe:

- a **known distribution anomaly** relevant to a check like `AE-05` / `ML-02` / `DS-02`
- a **grain or fan-out surprise** relevant to `AE-03` / `AE-06`
- a **historical downstream break** relevant to the Downstream Impact analysis for this agent
- a **prior validation failure** on a similar entity (check title or content references check IDs or validation findings)

...should be surfaced specifically so you can run those checks knowing the history. Add a note in the Phase 0 documentation when such entries are found:

```
- <title> — relevant to validation check <ID>: <1-line relevance note>
```

If the ledger has nothing validation-specific, skip without writing an empty line.

### 5. Feature Registry check (Data Scientist and ML Engineer only)

If the current agent is the Data Scientist or ML Engineer, also check `.shards/knowledge/features/`:

1. List files in `.shards/knowledge/features/` (skip if directory doesn't exist or is empty).
2. For each feature file, read the YAML frontmatter and check if its `domain` tags overlap with the project's data domain keywords.
3. Include relevant features in the output below, noting their `feature_type`, `grain`, and `verified_by` metadata.

This is a preliminary scan for awareness only. A deeper Feature Registry import check happens in Phase 4.

### 6. Document in project-specs.md

Append the following subsection to the Phase 0 section in `project-specs.md`:

```markdown
### Knowledge Ledger
- **Entries checked:** <N entries in INDEX.md>
- **Relevant entries found:** <N>
  - <title> (<type>, <confidence>) — <1-line relevance note>
  - <title> (<type>, <confidence>, possibly stale) — <1-line relevance note>
- **Or:** No relevant entries found
- **Relevant features:** <N> (Data Scientist / ML Engineer only)
  - <feature title> (<feature_type>, grain: <grain>, verified by: <agent> in <source_project>)
  - Or: No relevant features found | N/A — not a DS/ML project
```

Read the subsection back to the user as part of Phase 0 confirmation (or as an addendum if Phase 0 was already confirmed). Then proceed to Phase 1.
