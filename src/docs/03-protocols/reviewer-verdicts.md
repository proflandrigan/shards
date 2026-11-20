# Reviewer Verdicts

Every reviewer (Syn, Researcher, Data Modeller, Backend Engineer, MLOps Engineer, Applied ML Scientist and the rest) returns exactly one of three verdict words. No reviewer defines its own vocabulary. Nuance goes in the body of the review, not the verdict word.

## The three tiers

| Verdict | Tier | Caller action |
|---|---|---|
| **APPROVED** | Proceed | Record the verdict in the specs and continue. |
| **NEEDS REVISION** | Proceed with caveats | Record the concern verbatim, tell you what was flagged, and continue once you confirm or the fix is made. |
| **BLOCKED** | Halt and fix | Halt, document, fix, and resubmit to the same reviewer once. |

Older specs may use earlier words. Sound, Aligned, Suitable, Clear, DEPLOY and Clean map to APPROVED. Concerns, Consider Alternatives, Nuanced, OPTIMIZE, Minor Issues and Refactor Required map to NEEDS REVISION. Revise, Redesign and REDESIGN map to BLOCKED. If a reviewer returns an unknown word, the specialist records it verbatim, treats it as the closest tier (asking you if ambiguous) and notes the deviation.

## Escalation

- **Resubmission cap.** A specialist never resubmits to the same reviewer more than once per phase. A second BLOCKED verdict goes to you with the reviewer's concern verbatim, a one-line summary of the current plan, and three options: revise further, override and proceed (the disagreement is documented), or stop the project.
- **Resolution is recorded** in the specs as `Approved`, `Approved on resubmit`, `User override`, or `Project stopped`.
- **Conflicting reviewers.** When two reviewers in one phase return conflicting tiers, the specialist presents both verbatim and asks you which way to go. It does not resolve the conflict unilaterally.

## Syn's final review

Specialists consult Syn (`final_review`) before closing a build. Syn must read the `## Validation` section for the semantic check that the runtime cannot do: evidence not assertion, coverage matching the declared Track and Mode, honest downstream impact, open issues not hiding failures, and a summary that matches the evidence. A structurally complete but semantically empty section returns NEEDS REVISION. Syn's final review is stricter than the table above: NEEDS REVISION from Syn means fix and resubmit, not proceed with caveats. After the verdict, the specialist follows the shared resolution steps in `core/protocols/syn_review_resolution.md`: address the flagged issues, re-gate with you, resubmit once, and on a second NEEDS REVISION or BLOCKED offer you the override, revise or stop choice. If Syn's review lists code artifacts, the specialist offers you a code-review pass.

`final_review` is refused while any gate is pending or suspended (see [Gate Pattern](gate-pattern.md)).

## See also

- [The Gate Pattern](gate-pattern.md)
- [Validation](validation.md)
- [Behavioral Rules](behavioral-rules.md)
- Source: `core/protocols/reviewer_verdict.md`, `core/protocols/syn_review_resolution.md`
