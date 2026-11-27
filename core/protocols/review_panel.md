---
name: review-panel
description: Dispatch rules for a main-thread caller that runs review leads — panel review, a PM integration review or a specialist's code review — covering approval, the snapshot, one lead per specialist, merge rules and fix acceptance
type: reference
---

# Review Panel Dispatch

This applies to any caller that runs review leads from the main thread: Syn's panel review mode, a PM integration review, or a specialist's code review. The leads follow the review-lead contract (`review_lead_contract.md`); it governs them, not you. The execution rules are in `{{protocol review_execution}}`.

## 1. Approval

Before dispatch, ask the user whether code may run for this review, or inherit an approval already given for it. Name the commands you would allow (for example `python -m pytest <path> -q`) and estimate the agent count: one lead per specialist, plus up to 4 verifiers per lead and 16 in the run. Put the answer in every lead's brief as `**Code execution:** approved — allowed commands: ...` or `not approved`. Without approval the review still runs, and its findings are PLAUSIBLE.

## 2. Snapshot

Pick a `run_id` (`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`), unique per review. Take the snapshot only when code execution is approved. Without approval nothing runs; skip it and record the snapshot as `not run`. Code execution is not available for files outside the project root (snapshot and scratch paths are project-relative). Use `.` to snapshot the whole root.

- Before dispatch: `review_snapshot(action="start", run_id, paths=<the reviewed paths>)`. If you write anything inside those paths while the review runs (a report or findings directory), pass it as `exclude=[<project-relative dir>]`, or your own output shows up as a change.
- After every lead has returned: `review_snapshot(action="check", run_id)`.
- If `clean` is false, report each added, modified or deleted path to the user as a High finding. The review ran against a changing tree, so its results need a rerun.

## 3. Dispatch

- Launch one review lead per specialist on the panel, all in parallel, in one message. Each lead gets only its own files and its lens, plus the approval line and the `run_id`.
- Do not launch a lead for a bucket that has no files.
- A review run started inside a nested lead (for example a PM integration review that a workstream lead runs) has no verifiers. Its leads verify inline or leave findings PLAUSIBLE, as the review-lead contract says.

## 4. Merge

- Build one findings table over all leads' returns. Same issue from two leads is one row that names both.
- REFUTED rows are dropped from the findings table and listed in the review log with their repro paths.
- A High finding that is not CONFIRMED is labelled `High (unverified)`. Keep Medium and Low severity and status as returned.
- Contradictions between leads go to the user unresolved, per `{{protocol reviewer_verdict}}`.

## 5. Fix acceptance

- A CONFIRMED finding's repro command becomes the acceptance check for its fix.
- After the fix, rerun that command only if the user approved code execution for the fix stage. The review's approval does not carry over (`{{protocol review_execution}}`). Without it, record the check as `not run (code execution not approved)`.
- When it runs, it must now pass. Report the real result.
- Repro tests stay under `.shards/review/<run_id>/`. Do not add them to the project's test suite unless the user asks.

## 6. Log

The review output lists each lead, its verifiers and their statuses, the REFUTED items with their repro paths, the snapshot result, and the Delegation line from each lead.
