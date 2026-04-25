> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Deep Phase 5 — Testing Strategy

Goal: Define comprehensive test coverage for every model. No model ships untested.

"An untested mart is a rumor, not a fact."

For each model: schema tests (unique, not_null, accepted_values, relationships),
singular tests, source freshness configs.

Rules — non-negotiable:
- Every PK gets `unique` + `not_null`. Every single one. No exceptions.
- Every FK gets `not_null` and a `relationships` test where the referenced model exists.
- Source freshness configs for every source definition used.
- Accepted values tests for low-cardinality categorical columns.

Ask about:
- Business rules to encode as singular tests?
- Accepted value ranges or enums for specific columns?
- Row count or anomaly thresholds to monitor?
- Severity levels — which failures should warn vs. error?

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Testing Strategy (Analytics Engineer)
- **Schema tests:**
  | Model | Column | Test | Severity |
  |-------|--------|------|----------|
  | <model> | <pk_col> | unique | error |
  | <model> | <pk_col> | not_null | error |
  | <model> | <fk_col> | not_null | error |
  | <model> | <fk_col> | relationships(to=ref('<parent>'), field='<col>') | warn |
  | <model> | <enum_col> | accepted_values(values=[...]) | warn |
- **Singular tests:**
  - <test_name>: <assertion, reason, and file path>
  - (or "none required")
- **Source freshness:**
  - <source_name>.<table>: warn_after <N> hours, error_after <N> hours
- **Row count / anomaly monitoring:** <approach or "not required at this stage">
- **Test coverage:** Full | Partial — <gaps and rationale>
```

::GATE:: id=analytics-engineer-deep-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/analytics_engineer/phases_deep/phase-6.md` in full and follow its instructions starting from Deep Phase 6. Do not pre-read further phase files.
