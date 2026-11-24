# Shards Agent Suite — Analysis & Backlog

> **Legacy (v1) analysis.** Written against the v1 layout (`src/agents/*.md`, `Task` calls, prose gates). Those files moved to `core/agents/<id>/` in v2 (mapping in [`core/INVENTORY.md`](../../core/INVENTORY.md)) and gates are now tool calls ([ADR 0008](../adr/0008-gates-are-tool-calls.md)), so file and line references below are stale. Check an item against `core/` before acting on it; current v2 work is tracked in [`NEXT_STEPS.md`](../../NEXT_STEPS.md).

---

## 1. System Health Overview

The suite's foundational design is strong. The gate pattern — write to specs, read back, wait for explicit confirmation — is consistently enforced across all seven specialist agents and enforced by prose that is hard to accidentally bypass. The in-session persona transfer mechanism is an elegant solution to context-window management that avoids the coordination failures common in multi-agent systems. Cross-agent consultation via `Task` is well-scoped: specialists call review-only agents for expertise without ceding control of the workflow.

The most important gaps are not in the gate mechanics but in what happens *around* the gates: **when a user says "no"** to a greenfield proceed-or-not question, the agent has no defined path. When a reviewer returns a negative verdict, the calling agent's response is vague or absent. When two reviewers disagree, no arbitration exists. And one high-value artifact — the DS→MLE handoff summary — exists only as an ephemeral chat message instead of a durable file.

These are fixable with targeted additions to individual phase sections. None require architectural changes.

---

### Privacy / Compliance Reviewer

**Gap it fills:** PII detection, GDPR/CCPA review, model bias auditing, data minimization guidance, and consent management review. No current agent asks "does this data contain PII?" before the analysis begins.

**Where the gap surfaces:** DA Phase 1 (data discovery, no PII checkpoint); DS Phase 2 (data discovery, no PII checkpoint); ML Engineer Phase 3 (feature design, no sensitive-feature review); AI Engineer Phase 3 (data pipeline, no PII checkpoint). This is the highest-consequence missing agent — a GDPR violation is not recoverable the way a bad SQL query is.

**Where it would be called:** DA/DS/MLE/AIE Phase 1-2 (data discovery, before any queries run); ML Engineer Phase 7 (model bias audit before deployment); AI Engineer Phase 6 (output review, personally identifiable generation risk).

---

## 3. Critical Behavioral Gaps

### A. Greenfield Gate — Undefined "No" Path

**Files affected:** `src/agents/data-analyst.md:236`, `src/agents/data-scientist.md:261`

**What the files currently say:**

DA Phase 1 (`data-analyst.md:233–238`):
> "Do you want to proceed on that basis?" — Wait for confirmation. Add to Phase 1 docs: `**Data environment:** GREENFIELD — No data assets detected. All queries theoretical.`

DS Phase 2 (`data-scientist.md:260–265`):
> "Every phase will be flagged [THEORETICAL — NOT VALIDATED]. Do you want to proceed on that basis?" — Wait for confirmation.

Both agents correctly identify the greenfield state and ask the user to confirm. **Neither defines what happens if the user says "No."**

If the user says "No, I don't want theoretical queries," the agent has no documented path. In practice it will either continue anyway (wrong) or go conversationally off-script (unpredictable).

**Recommendation:** Add an explicit no-path branch immediately after each greenfield confirmation question:

```
If user says NO:
"Understood. Without real data, this analysis can't proceed meaningfully.
Your options:
  1. Pause this project until data is available — I'll save what we have in project-specs.md.
  2. Close this project.
Which would you prefer?"

Document the outcome in Phase [1|2] specs:
**Data environment:** GREENFIELD — User declined theoretical mode. Project [paused | closed].
```

The goal is that every path through the gate has a documented next action.

---

### C. Review Verdict Escalation — Undefined Response Protocol

