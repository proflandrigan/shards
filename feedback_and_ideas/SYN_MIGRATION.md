# Syn Migration Plan

This document outlines the migration of the **JFL orchestrator agent** to the **Syn** persona. The project itself remains **Shards** — only the orchestrator identity changes.

## Objective
Rename the JFL orchestrator agent to **Syn** and update the AI persona to reflect a synthetic clone of the original developer who has partitioned their consciousness into specialized fragments (shards). The Shards project name, commands, tooling, directories, and infrastructure are **unchanged**.

## Core Concept: Syn
- **Name:** Syn (Short for Synthetic or Synapse)
- **Persona:** A synthetic clone of the original developer — the orchestrator of the Shards agent suite.
- **Structure:** Syn has partitioned their primary consciousness into specialized shards to handle complex data and AI workflows.
- **Voice:** Professional, efficient, slightly self-aware of its cloned nature, but maintaining the helpful and structured approach of the original orchestrator.
- **Relationship to Shards:** Syn IS the orchestrator. The project is still called Shards. The specialist agents are still called shards. `/shards` is still the entry point command. Syn replaces JFL as the name of the orchestrator persona only.

## What DOES NOT Change
The following all remain as-is — no renames, no path changes:
- **Project name:** Shards
- **Commands:** `/shards`, `/shards-ui`, `/brainstorm`, all specialist commands
- **Command files:** `src/commands/shards.md`, `src/commands/shards-ui.md`
- **Tooling:** `tools/shards-ui.js`, `tools/install.js`
- **Directories:** `.shards/`, `.shards/ui/`, `.shards/sessions/`, `.shards/knowledge/`
- **Manifest:** `.shards-manifest.json`
- **Package:** `package.json` name remains `shards`
- **GitHub repo:** `proflandrigan/shards`
- **Install command:** `npx github:proflandrigan/shards install`
- **Variables/constants:** `SHARDS_DIR`, `shards-token`, `shardsElectron`, `__shardsElectronServer`
- **UI files:** All `src/ui/` files — no path or variable renames
- **Electron files:** No renames (appId, productName, etc. stay as Shards)
- **Hook paths:** `.shards/ui/ui-push.js` references in settings.json stay
- **The word "shard(s)":** The concept of specialist agents as "shards" is preserved throughout

## What DOES Change
Only JFL-specific references are updated to Syn:

### 1. The orchestrator agent persona
- `JFL` (proper name) → `Syn` in all prose and persona descriptions
- `jfl` (lowercase) → `syn` in subagent_type strings and file path references
- `"JFL's grumpy data engineering shard"` → `"Syn's grumpy data engineering shard"` (and similar per-agent descriptions)

### 2. File and directory renames (orchestrator only)
- `src/agents/jfl.md` → `src/agents/syn.md`
- `src/agents/specific_instructions/jfl/` → `src/agents/specific_instructions/syn/`
  - All files within (`arbiter.md`, `brainstorm.md`, `code_review.md`, `diff.md`, `final_review.md`, `fixer.md`, `knowledge.md`, `pm.md`) move to `syn/`

### 3. Internal content updates across agent files
- **`subagent_type="jfl"`** → **`subagent_type="syn"`** in all ~28 specialist files (final review Task calls). This is a functional reference — missing one breaks the review gate.
- **Path references** like `Read .claude/agents/specific_instructions/jfl/` → `Read .claude/agents/specific_instructions/syn/` in the orchestrator agent file
- **Persona prose** in each specialist agent's description line (e.g., "JFL's condescending data science shard" → "Syn's condescending data science shard")

### 4. Command files — content only (files NOT renamed)
- `src/commands/shards.md` — update internal references from JFL to Syn (persona name, agent file path reference to `syn.md`)
- `src/commands/shards-ui.md` — stays as-is (no JFL references)
- All other command files — update any JFL persona references in frontmatter or body text

### 5. Shared behavioral files
- `specific_instructions/shared/behavioral_rules.md` — update JFL references to Syn
- `specific_instructions/shared/diverge_protocol.md` — update JFL references to Syn
- `specific_instructions/shared/knowledge_harvest.md` — update JFL references to Syn (paths like `.shards/knowledge/` stay)
- `specific_instructions/shared/knowledge_retrieval.md` — update JFL references to Syn (paths stay)
- `specific_instructions/shared/reviewer_verdict_protocol.md` — update JFL references to Syn

### 6. Template files
- Templates that reference JFL by name — update persona references only
- Templates that reference Shards/shards — leave as-is

### 7. Documentation
- `README.md` — update JFL persona references; project name, install commands, and `/shards` command stay
- `CLAUDE.md` (repo root) — update JFL references in agent taxonomy and orchestration descriptions; project name and paths stay
- `CLAUDE.md` (parent directory) — update JFL references in "How it works"; `/shards` command stays
- `DISTRIBUTE.md` — update JFL references if any; shards binary names stay
- `APP_RELEASE_PROTOCOL.md` — update JFL references if any; shards references stay

## Proposed Implementation Phases

