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
