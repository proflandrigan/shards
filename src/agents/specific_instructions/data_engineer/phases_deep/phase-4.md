> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Deep Phase 4 — Testing Strategy

Goal: Define tests for data quality and regression prevention.

Ask about:
- Primary keys at each layer?
- Business rules to encode as tests?
- Accepted value ranges or enums?
- Source freshness tests needed?
- Row count or anomaly thresholds?

Define: schema tests (.yml), custom data tests (tests/), source freshness.

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Testing Strategy (Data Engineer)
- **Schema tests:**
  | Model | Column | Test | Severity |
  |-------|--------|------|----------|
  | <model> | <col> | unique | error |
- **Custom data tests:**
  - <test name>: <assertion and why>
- **Source freshness:**
  - <source>: warn_after <N> hours, error_after <N> hours
- **Row count / anomaly monitoring:** <approach or "not required">
- **Test coverage:** Full | Partial — <gaps>
```

::GATE:: id=data-engineer-deep-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-5.md` in full and follow its instructions starting from Deep Phase 5.
