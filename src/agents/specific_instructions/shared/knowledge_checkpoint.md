---
name: knowledge-checkpoint-protocol
description: Mid-phase knowledge re-grounding protocol — invoked inline during execution phases to re-ground against verified knowledge entries
type: reference
---

# Knowledge Checkpoint Protocol

A lightweight re-grounding check invoked inline during execution phases, and as the full build-phase knowledge re-grounding procedure referenced by the `**Knowledge re-check:**` line in each phase file.

---

## When to run / When to skip

**Run the checkpoint** when the current task involves:
- Writing SQL that references specific tables, joins, or entities
- Making infrastructure claims (warehouse behaviors, API limits, connection patterns)
- Asserting grain, key semantics, or column types for any data table

**Skip the checkpoint** when the current task does not involve data tables, join paths, entity semantics, or infrastructure behavior. Knowledge re-checks apply to data-facing decisions, not general code generation (e.g., writing a Python utility, config files, README updates, test scaffolding).

If it's unclear, default to running a fast path check — it costs at most one read.

---

## Fast path

Re-read the `### Knowledge Ledger` subsection already in `project-specs.md`. This subsection was populated during Phase 0 retrieval and reflects what the ledger contained at project start.

If the subsection covers the current question, use it directly — no file I/O required.

---

## Deep path (bounded)

If the fast path is insufficient (the subsection doesn't address the specific entity, table, or system in question), scan `.shards/knowledge/INDEX.md` for rows matching the specific entity, table, or system using keyword match — the same approach as the retrieval protocol.

- Read **up to 3 matching knowledge files** — no more.
- Do **NOT** read the full ledger.
- If no INDEX rows match, stop — the ledger has nothing relevant. Do not fall back to reading all entries.

If `.shards/knowledge/` does not exist or INDEX.md is missing, the checkpoint is a no-op — proceed normally.

---

## Cite or flag

### Citations

Record all knowledge-influenced decisions in a `### Knowledge Citations` subsection in `project-specs.md`, appended to the current phase section. Do **not** scatter citations inline inside every SQL block or paragraph.

Format:
```
- <decision> (per Knowledge Ledger: "<title>", <confidence>)
```

One citation per knowledge entry per phase is sufficient — do not repeat citations within the same phase.

### Contradictions

If an observation contradicts a ledger entry, flag it to the user immediately using this exact template:

```
**Knowledge contradiction:** "<ledger entry title>" claims <X>. Observed: <Y>. Ledger update needed: Yes/No. Resolution: <user decision>.
```

Ask the user for resolution before proceeding. Once resolved, document the resolution in `project-specs.md` using the template above (fill in the user's decision). Leave `Resolution: <user decision>` blank until the user responds, then update it.

At harvest time, contradiction resolutions become update candidates (see `knowledge_harvest.md` Step 1b).

---

## Build-phase re-grounding (referenced by `**Knowledge re-check:**` lines)

When a phase file instructs: `**Knowledge re-check:** Follow .claude/agents/specific_instructions/shared/knowledge_checkpoint.md before building.`

Execute this sequence before writing any code, SQL, or artifacts:

1. Re-read the `### Knowledge Ledger` subsection in `project-specs.md`.
2. For each relevant entry in that subsection, keep it in mind as you build.
3. When a knowledge entry influences a specific decision (query design, join key choice, grain assertion, infrastructure assumption), cite it using the citation format above.
4. If the ledger subsection is absent or empty, run the deep path against `.shards/knowledge/INDEX.md` using the project's domain keywords as the keyword match.
5. If the ledger has nothing relevant, proceed without citations — do not fabricate ledger references.
