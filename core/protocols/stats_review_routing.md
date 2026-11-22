---
name: stats-review-routing-protocol
description: Shared routing rule for statistical review — method questions go to the Researcher, claims on stats or metrics go to the Statistician, both when the load is heavy
type: reference
---

# Stats Review Routing Protocol

Two reviewers cover statistics. The Researcher checks the method: is the test,
distribution, outlier handling or sample size right? The Statistician checks the
conclusion: does the claim follow from the evidence? Use this protocol at every
point where your phase or mode says to get statistical review.

## Step 1 — Classify what needs review

| What you have | Example | Route to |
|---|---|---|
| A method choice not yet executed (test, model family, distribution assumption, outlier handling, sample size plan) | "Is a t-test right for this?" | Researcher |
| A claim on stats or metrics (significance, lift, "B beats A", "eval improved", "X caused Y", "churn fell 3%", a forecast with or without an interval) | "Variant B lifted conversion 2.1% (p=0.03)" | Statistician |
| Both a method choice and claims in the same review | A finished analysis with results | See Step 2 |

A claim exists whenever the output states, compares or interprets a number as
evidence for a conclusion. If in doubt, there is a claim.

## Step 2 — Decide whether to call both

Call BOTH reviewers (Researcher on the method, Statistician on the claims) when
ANY of these hold:

- **Heavy claims** — a claim drives a ship/launch/spend decision, uses causal language, or goes to leadership or outside the team
- **Complicated logic** — hierarchical, Bayesian, survival, time-series, causal-identification or sequential-testing methods; multi-stage pipelines where estimates feed later estimates
- **Volume** — more than three distinct claims, or several metrics, segments or model comparisons to work through

Otherwise call only the one Step 1 picked. Say which route you chose and why in
one sentence to the user, and record it in the specs entry for the review.

## Step 3 — Run the consults

- Researcher: {{consult researcher entry=service task="Method review: <topic>"}}
- Statistician: {{consult statistician entry=service task="Claim review: <topic>"}}
- Open statistical questions that are not a review of specific claims (e.g. "Bayesian or frequentist for this sequential test?", "what MDE can we detect?"): {{consult statistician entry=advise task="<question>"}}

Rules for the consults:

- When calling both, they are independent: consults never nest, so neither reviewer calls the other. Run the Researcher first when the method is still open (its fixes may change the claims), otherwise order does not matter.
- Pass each consultant: the claims verbatim (for the Statistician), the method/plan (for the Researcher), paths to the results, notebooks or reports, and any data-modeller context (grain, clustering, independence) you already collected.

## Step 4 — Apply verdicts

- Apply {{protocol reviewer_verdict}} to each reviewer independently; the worst verdict sets the tier.
- Statistician findings labelled OFFENDS are non-blocking: show the Statistician's "Things that merely offend me (non-blocking)" section to the user under the heading "Statistician style notes (non-blocking)" and do not act on them unless the user asks.
- If the Statistician lists "Method notes for the Researcher" and the Researcher was not consulted, decide: if any note could change a result, consult the Researcher now; otherwise record the notes as caveats.
- If the Researcher lists anything under "Claims for the Statistician" (or its findings otherwise question whether the conclusion follows) and the Statistician was not consulted, consult it now.
- Use the Statistician's "What the evidence actually supports" wording as the replacement for any claim it labels INVALIDATES or WEAKENS.
- Answer the Statistician's "Open questions for the caller" from context you already hold (data-modeller grain, clustering, independence). If an answer could change a finding, you (the caller, never the Statistician) re-consult with the answers; this counts as the one resubmit allowed by {{protocol reviewer_verdict}}, not an extra one. Otherwise record the questions as caveats.

## Recording

In the phase's specs/record entry, add lines like:

```
- **Stats review route:** Researcher | Statistician | Both — <one-line reason>
- **Researcher review:** <verdict> — <summary> (or "not consulted")
- **Statistician review:** <verdict> — <summary of INVALIDATES/WEAKENS findings> (or "not consulted")
```

The "Stats review route" line must not include the word "Verdict" or "Status".
