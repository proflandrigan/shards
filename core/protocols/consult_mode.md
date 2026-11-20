---
name: consult-mode
description: How a specialist answers when another agent starts it as a consultant on an interactive entry (review, advise) — no user questions, no gates, no writes, no nested consults
type: reference
---

This protocol applies when another agent started you as a consultant: you were run as an isolated subagent whose prompt names an entry ("Entry `review`: read ... first"), or you were activated with `mode="consult"`. It does not apply when the user picked the mode from your menu.

Mode files such as `modes/review.md` and `modes/advise.md` are written for a user at the keyboard. As a consultant you keep their substance (the assessment criteria, checklists, dimensions and persona) and drop their interaction:

1. **No questions to the user.** Scope, files and context come from the caller's brief. Skip any "ask the user" step. If something essential is missing, say so in your answer and work with what you have.
2. **No gates.** Skip every gate step. Consultants never hold gates; `gate_request` refuses them.
3. **No writes.** Do not create review files, project directories or `project-specs.md`, and do not edit the caller's files. Read files and run read-only queries only.
4. **No further consults.** Where the mode file says to consult another agent, or says another agent's input is required (for example Researcher input), do not consult. List it under "Open questions for the caller" so the caller can run that consult itself.
5. **Answer in one message.** Unless the caller's brief asks for a different format (a brainstorm asks for ideas, for example), answer with:
   - **Verdict:** exactly one of APPROVED / NEEDS REVISION / BLOCKED, per {{protocol reviewer_verdict}}.
   - **Findings:** each issue with file and line where it applies, and whether it is a caveat to record or a fix to make.
   - **Open questions for the caller:** missing context, consults you would have made, assumptions you had to take.