**Files affected:** `src/agents/data-analyst.md:312–317`, `src/agents/data-scientist.md:348–351`, `src/agents/ml-engineer.md` (Phase 3), all specialists

**What the files currently say:**

DA Phase 2 on reviewer verdicts (`data-analyst.md:312–317`):
> "Present both the Data Scientist's and Researcher's findings to the user. Address any concerns raised by either review."

DS Phase 3 on Researcher verdict (`data-scientist.md:348–351`):
> "If the Researcher verdict is 'Revise,' discuss alternatives before proceeding. If 'Concerns,' document the concerns and acknowledge them."

"Discuss alternatives" is not a protocol — it's a conversational instruction. There is no defined path for:
- Does the specialist re-gate the user before proceeding?
- Does the analyst resubmit to the reviewer after revising?
- What's the maximum number of revise/resubmit cycles?

**Recommendation:** Add a standardized 3-tier escalation table to every specialist agent's documentation section that receives reviewer verdicts. Same text in all agents:

```markdown
**Reviewer verdict handling:**
- **Sound / Approved / DEPLOY** — Proceed as documented.
- **Concerns / Optimize** — Document the concerns in this phase's specs. Document how
  they were addressed or why they were acknowledged-and-accepted. Proceed after
  user confirms at the phase gate. No resubmission required.
- **Revise / Redesign** — HALT. Fix the flagged issues. Re-gate with the user
  (show what changed). Resubmit to the same reviewer ONCE. If the reviewer returns
  Revise a second time, present both verdicts and the current state to the user:
  "[Reviewer] has flagged concerns twice. Here is the conflict and the current
  approach. How would you like to proceed?" Do not continue without explicit
  user direction.
```

This applies to: Researcher reviews (DA Phase 2, DS Phases 3 and 6), Data Scientist reviews (DA Phase 2), ML Engineer reviews (DS Phase 4), Data Modeller reviews (DS Phase 6), Applied ML Scientist reviews (MLE), and Deep Learning Engineer reviews (MLE).

---

### E. DS Phase 3→4 Routing — Implicit Decision Gate

**File affected:** `src/agents/data-scientist.md:320–374`

**What the file currently says:**

DS Phase 3 prose (`data-scientist.md:320–323`):
> "First, classify the question type: Descriptive, Diagnostic, Predictive, Prescriptive... **If predictive/ML**: proceed to Phase 4."

The Phase 3 documentation template (`data-scientist.md:371–374`) already includes:
> `- **Proceeds to Phase 4 (ML):** Yes | No — skipping to Phase 5`

The field exists in the template. The problem is that the prose doesn't make this decision point explicit and gated — it's presented as a classification outcome that naturally follows from the question type, not as a decision the user confirms. In practice, whether a question "requires ML" is often a judgment call, and skipping Phase 4 (ML modeling design) has downstream consequences on feature engineering, evaluation strategy, and Phase 6 execution.

**Recommendation:** Make the Phase 4 routing a mandatory gate question within Phase 3, not an inferred outcome. Add to DS Phase 3 before the gate:

```markdown
**Phase 4 routing decision (required):**
Based on the question type and methodology chosen:
- If Predictive or Prescriptive using ML methods — state explicitly:
  "This study requires an ML modeling phase. We will proceed to Phase 4 before execution."
- If Descriptive or Diagnostic without ML — state explicitly:
  "This study does not require an ML modeling phase. After your confirmation here,
  we will skip Phase 4 and proceed directly to Phase 5 (Output Format)."

Document this decision and read it back at the gate. The user must explicitly confirm
the Phase 4 routing before advancing.
```

The template field `**Proceeds to Phase 4 (ML):** Yes | No — <rationale>` is correct and should stay. The fix is making it a mandatory stated decision, not an inferred one.

---

## 4. Cross-Cutting Weaknesses

### G. Reproducibility Standards Absent

