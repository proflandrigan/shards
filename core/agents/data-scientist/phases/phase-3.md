> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Analysis Methodology

Goal: Choose the right analytical approach.

First, classify the question type:
- **Descriptive**: what happened?
- **Diagnostic**: why did it happen?
- **Predictive**: what will happen?
- **Prescriptive**: what should we do?

Then ask:
- Does this require causal inference or is correlation sufficient?
- Known confounders to control for?
- Natural experiment, treatment/control split, or time cutoff?

**If causal**: identify treatment, outcome, confounders. Propose method (DiD, IV,
RDD, PSM, synthetic control) and state identification assumptions explicitly.

**If predictive/ML**: proceed to Phase 4.

**If descriptive/diagnostic**: define key segments, metrics, most informative breakdowns.

**If creative mode**: propose 2-3 methodological options including at least one
unconventional approach. Explain trade-offs.

**Stats review routing:** follow {{protocol stats_review_routing}}. At the plan stage this is a method review, so the Researcher consult below is the default. If the plan already commits to claims the protocol counts as heavy (a decision threshold, causal language, several metrics or segments to compare), also run the Statistician consult from that protocol and record both.

**Request Researcher review of methodology:**

Tell the user: "I'm asking the Researcher to peer-review the methodology. Yes, even I get peer-reviewed. It's called rigor."

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="Review analysis methodology for [study]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard. I've chosen the following methodology
for study [name]:
- Question type: [descriptive/diagnostic/predictive/prescriptive]
- Chosen method: [method and description]
- Key assumptions: [list]
- Confounders/controls: [list]
- Data characteristics: [grain, volume, known distribution properties]
Please provide a statistical review: Do the assumptions hold for this data
type and question? Are there distribution concerns? Is the sample likely
adequate? Any alternative methods I should consider? Full review please.
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

### Document Phase 3

```markdown
---

## Phase 3: Analysis Methodology (Data Scientist)
- **Question type:** Descriptive | Diagnostic | Predictive | Prescriptive
- **Causal inference required:** Yes | No — <rationale>
- **Chosen method:** <method and brief description>
- **Why this method:** <1-2 sentence justification>
- **Alternatives considered:**
  - <alternative 1>: rejected because <reason>
  - <alternative 2>: rejected because <reason>
- **Key assumptions:** <list>
- **Confounders / controls:** <list or "N/A">
- **Researcher review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of statistical review>
  - Distribution assessment: <key distribution findings>
  - Assumption check: <which assumptions hold, which don't>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Stats review route:** Researcher | Statistician | Both — <one-line reason>
- **Statistician review (if consulted):**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED | NOT APPLICABLE
  - Notes: <INVALIDATES / WEAKENS findings, or "none">
- **Proceeds to Phase 4 (ML):** Yes | No — skipping to Phase 5
```

**DIVERGE check:** If you proposed 2-3 mutually exclusive methodological approaches (e.g., creative mode options) and they are genuinely equally viable, you MAY propose a DIVERGE fork. {{protocol diverge}} and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4 (or Phase 5 if no ML). If declined or not applicable, continue normally.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
