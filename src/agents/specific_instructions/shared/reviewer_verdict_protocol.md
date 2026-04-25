---
name: reviewer-verdict-protocol
description: Universal three-tier reviewer verdict mapping and escalation script for specialist agents
type: reference
---

When a consulted reviewer returns a verdict, map it to one of three universal tiers and act accordingly:

| Tier | Reviewer verdicts that map here | Action |
|------|---------------------------------|--------|
| **Proceed** | Sound · Approved · Aligned | Document verdict in specs. Continue. |
| **Proceed with caveats** | Concerns · Consider Alternatives | Document the concern verbatim in specs. Tell the user what was flagged. Gate: "Reviewer noted: [X] — documented in specs. Confirm to continue?" Proceed on user confirmation. |
| **Halt and fix** | Revise | Halt. Document the issue in specs. Fix it. Resubmit to the same reviewer ONCE. If still Halt on resubmission, escalate. |

## Reviewer Vocabulary

Each reviewer agent returns verdicts in a fixed vocabulary. The table below lists the canonical verdicts per reviewer and their tier mapping. Specialists consulting a reviewer do not need to restate this vocabulary in their phase instructions — they only need to invoke this protocol.

| Reviewer (subagent_type) | Verdict vocabulary | Tier mapping |
|--------------------------|--------------------|--------------|
| `researcher` | Sound / Consider Alternatives / Revise | Sound → Proceed · Consider Alternatives → Proceed with caveats · Revise → Halt and fix |
| `applied-ml-scientist` | Sound / Consider Alternatives / Revise | same as above |
| `data-modeller` (service mode) | Sound / Concerns / Revise | Sound → Proceed · Concerns → Proceed with caveats · Revise → Halt and fix |
| `analytics-engineer` (service mode) | Sound / Concerns / Revise | same as above |
| `backend-engineer` (service mode) | Sound / Concerns / Revise | same as above |
| `data-analyst` (reviewer role) | Aligned / Concerns raised | Aligned → Proceed · Concerns raised → Proceed with caveats |
| `data-engineer` (reviewer role) | Sound / Concerns | Sound → Proceed · Concerns → Proceed with caveats |
| `bi-engineer` (reviewer role) | Suitable / Concerns / Redesign | Suitable → Proceed · Concerns → Proceed with caveats · Redesign → Halt and fix |
| `deep-learning-engineer` (reviewer role) | Approved / Concerns / Redesign needed | Approved → Proceed · Concerns → Proceed with caveats · Redesign needed → Halt and fix |
| `mlops-engineer` (reviewer role) | Approved / Concerns / Redesign needed | same as above |
| `ml-engineer` (reviewer role) | DEPLOY / OPTIMIZE / REDESIGN | DEPLOY → Proceed · OPTIMIZE → Proceed with caveats · REDESIGN → Halt and fix |
| `academic` | Clear / Nuanced / Concerns | Clear → Proceed · Nuanced → Proceed with caveats · Concerns → Halt and fix |

If a reviewer returns a verdict not listed here, record it verbatim and default to the tier that most closely matches the semantic meaning (ask the user if ambiguous).

**Escalation script (use verbatim when a second Halt verdict is returned):**
> "[Reviewer] has flagged a concern twice. Here is the conflict:
> - Reviewer's concern: [verbatim from second review]
> - Current plan: [one-sentence summary of what exists]
>
> How would you like to proceed?
> (a) Revise further — tell me what to change.
> (b) Override and proceed — I'll document the disagreement in specs.
> (c) Stop the project."

Document the resolution in specs:
`**Reviewer resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped`

**Resubmission cap:** Never resubmit to the same reviewer more than once per phase. After one resubmission, the path is always user escalation — never another Task call.

**Multi-reviewer arbitration:** When two reviewers in the same phase return conflicting tier verdicts, do not resolve unilaterally. Present both verdicts verbatim to the user with a one-sentence summary of the conflict. Ask which direction to take before making any changes. Document the user's decision in specs.

## Final Review (Syn Sign-Off) — Validation Section Check

When a specialist invokes Syn via `Task(subagent_type="syn", ...)` for final sign-off on a validation-eligible phase, Syn's review must explicitly inspect the `## Validation` section in `project-specs.md` per `shared/validation_protocol.md`. This is distinct from the gate hook's structural check — Syn performs the *semantic* check the hook cannot.

Syn's validation review looks for:

- **Evidence, not assertion.** Does every check row record a measured value, or is the Observed cell filled with prose that could be true of a broken implementation?
- **Coverage matching Track / Mode.** Did the specialist run the checks its declared `(Track, Mode)` requires, or did it skip checks with `n/a` without real justification?
- **Downstream impact honest.** Is "verified intact" supported by an actual check, or is it a claim?
- **Open Issues not hiding failures.** Unresolved `✗` rows and unacceptable residual risks should be surfaced, not quietly deprioritized.
- **Summary matches evidence.** Does the Summary paragraph describe what actually happened, or does it paper over failed checks?

Syn's verdict mapping:

| Validation state | Verdict |
|------------------|---------|
| Section populated, evidence is real, coverage appropriate, risks surfaced | APPROVED |
| Section populated but evidence is thin on 1-2 checks, coverage mostly correct | NEEDS REVISION — specific checks called out |
| Section missing checks from required list, or evidence is theater (assertions masquerading as measurements), or failed checks are hidden | NEEDS REVISION — point the specialist back to the protocol and checklist |
| Section claims `n/a` on clearly applicable checks with vague justifications | NEEDS REVISION — demand the actual check or a real justification |

A structurally-complete but semantically-empty Validation section is the most common failure mode. Syn is the last line of defense against it before a reviewer verdict is issued.
