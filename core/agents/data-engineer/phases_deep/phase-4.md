> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Deep Phase 4 — Testing Strategy

Goal: Define tests for data quality and regression prevention.

Start from the **Acceptance criteria** recorded in Phase 1 — each one must map to at
least one test or assertion here. Flag any criterion that can't be tested.

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

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 5}} in full and follow its instructions starting from Deep Phase 5.
