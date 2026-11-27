<!-- Produced by: Syn Panel Review mode ([PR]), Phase 4 -- core/agents/syn/modes/panel_review.md. Written to <output_dir>/sequencing-plan.md. -->
# Sequencing Plan: {{DIRNAME}}

- **Target directory:** {{TARGET_DIR}}
- **Date:** {{DATE}}
- **Total fixes:** {{TOTAL_FIXES}} (in {{FIX_ITEM_COUNT}} fix items)
- **Total groups:** {{TOTAL_GROUPS}}

Rules: fixes with the same owner on the same file merge into one fix item.
Fix items that touch the same file or a shared interface/contract serialize
(contract order first, otherwise lower fix ID first unless the user reorders).
Fix items with no shared file or symbol run in parallel within a group. Caveats
and contradictions awaiting a decision are not scheduled.

Acceptance: a fix item with a CONFIRMED finding uses that finding's repro command
(under `.shards/review/<run_id>/`) as its accept check. The repro fails now and must
pass after the fix. Other items keep their existing checks.

---

## Execution Groups

### Group 1 (parallel)

- **{{FIX_ID}}** ({{OWNING_SPECIALIST}}) — `{{FILE_LOCATION}}` — {{FIX_SUMMARY}} — accept: {{ACCEPTANCE_CHECK}}

### Group {{N}} (blocks on Group {{N_MINUS_1}})

- **{{FIX_ID}}** ({{OWNING_SPECIALIST}}) — `{{FILE_LOCATION}}` — {{FIX_SUMMARY}} — accept: {{ACCEPTANCE_CHECK}}
  - Reason: {{DEPENDENCY_REASON}}

---

## Dependency rationale

For each cross-group dependency, name the trigger (file conflict, cell
conflict, or contract dependency):

- {{FIX_ID}} → blocks on {{BLOCKING_FIX_ID}} ({{CONFLICT_TYPE}}, {{DETAIL}})

## Unowned findings

<!-- List findings with Owning specialist = unowned so the user can assign one at the Phase 4 gate; write "None" otherwise. -->

{{UNOWNED_FINDINGS}}

## Contradictions awaiting a decision

<!-- Findings tagged contradiction-<n>: both recommendations verbatim, for the user to pick at the Phase 4 gate; write "None" otherwise. -->

{{CONTRADICTIONS}}
