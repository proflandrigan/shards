<!-- Produced by: Syn Panel Review mode ([PR]) -- core/agents/syn/modes/panel_review.md. Written to <output_dir>/panel-report.md in Phase 0; each later phase appends its section. -->
# Panel Review: {{DIRNAME}}

- **Target directory:** {{TARGET_DIR}}
- **Output directory:** {{OUTPUT_DIR}}
- **Date:** {{DATE}}
- **Reviewer:** Syn (Panel Review Mode)

---

## Phase 0 — Intake

- **Content tags:** {{CONTENT_TAGS}}
- **Scope:** {{SCOPE}}
- **User notes:** {{USER_NOTES}}

<!-- Phase 1 onward is appended by Syn as each phase completes. -->

---

## Phase 1 — Panel Composition

### Directory summary

{{DIRECTORY_SUMMARY}}

### Buckets and reviewers

| Bucket | Files (count) | Sample | Primary | Secondary | Tag-driven additions | Notes |
|---|---|---|---|---|---|---|
| {{BUCKET}} | {{FILE_COUNT}} | {{SAMPLE_FILES}} | {{PRIMARY_REVIEWER}} | {{SECONDARY_REVIEWER}} | {{TAG_ADDITIONS}} | {{NOTES}} |

### Panel roster (de-duplicated)

- {{REVIEWER}}: {{BUCKET_COUNT}} bucket(s)

---

## Phase 3 — Coalesced Findings

### Summary

- **Total findings:** {{TOTAL_FINDINGS}}
- **High severity:** {{HIGH_COUNT}}
- **Medium severity:** {{MEDIUM_COUNT}}
- **Low severity:** {{LOW_COUNT}}
- **Conflict groups:** {{CONFLICT_GROUP_COUNT}} (fixes that touch overlapping locations)

### Findings table

| ID | Severity | File(s) | Reviewer(s) | Issue | Cross-reviewer agreement | Suggested fix | Owning specialist | Conflict group |
|---|---|---|---|---|---|---|---|---|
| {{FINDING_ID}} | {{SEVERITY}} | {{FILES}} | {{REVIEWERS}} | {{ISSUE}} | {{AGREEMENT}} | {{SUGGESTED_FIX}} | {{OWNING_SPECIALIST}} | {{CONFLICT_GROUP}} |

### Methodological Concerns (Researcher's lens)

{{METHODOLOGICAL_CONCERNS}}

---

## Phase 4 — Sequencing Plan

- **Execution groups:** {{GROUP_COUNT}}
- **Total fixes:** {{TOTAL_FIXES}}
- **Plan file:** `{{OUTPUT_DIR}}/sequencing-plan.md`

---

## Phase 6 — Summary

- **Reviewers convened:** {{REVIEWERS_CONVENED}}
- **Total findings:** {{TOTAL_FINDINGS}}
- **Findings by severity:** High {{HIGH_COUNT}}, Medium {{MEDIUM_COUNT}}, Low {{LOW_COUNT}}
- **Fixes applied:** {{FIXES_APPLIED}} of {{FIXES_PLANNED}}
- **Fixes by specialist:**
  - {{SPECIALIST}}: {{FIX_COUNT}}
- **Refused fixes (specialist disagreement):** {{REFUSED_COUNT}} — see `fix-log.md`
- **Skipped fixes (user excluded):** {{SKIPPED_COUNT}}
