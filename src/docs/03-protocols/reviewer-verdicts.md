# Reviewer Verdicts

Every reviewer — Syn, Researcher, Data Modeller, Backend Engineer, MLOps Engineer, Applied ML Scientist — returns a verdict in one of three tiers. This is the universal vocabulary.

## The three tiers

| Tier | Meaning | Caller action |
|---|---|---|
| **APPROVED** / SOUND / CLEAN | No issues. | Proceed as planned. |
| **NEEDS REVISION** / CONSIDER ALTERNATIVES / MINOR ISSUES | Valid but improvable. Reviewer provides specific suggestions. | Caller decides: address suggestions or proceed with justification. |
| **BLOCKED** / REVISE / REFACTOR REQUIRED | Critical issues that must be fixed. | Caller must address before advancing. |

Different reviewers use different labels (the Researcher says SOUND / CONSIDER ALTERNATIVES / REVISE; Syn says APPROVED / NEEDS REVISION / BLOCKED; the Backend Engineer says CLEAN / MINOR ISSUES / REFACTOR REQUIRED / BLOCKED) but the semantics are the same.

## How verdicts are used

Specialists write the reviewer verdict into the relevant phase section of `project-specs.md`:

```
## Phase 3: Analysis Methodology

::GATE::
**Method:** Propensity score matching.
**Reviewer verdict (Researcher):** SOUND.
**Reviewer notes:** Propensity overlap looks good; recommend sensitivity analysis.
::ENDGATE::
```

The specialist then acts on the verdict per the table above.

## Escalation

When multiple reviewers are consulted in a phase (e.g., ML Engineer Phase 7 has Backend + MLOps + Syn), the specialist aggregates verdicts. Any `BLOCKED` blocks the phase. Any `NEEDS REVISION` is documented and addressed or justified.

## See also

- [The Gate Pattern](gate-pattern.md)
- [Behavioral Rules](behavioral-rules.md)
- Source: `src/agents/specific_instructions/shared/reviewer_verdict_protocol.md`
