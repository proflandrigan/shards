<!-- Produced by: Syn Panel Review mode ([PR]) -- core/agents/syn/modes/panel_review.md. Written to <output_dir>/panel-report.md in Phase 0; each later phase appends its section. -->
# Panel Review: {{DIRNAME}}

- **Target directory:** {{TARGET_DIR}}
- **Output directory:** {{OUTPUT_DIR}}
- **Date:** {{DATE}}
- **Reviewer:** Syn (Panel Review Mode)
- **Run ID:** {{RUN_ID}}

---

## Phase 0 — Intake

- **Content tags:** {{CONTENT_TAGS}}
- **Scope:** {{SCOPE}}; excluded: {{EXCLUSIONS}}
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

### Stats review route

{{STATS_ROUTE}}

### Panel roster (de-duplicated)

- {{REVIEWER}}: {{BUCKET_COUNT}} bucket(s) ({{REVIEWER_FILE_COUNT}} files)

### Not reviewed

{{NOT_REVIEWED}}

---

## Phase 3 — Coalesced Findings

### Summary

- **Total findings:** {{TOTAL_FINDINGS}} (fixes: {{FIX_COUNT}}, caveats: {{CAVEAT_COUNT}})
- **High severity:** {{HIGH_COUNT}}
- **Medium severity:** {{MEDIUM_COUNT}}
- **Low severity:** {{LOW_COUNT}}
- **Conflict groups:** {{CONFLICT_GROUP_COUNT}} (fixes that touch overlapping locations)
- **Contradictions awaiting a decision:** {{CONTRADICTION_COUNT}}
- **Refuted (dropped from the table):** {{REFUTED_COUNT}}
- **Snapshot check:** {{SNAPSHOT_RESULT}}

### Reviewer verdicts

| Reviewer | Verdict | Findings | Resubmitted |
|---|---|---|---|
| {{REVIEWER}} | {{VERDICT}} | {{REVIEWER_FINDING_COUNT}} | {{RESUBMITTED}} |

### Findings table

Severity shows `High (unverified)` for a High finding that is not CONFIRMED.
Status is CONFIRMED or PLAUSIBLE; Evidence is the repro command, exit code and
repro path (CONFIRMED), or the reason (PLAUSIBLE).

| ID | Severity | Type | Status | Evidence | File(s) | Reviewer(s) | Issue | Cross-reviewer agreement | Suggested fix | Owning specialist | Conflict group |
|---|---|---|---|---|---|---|---|---|---|---|---|
| {{FINDING_ID}} | {{SEVERITY}} | {{FINDING_TYPE}} | {{STATUS}} | {{EVIDENCE}} | {{FILES}} | {{REVIEWERS}} | {{ISSUE}} | {{AGREEMENT}} | {{SUGGESTED_FIX}} | {{OWNING_SPECIALIST}} | {{CONFLICT_GROUP}} |

### Refuted findings

<!-- REFUTED rows: ID, lead, issue, repro command, exit code and repro path. Write "None" otherwise. -->

{{REFUTED_FINDINGS}}

### Review leads and delegation

<!-- One line per review lead: agent id, the lead's Delegation line verbatim, and the verifiers it launched. Write "Not a verified review" when code execution was not approved. -->

- {{REVIEWER}}: {{DELEGATION_LINE}}

### Methodological Concerns (Researcher's lens)

{{METHODOLOGICAL_CONCERNS}}

### Claim review (Statistician's lens)

{{CLAIM_REVIEW}}

### Statistician style notes (non-blocking)

{{STYLE_NOTES}}

### Coverage gaps

{{COVERAGE_GAPS}}

### Open questions

{{OPEN_QUESTIONS}}

---

## Phase 4 — Sequencing Plan

- **Execution groups:** {{GROUP_COUNT}}
- **Total fixes:** {{TOTAL_FIXES}} (in {{FIX_ITEM_COUNT}} fix items)
- **Plan file:** `{{OUTPUT_DIR}}/sequencing-plan.md`

---

## Phase 6 — Summary

- **Reviewers convened:** {{REVIEWERS_CONVENED}}
- **Reviewer verdicts:** {{REVIEWER_VERDICTS}}
- **Total findings:** {{TOTAL_FINDINGS}} (fixes {{FIX_COUNT}}, caveats {{CAVEAT_COUNT}})
- **Findings by severity:** High {{HIGH_COUNT}}, Medium {{MEDIUM_COUNT}}, Low {{LOW_COUNT}}
- **Fixes applied:** {{FIXES_APPLIED}} of {{FIXES_PLANNED}} approved
- **Fixes by specialist:**
  - {{SPECIALIST}}: {{SPECIALIST_FIX_COUNT}}
- **Refused fixes (specialist disagreement):** {{REFUSED_COUNT}} — see `fix-log.md`
- **Failed fixes:** {{FAILED_COUNT}} — see `fix-log.md`
- **Skipped fixes (user excluded or dependent on a skipped fix):** {{SKIPPED_COUNT}}
- **Verification:** {{VERIFIED_RESOLVED}} resolved, {{VERIFIED_UNRESOLVED}} not resolved, {{VERIFIED_NEW}} new issues
- **Repro reruns:** {{REPRO_PASSED}} passed, {{REPRO_FAILED}} failed, {{REPRO_NOT_RUN}} not run (see `fix-log.md`, `## Repro reruns`)
- **Coverage gaps:** {{COVERAGE_GAP_SUMMARY}}
