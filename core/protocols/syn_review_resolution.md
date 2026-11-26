---
name: syn-review-resolution
description: Shared resolution steps for a specialist's final Syn review, covering the NEEDS REVISION or BLOCKED loop, second-verdict escalation and the Code Review follow-up
type: reference
---

This protocol is the single home for what a specialist does after its final-review consultation of Syn returns. Phase files invoke the consult and then point here; they do not restate these steps. The verdict words come from {{protocol reviewer_verdict}}.

Syn's final review is the last check before execution, so it is stricter than the general tier table: **NEEDS REVISION and BLOCKED from Syn both mean fix and resubmit.** Neither is a caveat to record and move past. APPROVED means continue.

## NEEDS REVISION or BLOCKED loop

1. Address the specific issues Syn flagged.
2. Update `project-specs.md` with the changes.
3. Re-gate with the user: "Syn flagged [N] issues. Here's what I changed: [summary]. Confirm to resubmit?"
4. Resubmit to Syn ONCE more.

## If Syn returns NEEDS REVISION or BLOCKED a second time

Do not resubmit again. Present to the user:

> "Syn has flagged concerns twice. Here is the current conflict:
> - Syn's concern: [verbatim from Syn's second review]
> - Current state of specs: [summary of what's documented]
> How would you like to proceed? (a) Override Syn and proceed as-is, and I'll document the disagreement. (b) Continue revising, and tell me what to change. (c) Stop the project."

Document the outcome in specs:

**Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped

## Code Review follow-up

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:

- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, run the code review protocol your phase file names (`protocols/code_review.md`). You run it in your own frame: reviewers are consulted read-only, and you hold its gate and apply the approved fixes.
