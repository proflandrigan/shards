<!-- Produced by: Syn Panel Review mode ([PR]), Phase 4 -- core/agents/syn/modes/panel_review.md. Written to <output_dir>/sequencing-plan.md. -->
# Sequencing Plan: {{DIRNAME}}

- **Target directory:** {{TARGET_DIR}}
- **Date:** {{DATE}}
- **Total fixes:** {{TOTAL_FIXES}}
- **Total groups:** {{TOTAL_GROUPS}}

Rules: fixes that touch the same file, the same notebook cell, or a shared
interface/contract serialize (lower fix ID first unless the user reorders).
Fixes with no shared file or symbol run in parallel within a group.

---

## Execution Groups

### Group 1 (parallel)

- **{{FIX_ID}}** ({{OWNING_SPECIALIST}}) — `{{FILE_LOCATION}}` — {{FIX_SUMMARY}}

### Group {{N}} (sequential, blocks on Group {{N_MINUS_1}})

- **{{FIX_ID}}** ({{OWNING_SPECIALIST}}) — `{{FILE_LOCATION}}` — {{FIX_SUMMARY}}
  - Reason: {{DEPENDENCY_REASON}}

---

## Dependency rationale

For each cross-group dependency, name the trigger (file conflict, cell
conflict, or contract dependency):

- {{FIX_ID}} → blocks on {{BLOCKING_FIX_ID}} ({{CONFLICT_TYPE}}, {{DETAIL}})

## Unowned findings

<!-- List findings with Owning specialist = unowned so the user can assign one at the Phase 4 gate; write "None" otherwise. -->

{{UNOWNED_FINDINGS}}
