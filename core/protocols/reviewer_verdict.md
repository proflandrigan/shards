---
name: reviewer-verdict-protocol
description: Universal three-tier reviewer verdict mapping and escalation script for specialist agents
type: reference
---

Every reviewer returns exactly one of three verdict words: **APPROVED**, **NEEDS REVISION**, or **BLOCKED**. No reviewer defines its own vocabulary. Reviewer-specific nuance (what kind of concern, how severe, which alternatives) goes in the body of the review, never in the verdict word. Map the verdict to a tier and act accordingly. Exceptions: Syn's final review (`entry=final_review`) treats NEEDS REVISION as fix and resubmit; follow {{protocol syn_review_resolution}} for it. Inside an autonomous loop no verdict raises a gate: the Autonomous Research loop acts on each verdict per `autonomous_research.md` §D.2, and the experiment-mode Phase 2 loop records NEEDS REVISION findings as caveats and, on BLOCKED, downgrades the experiment's recommendation (Adopt becomes Refine or Revert); the user sees both at Phase 3.

| Verdict | Tier | Meaning | Action |
|---------|------|---------|--------|
| **APPROVED** | Proceed | The work stands as written. | Document verdict in specs. Continue. |
| **NEEDS REVISION** | Proceed with caveats | Issues exist but the work can continue once they are acknowledged or fixed. The body lists each issue and says whether it is a caveat to record or a fix to make. | Document the concern verbatim in specs. Tell the user what was flagged. Gate: "Reviewer noted: [X] — documented in specs. Confirm to continue?" Proceed on user confirmation. |
| **BLOCKED** | Halt and fix | A material problem makes the work unsafe to build on. | Halt. Document the issue in specs. Fix it. Resubmit to the same reviewer ONCE. If still BLOCKED on resubmission, escalate. |

## Reviewer Vocabulary

All reviewers use the same three words. The table below lists which agents act as reviewers; it adds no per-reviewer verdict words. Specialists consulting a reviewer do not need to restate this vocabulary in their phase instructions, they only need to invoke this protocol.

| Reviewer (agent id) | Verdict vocabulary |
|--------------------------|--------------------|
| `researcher`, `statistician`, `applied-ml-scientist`, `data-modeller` (service mode), `analytics-engineer` (service mode), `backend-engineer` (service mode), `data-scientist` (service mode), `ml-engineer` (service/reviewer role), `data-analyst`, `data-engineer`, `bi-engineer`, `deep-learning-engineer`, `mlops-engineer`, `academic`, `syn` (final review, code review) | APPROVED / NEEDS REVISION / BLOCKED |

Reviewers that used to return their own words map as follows when reading older specs: Sound, Aligned, Suitable, Clear, DEPLOY, Clean mean APPROVED; Concerns, Consider Alternatives, Nuanced, OPTIMIZE, Minor Issues, Refactor Required mean NEEDS REVISION; Revise, Redesign, REDESIGN mean BLOCKED.

If a reviewer returns a word outside APPROVED / NEEDS REVISION / BLOCKED, record it verbatim, treat it as the tier that most closely matches its meaning (ask the user if ambiguous), and note the format deviation in specs.

**Escalation script (use verbatim when a second BLOCKED verdict is returned):**
> "[Reviewer] has flagged a concern twice. Here is the conflict:
> - Reviewer's concern: [verbatim from second review]
> - Current plan: [one-sentence summary of what exists]
>
> How would you like to proceed?
> (a) Override and proceed — I'll document the disagreement in specs.
> (b) Revise further — tell me what to change.
> (c) Stop the project."

Document the resolution in specs:
`**Reviewer resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped`

**Resubmission cap:** Never resubmit to the same reviewer more than once per phase. After one resubmission, the path is always user escalation — never another consult.

**Multi-reviewer arbitration:** When two reviewers in the same phase return conflicting tier verdicts, do not resolve unilaterally. Present both verdicts verbatim to the user with a one-sentence summary of the conflict. Ask which direction to take before making any changes. Document the user's decision in specs.

## Final Review (Syn Sign-Off) — Validation Section Check

When a specialist consults Syn (`entry=final_review`) for final sign-off on a validation-eligible phase, Syn's review must explicitly inspect the `## Validation` section in `project-specs.md` per `protocols/validation.md`. This is distinct from the `gate_request` tool's structural check — Syn performs the *semantic* check the runtime cannot.

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
