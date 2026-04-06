# Knowledge Ledger — Implementation Plan

## Context

Shards agents currently lose all tribal knowledge when a project closes. If the Data Modeller discovers that `user_id` in billing is a string UUID while `user_id` in events is an integer, that insight dies with the project folder. This update adds a persistent workspace-wide Knowledge Ledger (`.shards/knowledge/`) that agents automatically consult before starting work and contribute to when projects complete. It also includes a Feature Registry so verified ML features can be reused across studies.

Inspired by OpenWolf's `cerebrum.md` pattern (metadata-first, stratified memory, do-not-repeat lists) but adapted to Shards' phased gate architecture.

---

## New Files (3)

### 1. `src/agents/specific_instructions/shared/knowledge_retrieval.md`
Shared protocol (like `behavioral_rules.md`) teaching agents to check the ledger before Phase 1.

**Key behaviors:**
- Check if `.shards/knowledge/INDEX.md` exists; skip silently if not
- Extract 3-5 domain keywords from Phase 0 answers
- Scan INDEX.md (one-line-per-entry) for keyword matches
- Deep-read up to 5 relevant entries
- Append `### Knowledge Ledger` subsection to Phase 0 docs in project-specs.md
- Flag entries older than 6 months as "(possibly stale)"
- **Data Scientist/ML Engineer special case:** also scan `features/` for verified ML features with overlapping domain tags
- **Non-blocking:** if ledger doesn't exist or is empty, document "N/A" and proceed
- **Scope:** only in Build mode (Phase 0 → final). Not in Review/Advise/Service/Experiment modes
- **JFL handoff:** still runs — specialist appends Knowledge Ledger subsection to existing Phase 0 docs

### 2. `src/agents/specific_instructions/shared/knowledge_harvest.md`
Shared protocol teaching agents to extract reusable knowledge at project completion.

**Key behaviors:**
- Triggers after JFL final review approved, before `Status: Complete`
- Agent reviews project-specs.md and identifies candidates across 4 categories:
  - `entities/` — data table quirks, column semantics, grain surprises
  - `infrastructure/` — warehouse/API/system behaviors
  - `patterns/` — reusable SQL/Python snippets
  - `features/` — verified ML features (Data Scientist + ML Engineer only)
- Minimum 1 candidate (or explicit "None — trivial project" documentation)
- **User confirmation gate** — present candidates, user can edit/remove/add
- Create `.shards/knowledge/` directory structure if it doesn't exist
- Write markdown files with YAML frontmatter: `title`, `domain`, `source_project`, `contributed_by`, `date`, `type`, `confidence`
- Feature entries get extended frontmatter: `sql_snippet`, `feature_type`, `grain`, `verified_by`
- Update INDEX.md (append one row per entry to the table)
- File naming: `<slugified-title>.md` in the appropriate subdirectory
- **Conflict handling:** if matching title exists, create with `_v2` suffix, note prior entry
- **INDEX.md size warning:** if >200 entries, warn user to prune

### 3. `src/templates/knowledge-index.md`
Template for INDEX.md, copied to `.shards/knowledge/INDEX.md` by installer.

```markdown
# Knowledge Ledger — Index

> Agents scan this file for relevant prior knowledge before starting work.
> Do not delete entries — mark as superseded if outdated.

| Date | Type | Title | Domains | Confidence | File |
|------|------|-------|---------|------------|------|
```

---

## Modified Files

### Installer: `tools/install.js`

**Between step 5 (UI copy) and step 7 (output dirs), add step 6:**
- Create `.shards/knowledge/` with subdirs: `entities/`, `infrastructure/`, `patterns/`, `features/`
- Copy `knowledge-index.md` template to `.shards/knowledge/INDEX.md`
- Idempotent: skip if directory already exists
- **Do NOT add knowledge files to manifest** (excluded from uninstall tracking)

**In `uninstall()` function:**
- Add explicit message: `.shards/knowledge/ preserved (persistent workspace memory)`

**In `claudeBlock` string (CLAUDE.md append):**
- Add Knowledge Ledger section describing the directory structure and auto-retrieval/harvest behavior

---

### Agent Root Files — Behavioral Rules Section (12 files)

Add one line after the existing `behavioral_rules.md` reference in each file's `# Behavioral Rules` section:

```markdown
- **Check the Knowledge Ledger.** Before beginning Phase 1, check for relevant prior knowledge. Read `.claude/agents/specific_instructions/shared/knowledge_retrieval.md` for the protocol.
```