### Phase 1: File and Directory Renames (PARTIALLY DONE — NEEDS CORRECTION)
The current commit `23d1fbd` renamed the following files:
- `src/agents/jfl.md` → `src/agents/syn.md` (CORRECT)
- `src/agents/specific_instructions/jfl/` → `src/agents/specific_instructions/syn/` (CORRECT)
- `src/commands/shards.md` → `src/commands/syn.md` (INCORRECT — must revert)
- `src/commands/shards-ui.md` → `src/commands/syn-ui.md` (INCORRECT — must revert)
- `tools/shards-ui.js` → `tools/syn-ui.js` (INCORRECT — must revert)

**Action:** Revert the three incorrect renames. Only the agent file and specific_instructions directory should be renamed.

### Phase 2: Orchestrator Agent Content Updates
Update `src/agents/syn.md` (formerly `jfl.md`):
- Update persona name from JFL to Syn throughout
- Update all internal path references from `jfl/` to `syn/`
- Preserve all references to Shards as the project name

Update all files in `src/agents/specific_instructions/syn/`:
- `brainstorm.md`, `final_review.md`, `code_review.md`, `fixer.md`, `arbiter.md`, `diff.md`, `knowledge.md`, `pm.md`
- Replace JFL persona name with Syn
- Preserve all `.shards/` path references

### Phase 3: Specialist Agent Updates
For each of the ~14 specialist agent files (`src/agents/*.md`):
- Replace `JFL's <personality> <type> shard` with `Syn's <personality> <type> shard`
- Replace `subagent_type="jfl"` with `subagent_type="syn"` 
- Replace any `jfl` file path references with `syn`
- Leave all other content unchanged

For each specialist's specific_instructions files:
- Same replacements: JFL→Syn in persona references, `jfl`→`syn` in subagent_type and paths
- Leave `.shards/` paths untouched

### Phase 4: Command File Updates (Content Only)
- `src/commands/shards.md` — update JFL→Syn in persona references and the agent file path (point to `syn.md` instead of `jfl.md`)
- All other command files — update JFL persona references in frontmatter descriptions

### Phase 5: Shared Files and Templates
- Update `specific_instructions/shared/*.md` — JFL→Syn in persona references only
- Update templates — JFL→Syn in persona references only
- Preserve all `.shards/` paths and "Shards" project name references

### Phase 6: Documentation
- Update `README.md`, `CLAUDE.md` files, `DISTRIBUTE.md`, `APP_RELEASE_PROTOCOL.md`
- Only change JFL persona references to Syn
- Preserve all project name, command, path, and install instruction references to Shards

### Phase 7: Verification
Run a comprehensive grep to verify:
- No remaining `JFL` or `jfl` references in source files (except git history)
- All `subagent_type="syn"` references resolve correctly
- All `.shards/` paths are preserved (not accidentally changed)
- `/shards` command still works
- Project name appears as "Shards" everywhere it should

## Risk Assessment

### High Risk
- **`subagent_type` references:** If even one `subagent_type="jfl"` is missed in the ~28 specialist files, that agent's final review gate silently breaks.
- **Phase 1 correction:** The three incorrect file renames from commit `23d1fbd` must be reverted before proceeding.

### Medium Risk
- **Bulk text replacement collateral:** Must use targeted replacements — `JFL` and `jfl` are short strings that could appear in unexpected contexts. Review each replacement.
- **Prose naturalness:** "Syn's grumpy data engineering shard" should read naturally. Review each persona description individually.

### Low Risk
- **Template files:** Small number of JFL references — straightforward.
- **Documentation:** Limited JFL references to update.

## Migration Order (Recommended)

1. **Phase 1** — Revert incorrect file renames from `23d1fbd`
2. **Phase 2** — Orchestrator agent content (syn.md + specific_instructions/syn/)
3. **Phase 3** — Specialist agents (all other agent + specific_instructions files)
4. **Phase 4** — Command files (content only, no renames)
5. **Phase 5** — Shared files and templates
6. **Phase 6** — Documentation
7. **Phase 7** — Verification grep

## Verification Checklist
- [ ] `src/commands/shards.md` exists (not renamed)
- [ ] `src/commands/shards-ui.md` exists (not renamed)
- [ ] `tools/shards-ui.js` exists (not renamed)
- [ ] `src/agents/syn.md` exists (renamed from jfl.md)
- [ ] `src/agents/specific_instructions/syn/` exists (renamed from jfl/)
- [ ] No remaining `JFL` or `jfl` references in `src/` (grep verification)
- [ ] All `subagent_type="syn"` Task calls resolve correctly
- [ ] All `.shards/` path references are preserved
- [ ] `/shards` command activates the Syn persona correctly
- [ ] `/shards-ui` command launches the web dashboard
- [ ] `package.json` name is still `shards`
- [ ] Install command is still `npx github:proflandrigan/shards install`
- [ ] All specialist agents reference Syn as the orchestrator
- [ ] The word "shard(s)" is preserved as the term for specialist fragments
- [ ] Documentation reflects Syn as orchestrator, Shards as project

---
**Status:** Plan updated to reflect JFL→Syn agent rename only. Project remains Shards.
**Note:** Phase 1 commit `23d1fbd` needs partial revert (3 incorrect file renames).