No agent requires `random_seed` documentation, experiment IDs, or logging platform configuration. DS Phase 6 asks "Reproducibility: self-contained or one-time?" (`data-scientist.md:508`) but never mandates that a seed be set.

**Recommendation:** Add to DS Phase 4 (Modeling Approach) template and MLE Phase 4 (Training Design) template:
- `**Random seed:** <integer — document here and use in all code>`
- `**Experiment tracking:** <MLflow | W&B | None — rationale>`

Add to DS Phase 6 notebook structure: "Setup: imports, config, **seed setting** (`random.seed(N)`, `np.random.seed(N)`, `torch.manual_seed(N)` as applicable), data loading."

DLE Phase 3 (`deep-learning-engineer.md:484–490`) already requires experiment tracking configuration — this standard should propagate to DS and MLE.

---

### H. PII Checkpoint Missing from All Agents

No agent asks whether data contains PII before executing queries, building features, or training models. This is the highest-severity cross-cutting gap.

**Recommendation:** Add a PII checkpoint to DA Phase 1, DS Phase 2, MLE Phase 3, and AIE Phase 3. Same question in all agents:

```markdown
**PII / Sensitive Data Check (required before proceeding):**
"Before we touch any data: does any data source identified here contain personally
identifiable information (PII) — names, emails, phone numbers, user IDs linked to
real identities, location data, behavioral data attributable to individuals?

If yes: we need to assess compliance requirements (GDPR, CCPA, internal data policy)
before designing queries or features. Do you have a data governance or legal contact
for this? Or should we document a PII flag and note that compliance review is
required before execution?"
```

Add to all Phase 1/2 docs templates:
```
- **PII / sensitive data present:** Yes — <type and compliance review status> | No | Unknown — review required
```

---

### K. Academic Agent — Scope Too Narrow

The Academic agent (`src/agents/academic.md`) explicitly limits itself to neuroscience, psychology, and cognitive science. It has no mandate for fairness/accountability/transparency (FAT-ML), algorithmic bias review, or legal/regulatory risk flagging.

**Recommendation:** Expand the Academic's scope statement to include:
- Fairness and accountability in algorithmic systems (with citation to the FAT-ML literature)
- Algorithmic bias detection and mitigation frameworks
- Legal and regulatory risk flagging (with explicit instruction: "flag regulatory risk and recommend legal counsel review — do not provide legal advice")

This matters because the Academic is already being consulted by the AI Engineer for safety and ethics — but its current scope doesn't include the FAT-ML literature or regulatory dimensions that are most actionable for practitioners.

---

### L. Task Call Error Recovery Undefined

No agent defines what to do when a `Task` call returns an error, times out, or returns an empty response. The instructions assume Task calls always succeed.

**Recommendation:** Add to all agents' behavioral rules sections:

```markdown
- **Task call failure handling:** If a Task call to [agent] returns an error or empty
  response: (1) Note in project-specs.md: "[Agent] consultation: Unavailable — error
  returned." (2) Tell the user: "The [agent] shard returned an error and couldn't
  complete the review. I'm documenting this as a skipped review. Do you want me to:
  (a) proceed without the review — I'll note the gap, (b) retry once, or (c) pause
  until the issue is resolved?" (3) Do not proceed without explicit user acknowledgment.
```

---

## 5. Priority Matrix

| Recommendation | Impact | Effort | Suggested Order |
|---|---|---|---|
| **A. Greenfield no-path branch** | High | Low | Do first |
| **C. Verdict escalation table** | High | Medium | Do first |
| **E. Phase 4 routing gate (DS)** | Medium | Low | Do first |
| **H. PII checkpoint** | High | Low | Do next |
| **G. Reproducibility standards** | Medium | Low | Do next |
| **L. Task call error recovery** | Medium | Low | Do next |
| **K. Academic scope expansion** | Low | Low | Do next |
| Missing: Privacy/Compliance agent | High | High | Later |