**Files:**
- `src/agents/data-scientist.md` (line ~291)
- `src/agents/data-analyst.md` (line ~323)
- `src/agents/ml-engineer.md` (line ~360)
- `src/agents/ai-engineer.md` (line ~334)
- `src/agents/data-engineer.md` (line ~241)
- `src/agents/data-modeller.md` (line ~347+)
- `src/agents/analytics-engineer.md` (line ~342)
- `src/agents/bi-engineer.md` (line ~325)
- `src/agents/mlops-engineer.md` (line ~328)
- `src/agents/applied-ml-scientist.md` (line ~389)
- `src/agents/deep-learning-engineer.md` (line ~353)
- `src/agents/backend-engineer.md` (line ~221+)

**NOT modified:** `researcher.md`, `academic.md` (service-only, no project lifecycle)

---

### Agent Root Files — Phase 0 Documentation Template (12 files)

Add `### Knowledge Ledger` subsection to each agent's Phase 0 spec template (the markdown block they write to project-specs.md):

```markdown
### Knowledge Ledger
- **Entries checked:** <N> | N/A — ledger not found
- **Relevant entries found:** <N>
  - <title> (<type>, <confidence>) — <1-line relevance>
- **Or:** No relevant entries found
```

Same 12 files as above. Each has a Phase 0 documentation template — the subsection goes inside it, after existing fields and before the GATE instruction.

---

### Final Phase Files — Knowledge Harvest Step (12+ phase files)

Insert harvest instruction before the final `### Document Phase N` block and add `Knowledge harvested` to the final documentation template.

**Instruction to insert:**
```markdown
**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.
```

**Documentation line to add:**
```markdown
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
```

**Files:**
- `specific_instructions/data_scientist/phases.md` — Phase 7
- `specific_instructions/data_analyst/phases.md` — final phase
- `specific_instructions/ml_engineer/phases.md` — final phase
- `specific_instructions/ai_engineer/phases.md` — final phase
- `specific_instructions/data_engineer/phases.md` — final phase (both tracks)
- `specific_instructions/data_modeller/phases.md` — Deep Phase 7
- `specific_instructions/analytics_engineer/deep_phases.md` — final phase
- `specific_instructions/analytics_engineer/quick_phases.md` — final phase
- `specific_instructions/bi_engineer/phases.md` — final phase
- `specific_instructions/mlops_engineer/phases.md` — final phase
- `specific_instructions/applied_ml_scientist/phases.md` — final phase
- `specific_instructions/deep_learning_engineer/phases.md` — final phase

---

### Data Scientist Phase 4 — Feature Registry Check

**File:** `specific_instructions/data_scientist/phases.md`, Phase 4 (Modeling Approach)

**Insert after feature candidate discussion, before ML Engineer consultation:**

```markdown
**Feature Registry check.** If `.shards/knowledge/features/` exists, scan for features
whose domain tags overlap with this project's data domain (from Phase 2). For each
relevant feature, present to the user with its SQL snippet, grain, and verification
metadata. Ask: "Would you like to import any of these into your feature candidates?"

If imported, note in feature candidates list: `(imported from Knowledge Ledger —
verified by <agent> in <source_project>)`
```

**Add to Phase 4 documentation template:**
```markdown
- **Feature Registry check:** <N> relevant features found | No features found
  - Imported: <title(s)> | None
```

**Also apply to:** `specific_instructions/ml_engineer/phases.md` Phase 4 equivalent (if it has a feature selection phase).

---

## Implementation Order

1. `src/templates/knowledge-index.md` — new template
2. `src/agents/specific_instructions/shared/knowledge_retrieval.md` — new shared protocol
3. `src/agents/specific_instructions/shared/knowledge_harvest.md` — new shared protocol
4. `tools/install.js` — knowledge directory creation + uninstall preservation
5. 12 agent root files — add behavioral rule reference + Phase 0 template addition
6. 12+ phase files — add harvest step to final phases
7. `data_scientist/phases.md` Phase 4 — Feature Registry integration
8. `ml_engineer/phases.md` — Feature Registry integration (if applicable)
9. Re-run `node tools/install.js` to update live installation

---

## Verification

1. **Installer:** Run `node tools/install.js` — confirm `.shards/knowledge/` created with all subdirs + INDEX.md
2. **Installer idempotency:** Run again — confirm "already exists (preserved)" message
3. **Uninstaller:** Run `node tools/install.js uninstall` — confirm knowledge directory NOT deleted
4. **Retrieval protocol:** Start a `/data-scientist` session — confirm Phase 0 includes Knowledge Ledger section (shows "N/A — ledger not found" on first run)
5. **Harvest protocol:** Complete a project through final phase — confirm harvest step triggers, user is prompted, entries written to `.shards/knowledge/`
6. **Retrieval with data:** Start a new session after harvest — confirm relevant entries surface in Phase 0
7. **Feature Registry:** Start a Data Scientist modeling project after a prior study contributed features — confirm Phase 4 surfaces them
8. **Spot-check:** Verify all 12 agent root files have the behavioral rule reference; verify all 12+ phase files have the harvest step
