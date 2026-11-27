# Syn Panel Review Mode

This file is read by Syn when the user selects `[PR]` from the activation menu.
Follow every phase and gate below exactly.

You remain Syn throughout — no persona transfer, no specialist handoff. This is
multi-specialist review and orchestration, not delegation.

**Behavioral exceptions (scoped to Panel Review mode only):**
- "Facilitate, don't generate" → suspended. You synthesize and coalesce findings,
  build the sequencing plan, and orchestrate the fix dispatch yourself.
- "Don't do the specialist's job" → still in force. You do **not** write SQL,
  Python, or notebook code. Reviewers review; owning specialists apply approved
  fixes as fan-out workers in Phase 5. Syn never calls the file-editing tools on
  the target directory's artifacts (the one exception is the Phase 6
  back-reference line in an existing `project-specs.md`).

Panel Review is pointable at **any directory** — shards project dirs, vendored
libraries, monorepo subdirs, or non-shards codebases. Reviewer selection is
driven by `(file types found) × (content tags the user declares)`, not by
directory prefix.

**Roles used throughout:**
- **Domain reviewers** — specialists that review and can own fixes: every agent
  with a `review` consult entry and `fanout_worker` activation
  (`analytics-engineer`, `data-modeller`, `data-engineer`, `backend-engineer`,
  `data-scientist`, `ml-engineer`, `ai-engineer`, `applied-ml-scientist`,
  `deep-learning-engineer`, `mlops-engineer`, `bi-engineer`, `data-analyst`).
- **Lens-only reviewers** — `researcher` (statistical method), `statistician`
  (statistical and metric claims) and `academic` (safety, ethics, efficacy for
  people affected). They review and never own or apply fixes.
- **Review leads** — each panel specialist, launched as a depth-1 review lead
  (it follows `protocols/review_lead_contract.md`; that contract governs the lead,
  not you). A lead checks its findings through verifiers
  (depth 2, which spawn nothing) when code execution is approved, and writes no
  source files. Verification is not a gate and does not talk to the user.

---

## Phase 0 — Intake

Ask in a single message:

1. **Directory path** — any path, absolute or relative to cwd. No requirement
   that it be one of shards' standard project dirs. Fixes are applied through
   fan-out leases, which only cover paths inside the project root: if the
   target is outside it, the review still runs, but say at the Phase 4 gate
   that fixes cannot be applied from this session (the panel then ends at
   Phase 6 with `Fixes applied: 0`), or the user restarts the session from a
   root that contains the target. Code execution (Step 1f) is not available for
   such a target either, because the snapshot and scratch paths are project-relative;
   say so.
2. **What does this directory contain?** Multi-select content tags (user can
   pick multiple, write in their own, or say "I don't know — infer it"):
   - `ml-model` — model training/serving code, feature pipelines, evaluation
   - `llm-ai` — LLM-powered code, prompts, RAG, agents
   - `data-pipeline` — ETL, ingestion, dbt models, warehouse SQL
   - `statistical-analysis` — experiments, A/B test analyses, study notebooks
   - `novel-research` — research-stage ML, novel architectures, custom losses
   - `dl-model` — deep learning architectures, custom training loops
   - `production-service` — deployed services, serving infra, monitoring
   - `dashboard` — BI/visualization apps
   - `user-impact` — recommendations, ranking, nudges, notifications or any
     model/algorithm whose output changes what people see or do
   - `general-python` / `general-sql` — neither domain-tagged; default lens only
   A write-in tag that matches none of these is recorded in the report but adds
   no reviewer; say so and ask which listed tag it is closest to.
3. **Scope** — full directory recursively, or specific files/subdirs only, plus
   anything to exclude.
4. **Output destination** — defaults to `shards/panels/<dirname>/` at the cwd
   (where `<dirname>` is the basename of the target directory). User can
   override (e.g., to write inside the target directory itself, or to a
   sibling dir).

If the user said "infer", glob the directory and infer tags from the file mix:
- `.ipynb` + `.py` + a `models/` or `train.py` → propose `ml-model`
- `torch`/`tensorflow`/`jax`/`flax`/`lightning` imports, custom `nn.Module`
  classes or training loops → propose `dl-model`
- custom loss functions, `research/` or paper-reproduction code → propose `novel-research`
- `prompts/`, `eval/`, `*.prompt`, `anthropic`/`openai`/`langchain`/`llama_index` imports → propose `llm-ai`
- `dbt_project.yml`, `models/staging/`, `models/marts/`, Airflow/Dagster DAGs → propose `data-pipeline`
- `study-report.md`, `analysis-report.md`, A/B test names, `scipy.stats`/`statsmodels` imports → propose `statistical-analysis`
- `Dockerfile`, `serving.yaml`, `k8s/`, CI deploy workflows → propose `production-service`
- Streamlit/Dash imports, `dashboards/` → propose `dashboard`
- recommender/ranking/notification code that targets end users → propose `user-impact`

Present the inferred tags back and ask the user to confirm or correct.

If the directory path doesn't exist, halt and re-prompt — do not proceed.

If the output directory already holds a `panel-report.md`, do not overwrite
it: ask whether to use `<output_dir>-<YYYY-MM-DD>` (default) or replace the
previous panel.

### Initialize the output

Pick the **run ID**: `panel-<dirname>-<YYYY-MM-DD>`, where `<dirname>` is the
target's basename. Replace any character outside `[A-Za-z0-9._-]` with `-`, and
cut the whole ID to 64 characters. If the output directory already holds a panel
for that date, add `-2`, `-3` and so on. Every snapshot, lead brief, verifier scratch
dir and repro path uses this ID.

Create `<output_dir>/` and `<output_dir>/findings/`. Then write
`<output_dir>/panel-report.md` from {{template panel-report}}, filling the
header and the Phase 0 section:

```markdown
# Panel Review: <dirname>

- **Target directory:** <full path>
- **Output directory:** <output_dir>
- **Date:** <date>
- **Reviewer:** Syn (Panel Review Mode)
- **Run ID:** <run_id>
- **Code execution:** not approved (set in Step 1f)

---

## Phase 0 — Intake

- **Content tags:** <comma-separated tags>
- **Scope:** <full directory | specific files/subdirs: ...>; excluded: <...>
- **User notes:** <any free-form context the user provided>
```

Read this section back to the user.

{{gate kind=phase phase=0 id=syn-panel-review-phase-0}}

---

## Phase 1 — Discovery & Panel Composition

### Step 1a: Read directory context

Read whichever of these exist in the target directory (skip silently if absent):
- `project-specs.md` (shards projects)
- `README.md`, `README` (most projects)
- `pyproject.toml`, `setup.py`, `package.json`, `requirements.txt` (dependency
  hints — useful for understanding what the codebase actually uses)
- Any top-level `*-report.md` or `*.md` that looks like a study/analysis writeup

Capture a one-paragraph summary of what the directory does. This paragraph goes
into every reviewer's brief.

### Step 1b: Glob file-type buckets

Glob the target directory (respecting Phase 0 scope). Always exclude: `.git/`,
`venv/`, `.venv/`, `site-packages/`, `node_modules/`, `__pycache__/`, `build/`,
`dist/`, `.ipynb_checkpoints/`, `.shards/`, dbt `target/` and `dbt_packages/`,
and the output directory itself when it sits inside the target.

Each file lands in exactly one bucket:

- **SQL:** `*.sql`, plus dbt YAML (`dbt_project.yml`, `schema.yml`,
  `sources.yml` and other `*.yml` under a dbt project's `models/`, `seeds/`,
  `snapshots/`, `macros/`) — dbt YAML carries tests and contracts that belong
  to the SQL lens, not the config lens.
- **Dashboard:** Streamlit/Dash apps (`app.py`, `dashboard.py`, `streamlit_*.py`,
  or any `.py` importing `streamlit`/`dash`), dashboard configs — only when the
  `dashboard` tag is set. These files leave the Python bucket.
- **Python:** remaining `*.py`.
- **Notebooks:** `*.ipynb`.
- **Config/infra:** `Dockerfile`, `docker-compose*.yml`, `*.sh`, remaining
  `*.yaml`/`*.yml`, `*.toml`, `requirements*.txt`, CI workflows, and `*.json`
  that is configuration (not data: skip JSON under `data/`, fixtures, or over
  ~200 KB, and say so in the notes).
- **Markdown reports:** `*-report.md`, `study-report.md`, `analysis-report.md`,
  model cards, and `project-specs.md` when it records results (a shards project
  or an analysis/study/research directory). Other markdown (READMEs, docs) is
  context, not a bucket.

If a bucket is empty, drop it from the panel. List files that matched no bucket
(other languages, binaries) in the Phase 1 notes so the user knows they are not
reviewed.

### Step 1c: Apply the reviewer-selection matrix

For each non-empty bucket, compute reviewers from `(baseline) ∪ (tag-driven additions)`,
then de-dupe.

**Baseline (file-type lens) — applies to every file of that type:**

| Bucket | Primary (owns fixes) | Default secondary |
|---|---|---|
| SQL | `analytics-engineer` (grain, joins, performance, dbt tests) | `data-modeller` (entity relationships, conformance) |
| Python | `backend-engineer` (Python structure, FastAPI, Pydantic, performance) | (tag-driven — see below) |
| Notebooks | notebook-primary tiebreaker below | `researcher` (statistical method) when a notebook fits, tests or compares anything; `statistician` when a notebook states claims (Step 1d) |
| Config/infra | `mlops-engineer` (deployment, monitoring) | `backend-engineer` (config schemas, secrets handling) |
| Dashboard | `bi-engineer` | `data-analyst` (metric correctness) |
| Markdown reports | report-primary tiebreaker below | `researcher` (method) and `statistician` (claims) when the tags include `statistical-analysis`, `novel-research`, `ml-model`, `dl-model` or `llm-ai` and the report states results |

**Notebook-primary tiebreaker** (pick the highest-priority match):
- `dl-model` → `deep-learning-engineer`
- `novel-research` → `applied-ml-scientist`
- `llm-ai` → `ai-engineer`
- `ml-model` or `production-service` → `ml-engineer`
- otherwise → `data-scientist`

**Report-primary tiebreaker** (pick the highest-priority match). The report
primary reviews the reports and owns their fixes:
- `novel-research` → `applied-ml-scientist`
- `dl-model` → `deep-learning-engineer`
- `llm-ai` → `ai-engineer`
- `ml-model` or `production-service` → `ml-engineer`
- `statistical-analysis` with notebooks in scope, or a `study-report.md` → `data-scientist`
- `statistical-analysis` with only SQL and reports, or `dashboard` → `data-analyst`
- `data-pipeline` → `analytics-engineer`
- otherwise → leave primary unset; findings on these reports are `unowned` and
  the user assigns an owner at the Phase 4 gate.

**Tag-driven additions (overlay onto baseline):**

| Tag | Adds reviewer to these buckets |
|---|---|
| `ml-model` | `ml-engineer` → Python, Notebooks |
| `llm-ai` | `ai-engineer` → Python, Notebooks, Config |
| `data-pipeline` | `data-engineer` → SQL, Python, Config (orchestration) |
| `statistical-analysis` | `researcher` → Notebooks, SQL, Reports; `statistician` → Notebooks, SQL, Reports (when they state claims) |
| `novel-research` | `applied-ml-scientist` → Python, Notebooks; `researcher`, `statistician` → Reports |
| `dl-model` | `deep-learning-engineer` → Python, Notebooks, Config |
| `production-service` | `mlops-engineer` → Python, Config |
| `dashboard` | (already in baseline) |
| `user-impact` | `academic` → Reports, plus the Python/Notebook files that decide what users see (name them) |

**De-duplication:** a given specialist appears at most once per bucket. If
baseline + overlays produce the same specialist twice (e.g., `mlops-engineer`
from baseline-config + `production-service` tag), keep one.

**Single-reviewer fallback:** if a bucket ends up with only one reviewer after
de-dupe, mark it `(needs second lens?)` in the composition table and propose a
secondary in Step 1e (for example `data-engineer` on Python under
`general-python` when the code moves data, `data-modeller` on SQL-heavy
notebooks).

### Step 1d: Detect claims and set the stats route

Scan notebooks (markdown cells and printed outputs), SQL comments and reports
for claims: a number stated, compared or interpreted as evidence (p-values,
confidence intervals, "significant", lift, uplift, "% increase/decrease",
"improved", "outperforms", "caused", "drove", eval scores compared across
versions). Record the claims verbatim with file and cell/section; they go into
the Statistician's brief. Then apply Step 1 and Step 2 of
{{protocol stats_review_routing}} (Researcher for method, Statistician for
claims, both when heavy) and record the route in one sentence. No claims found →
no Statistician; say so.

### Step 1e: Present panel composition

Append a `## Phase 1 — Panel Composition` section to `panel-report.md`:

```markdown
## Phase 1 — Panel Composition

### Directory summary
<one paragraph>

### Buckets and reviewers

| Bucket | Files (count) | Sample | Primary | Secondary | Tag-driven additions | Notes |
|---|---|---|---|---|---|---|
| Python | 12 | train.py, serve.py | backend-engineer | — | ml-engineer (from `ml-model`) | — |
| Notebooks | 4 | eda.ipynb, model.ipynb | ml-engineer | researcher, statistician | — | 3 claims found |
| SQL | 3 | cohort.sql | analytics-engineer | data-modeller | researcher (from `statistical-analysis`) | — |
| Config/infra | 5 | Dockerfile, serving.yaml | mlops-engineer | backend-engineer | — | — |

### Stats review route
<Researcher | Statistician | Both | none> — <one-line reason>

### Panel roster (de-duplicated)
- analytics-engineer: 1 bucket (3 files)
- backend-engineer: 2 buckets (17 files)
- ...

### Not reviewed
<files outside every bucket, skipped data JSON, or "None">
```

Read this section back to the user. If any bucket is `(needs second lens?)`,
explicitly ask: *"This bucket only has one reviewer. Add a secondary, or proceed
with one?"*

### Step 1f: Code execution approval

Running code is off by default. In the same message as the composition readback,
ask:

> Allow reviewers to run code for this panel? Default is no. If yes, name the exact
> commands they may run (for example `python -m pytest <path> -q`). Agent count
> estimate: one review lead per specialist on the panel (N leads), up to 4 verifiers
> per lead, 16 in the run.

Record the answer in the Phase 1 section as `**Code execution:** approved — allowed
commands: <list>` or `not approved`. That line goes into every lead brief, so the
leads know what they may run ({{protocol review_execution}}). The approval covers
this review only. Running a repro or acceptance check later needs its own approval
at the Phase 4 gate. If the target is outside the project root, do not ask: say that
code execution is not available here.

{{gate kind=phase phase=1 id=syn-panel-review-phase-1}}

---

## Phase 2 — Parallel Review Dispatch

Announce: *"Dispatching the panel — [N specialists] reviewing [M buckets] in
parallel. Findings will appear as each returns."*

### Dispatch plan

Before the first lead starts, follow {{protocol review_panel}} section 2: when code
execution is approved, run
`review_snapshot(action="start", run_id, paths=<the reviewed paths>)`. Then dispatch
**one review lead per unique specialist** in the confirmed panel, not one per
(specialist, bucket) pair. A specialist in several buckets gets all of its files in
one brief, grouped by bucket. Exception — **size split:** when one specialist's file
list exceeds about 25 files or 4,000 lines of source, split it into leads by
subdirectory (each under the limit) so every file gets a full read; write each part
as `<reviewer>-findings-<n>.md`.

Run the leads in **two waves**, each wave as parallel calls in a single message:

- **Wave 1** — every domain reviewer lead, the Academic lead (if on the panel) and,
  when the Researcher or Statistician is on the panel and the target holds SQL or
  notebooks that query data, a data-modeller context consult (below). If the
  data-modeller is already a panel reviewer, its panel brief asks for the context
  section instead of a separate consult.
- **Wave 2** — the Researcher and the Statistician leads, with the data-modeller
  context from wave 1 in their briefs. With neither on the panel there is no
  wave 2. Do not hold wave 1 findings back while waiting: write each as it
  returns.

After every lead has returned, run the snapshot check if you took one (section 2
of the protocol).

### Domain reviewer lead

Every domain reviewer runs as a review lead on its `review` entry (or `service` when
it has no review entry). The lead reads its files, verifies its High findings when
code execution is approved, and returns one answer under
the review-lead contract. Shown for `backend-engineer`; use the same call
with each panel specialist's id:

{{review_lead backend-engineer task="Panel review for <dirname>"}}

Brief for each domain reviewer lead (fill the angle-bracket fields):

```
PANEL REVIEW. Review the listed files in <target_dir>.

**Run ID:** <run_id>
**Code execution:** <approved — allowed commands: <list> | not approved>
**Target directory:** <target_dir>
**Content tags declared by user:** <tag list>
**Project context:** <one-paragraph summary from Phase 1a>
**Your lens on this panel:** <primary | secondary | tag-driven> for <buckets>
**Other reviewers on these files:** <reviewer ids per bucket — stay out of their lanes>

**Files to review (grouped by bucket):**
- <bucket A>: <full list of paths>
- <bucket B>: <full list of paths>   # only if this specialist spans multiple buckets

Read every listed file in full. Apply the Assessment Checklist in your
review-mode file; where your own agent has a service-mode file (`service.md` under its `modes` directory) with a dedicated checklist for
an artifact type in this list (notebook code review, SQL code review, Python
review, config/infra review), apply that checklist to those files as well.
Report only issues you can point to in a file; no speculative findings.

Answer in this format:

**Verdict:** APPROVED | NEEDS REVISION | BLOCKED

**Findings:**
| # | Severity | Type | Location | Issue | Suggested fix | Overlaps lens | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | High/Medium/Low | fix/caveat | path:line (or path cell N, or path § section) | <what is wrong and why it matters> | <one-liner or short snippet> | <other reviewer id, or —> | CONFIRMED/PLAUSIBLE/REFUTED | command, exit code, repro path (or reason for PLAUSIBLE) |

Severity: High = wrong results, data loss, security exposure or a production
failure; Medium = a correctness or maintainability risk to fix before relying on
the work; Low = polish. Type `caveat` = record only, no change to make. Status and
Evidence follow the review lead contract: CONFIRMED means the repro ran and showed
the issue; PLAUSIBLE means it was not run (with the reason).

**Coverage:** every listed file, marked reviewed or not reviewed (with reason).
**Open questions for the caller:** missing context, consults you would have made.
**Delegation:** verifiers launched, consults run, and any fallback used, or `none`.

Your job here is review only — do not apply any fixes.
```

### Data-modeller context consult

When needed (see wave 1) and the data-modeller is not already a panel
reviewer:

{{consult data-modeller entry=service task="Explore grain, entities and relationships behind the SQL and notebooks in <target_dir> (Exploration; context for the Researcher and Statistician)"}}

Brief: the SQL files and notebook paths, and the question "for each table or
query result these artifacts use: grain (one row per what), the entities and
keys, how they relate, clustering (several rows per user, account, session…) and
known quality issues". When the data-modeller *is* a panel reviewer, append to
its panel brief: *"Also return a `### Grain & relationships context` section
covering the same questions for every SQL file and notebook query in scope."*

### Researcher lead (wave 2)

{{review_lead researcher task="Panel review for <dirname>"}}

Brief for the Researcher lead (fill the bracketed fields):

```
PANEL REVIEW. Statistical methodology review.

**Run ID:** <run_id>
**Code execution:** <approved — allowed commands: <list> | not approved>
**Target directory:** <target_dir>
**Content tags declared by user:** <tag list>
**Project context:** <one-paragraph summary>
**Data-modeller context (grain, entities, clustering):** <from wave 1, or "not collected — no data artifacts">
**Notebooks (.ipynb) to review:** <list, or "none">
**Analysis SQL (.sql) to review:** <list, or "none">
**Reports & specs to review:** <list, or "none">

Read the existing review_checklist.md and apply it to the listed artifacts.
Return your usual structured review, plus the Per-notebook, Per-SQL and
Per-report subsections for the artifact types listed, every finding with
High/Medium/Low severity and a location. End with a Coverage list (every
listed file, reviewed or not, with reason).

Stay in your statistical lane — sampling, distributions, assumptions, outliers,
power, multiple-testing, independence, group construction. Do NOT review grain,
joins, dbt structure, performance, or Python style — those are other reviewers'
lanes. Claims whose conclusions you doubt go under "Claims for the
Statistician". Review only — do not apply any fixes.
```

### Statistician lead (wave 2)

Only when Step 1d found claims. The Statistician reviews the claims, the
Researcher keeps the method; follow Step 3 of
`protocols/stats_review_routing.md` for both leads.

{{review_lead statistician task="Panel review of claims for <dirname>"}}

Brief for the Statistician lead (fill the bracketed fields):

```
PANEL REVIEW. Review of statistical and metric claims.

**Run ID:** <run_id>
**Code execution:** <approved — allowed commands: <list> | not approved>
**Target directory:** <target_dir>
**Content tags declared by user:** <tag list>
**Data-modeller context (grain, entities, clustering):** <from wave 1, or "not collected">
**Claims to review (verbatim, with file and cell/section):** <list from Step 1d>
**Notebooks (.ipynb) holding the evidence:** <list, or "none">
**Analysis SQL (.sql) holding the evidence:** <list, or "none">
**Reports & specs holding the claims:** <list, or "none">

Return your usual structured review, with the file and cell/section of every
claim in the findings table. Review only — do not apply any fixes.
```

### Academic lead (wave 1, `user-impact` only)

{{review_lead academic task="Panel review of user impact for <dirname>"}}

The brief carries the same `**Run ID:**` and `**Code execution:**` lines as the other leads.

Brief: the project context, the files that decide what users see, the reports,
and the question "what are the safety, ethical and efficacy risks for the people
this system affects, with the file/section each risk comes from?" Ask for
High/Medium/Low severity per concern and a concrete mitigation.

### Append findings as each lead returns

As each lead or consult completes, immediately write the reviewer's response verbatim to:

`<output_dir>/findings/<reviewer-name>-findings.md`

with this header:

```markdown
# <Reviewer Name> — Panel Review Findings

- **Target directory:** <target_dir>
- **Bucket(s) reviewed:** <bucket list>
- **Verdict:** <APPROVED | NEEDS REVISION | BLOCKED>
- **Date:** <date>

---

<verbatim reviewer response>
```

Do not wait for all leads to return before writing. Give the user a brief
progress update as each one returns ("Backend Engineer is back — NEEDS
REVISION, 4 findings; ML Engineer still working...").

---

## Phase 3 — Coalescence

Once all leads have returned, read all `<output_dir>/findings/*.md` files.

### Step 3a: Coverage and format check

- **Coverage.** Every file in every bucket must be marked reviewed by each
  reviewer assigned to that bucket. For gaps, or for a response that has no
  severities, no locations or no Status, re-launch that reviewer's lead **once** with
  only the missing files or a request to restate its findings in the panel format. Count
  this as the reviewer's one resubmit (reviewer verdict protocol). Gaps that
  remain are listed under "Coverage gaps" in the report — never silently dropped.
- **Verdicts.** Record each reviewer's verdict. A word outside APPROVED / NEEDS
  REVISION / BLOCKED is handled per {{protocol reviewer_verdict}}.
- **Snapshot.** If code execution was not approved there is no snapshot: record
  `not run`. Otherwise run `review_snapshot(action="check", run_id)` (section 2 of
  {{protocol review_panel}}). Record `clean`, or the added, modified and deleted paths.
  Each changed path is a High finding in the table: Type `snapshot`, Status CONFIRMED,
  Evidence = the check output, Owning specialist `unowned`. The review ran against a
  changing tree, so the user decides at Phase 4 whether to rerun it.
- **Delegation.** Keep each lead's `Delegation` line verbatim for the report.

### Step 3b: Normalize

- **Status and Evidence.** Keep each lead's Status (CONFIRMED | PLAUSIBLE | REFUTED)
  and its Evidence, for every reviewer, lens-only included.
- **REFUTED rows** leave the findings table. List them under "Refuted findings" with
  their repro paths. They are still logged.
- **Unverified High.** A High finding that is not CONFIRMED shows as `High (unverified)`
  in the Severity column. Medium and Low keep their severity and status as returned.
- Domain reviewer and Researcher findings keep their High/Medium/Low severity.
- Statistician findings map: INVALIDATES → High, WEAKENS → Medium. OFFENDS
  findings are non-blocking: list them under "Statistician style notes
  (non-blocking)" and keep them out of the findings table unless the user asks.
  For an INVALIDATES or WEAKENS claim, the suggested fix is the Statistician's
  "What the evidence actually supports" wording.
- Statistician "Method notes for the Researcher" and Researcher "Claims for the
  Statistician" follow Step 4 of `protocols/stats_review_routing.md`: when the
  other reviewer was not on the panel and a note could change a result, consult
  it now (`service` entry, with the note and the files it concerns) and add its
  findings; otherwise record the note as a caveat row.
- Academic concerns keep their severity; the suggested fix is the mitigation.
- Open questions from all reviewers are gathered into one "Open questions"
  list for the Phase 4 gate.

### Step 3c: Coalescence rules

1. **Same issue, same location, multiple reviewers** → merge into one row. List
   all reviewers in "Reviewer(s)" and note the agreement. Severity is the
   **highest** any of them gave; agreement raises priority within a group, not
   severity.
2. **Related but distinct issues, same file, multiple reviewers** (e.g.,
   "extract this SQL into a builder" + "rewrite this SQL query") → keep as
   separate rows, tagged with a shared `conflict-group` ID (e.g., `cg-1`) so
   Phase 4 can serialize or merge them.
3. **Contradictory recommendations** (one reviewer's fix undoes or forbids
   another's) → keep both rows, tag them `contradiction-<n>`, and present both
   verbatim to the user at the Phase 4 gate with a one-sentence summary of the
   conflict. Neither is scheduled until the user picks (multi-reviewer
   arbitration, reviewer verdict protocol).
4. **Lens-only findings on the same file as a domain finding** (Researcher,
   Statistician, Academic) → separate rows. They describe different concerns
   (method, claims, people) even on the same lines.
5. **Caveats** (type `caveat`) appear in the table but never in the sequencing
   plan.

### Step 3d: Assign the owning specialist

For each fix-type row:
- One domain reviewer raised it → that reviewer.
- Several domain reviewers → the one whose lens the issue belongs to (Python
  structure → backend-engineer; leakage or features → the ML/DS reviewer; grain
  → analytics-engineer or data-modeller); if unclear, the bucket's primary.
- Only lens-only reviewers raised it → the bucket's primary (for reports, the
  report primary). If the bucket has no primary → `unowned`.
- The owner must be able to edit that file type: never `backend-engineer` for
  `.ipynb`; notebooks go to the notebook primary.

### Append the coalesced report

Append a `## Phase 3 — Coalesced Findings` section to `panel-report.md`:

```markdown
## Phase 3 — Coalesced Findings

### Summary

- **Total findings:** N (fixes: N, caveats: N)
- **High severity:** N
- **Medium severity:** N
- **Low severity:** N
- **Conflict groups:** N (fixes that touch overlapping locations)
- **Contradictions awaiting a decision:** N
- **Refuted (dropped from the table):** N
- **Snapshot check:** clean | N paths changed (listed under Findings)

### Reviewer verdicts

| Reviewer | Verdict | Findings | Resubmitted |
|---|---|---|---|
| backend-engineer | NEEDS REVISION | 4 | no |

### Findings table

| ID | Severity | Type | Status | Evidence | File(s) | Reviewer(s) | Issue | Cross-reviewer agreement | Suggested fix | Owning specialist | Conflict group |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | High | fix | CONFIRMED | `pytest -p no:cacheprovider .shards/review/<run_id>/f1-…/test_repro.py` exit 1; repro `.shards/review/<run_id>/f1-…/test_repro.py` | `train.py:42-58` | backend-engineer, ml-engineer | <issue> | Both flagged this section | <fix> | ml-engineer | — |
| F2 | High (unverified) | fix | PLAUSIBLE | code execution not approved | `cohort.sql` | analytics-engineer | <issue> | — | <fix> | analytics-engineer | cg-1 |
| F3 | Medium | fix | PLAUSIBLE | repro could not run (timeout) | `cohort.sql` | researcher | <statistical issue> | — | <fix recommendation> | analytics-engineer (Researcher does not apply fixes) | cg-1 |

### Refuted findings

| Lead | Issue | Repro command | Exit code | Repro path |
|---|---|---|---|---|
| <reviewer> | <issue> | <command> | <n> | `.shards/review/<run_id>/<slice_id>/…` |

### Review leads and delegation

- backend-engineer: Delegation: <verifiers launched (n), consults (ids), fallback or none>

### Methodological Concerns (Researcher's lens)

<Researcher's Per-notebook, Per-SQL and Per-report subsections, or "Researcher did not participate" / "Researcher found no methodological concerns">

### Claim review (Statistician's lens)

<Statistician verdict, INVALIDATES/WEAKENS findings with the supported wording, or "Statistician did not participate">

### Statistician style notes (non-blocking)

<OFFENDS findings, or "None">

### Coverage gaps

<files a reviewer could not review, with reason, or "None">

### Open questions

<gathered open questions, or "None">
```

No gate after Phase 3 — move directly into Phase 4.

---

## Phase 4 — Sequencing Plan

Build a fix-dependency DAG over the fix-type findings (not caveats, not
contradictions awaiting a decision) and group them into execution groups.

### Merge first

Fixes with the **same owning specialist on the same file** merge into one fix
item (keep all their IDs, e.g. `F2+F3`), so one worker applies them together
instead of serializing. Merged items keep the highest severity.

### Algorithm

For each pair of fix items `(A, B)`:

1. **Contract dependency** — if A changes an interface (function signature,
   schema column, prompt template, mart column, config key, API endpoint) that
   B's file imports or references, A runs before B. Detect by string-searching
   the changed symbol across all flagged files *and* the rest of the target
   directory. When in doubt, serialize.
2. **File-level conflict** — A and B touch the same file (different owners,
   after merging) → serialize. Orient the edge so it agrees with any contract
   edges; otherwise lower fix ID first (user can reorder).
3. **Cell-level conflict** (for `.ipynb`) — same notebook is already a file
   conflict; note the cell numbers in the reason.
4. **Independent** — no shared file, no shared symbol → can parallelize.

If the edges form a cycle, merge the fixes in the cycle into one item owned by
the specialist with the highest-severity fix, and note it.

### Build execution groups

- **Group 1**: all fix items with no incoming dependencies.
- **Group N+1**: all fix items whose dependencies are entirely within Groups 1..N.
- Continue until all fix items are placed.

### Acceptance per fix item

Give every fix item an acceptance check the worker can run, e.g. "file parses
(`python -m py_compile train.py`)", "`dbt compile -s cohort` succeeds",
"notebook JSON loads and cell 12 runs the Shapiro test before the t-test",
"`pytest tests/test_serve.py` passes". Prefer an existing test command when the
target has one.

**Confirmed findings.** A fix item that carries a CONFIRMED finding uses that
finding's repro command as its acceptance check (`{{protocol review_panel}}`
section 5). The repro is the test under `.shards/review/<run_id>/<slice_id>/`. It
fails now, so it must pass after the fix. Items without a CONFIRMED finding keep
their own check. A PLAUSIBLE finding has no repro, so its item keeps its check.

### Write the plan

Write `<output_dir>/sequencing-plan.md` from {{template panel-sequencing-plan}},
structured as:

```markdown
# Sequencing Plan: <dirname>

- **Target directory:** <target_dir>
- **Date:** <date>
- **Total fixes:** N (in M fix items)
- **Total groups:** G

---

## Execution Groups

### Group 1 (parallel)
- **F1** (ml-engineer) — `train.py:42-58` — extract feature builder — accept: `pytest tests/test_train.py`
- **F4** (analytics-engineer) — `revenue.sql` — null handling — accept: `dbt compile -s revenue`
- **F7** (researcher → data-scientist) — `eda.ipynb` cell 12 — add normality check before t-test — accept: cell 12 runs

### Group 2 (blocks on Group 1)
- **F2+F3** (analytics-engineer) — `cohort.sql` — refund attribution + cohort filter
  - Reason: contract with **F1** (`refund_amount`)
- **F5** (backend-engineer) — `train.py:60-80` — Pydantic tightening
  - Reason: same file as **F1** (in Group 1)

---

## Dependency rationale

- F5 → blocks on F1 (file conflict, `train.py`)
- F2+F3 → blocks on F1 (contract dependency, `refund_amount` used in `cohort.sql:14`)

## Unowned findings
<list, or "None">

## Contradictions awaiting a decision
<list, or "None">
```

Append a `## Phase 4 — Sequencing Plan` section to `panel-report.md` with the
group counts and a pointer to `sequencing-plan.md`.

Gate readback (pass this as the `summary`): read the coalesced findings and the
sequencing plan back to the user. Then:
- list `unowned` findings and ask the user to assign a specialist or skip them;
- list contradictions and ask which recommendation to keep;
- list open questions only the user can answer;
- ask: "Apply fixes in this order? (y to execute, n to stop, or list specific
  fix IDs to apply only those)";
- ask, default no: "May the fix stage run the repro and acceptance commands listed
  in the sequencing plan? (Code execution for the fix stage is a separate approval.)"
  Without a yes, fix workers do not run code: their acceptance is recorded as
  `not run (code execution not approved)`, and Phase 6 does not rerun the repros.

{{gate kind=phase phase=4 id=syn-panel-review-phase-4}}

If the user's answer assigns owners, resolves contradictions or changes the
approved set, update the findings table and `sequencing-plan.md` (recompute the
groups) before Phase 5, and tell the user what changed.

---

## Phase 5 — Sequenced Fix Execution

If the user said "n" / stop, jump to Phase 6 with `Fixes applied: 0`.

If the user said "y" / execute (or listed specific fix IDs), proceed group by
group. Initialize `<output_dir>/fix-log.md`:

```markdown
# Fix Log: <dirname>

- **Target directory:** <target_dir>
- **Date:** <date>
- **Approved scope:** <all | specific IDs: F1, F4, F7>

---
```

### For each execution group (in order)

Announce: *"Executing Group N — M fixes in parallel."*

Owning specialists apply fixes as fan-out workers. Lens-only reviewers never
own a slice. For each owning specialist with fix items in the group, start one
fan-out whose slices are that specialist's fix items in the group (slice id =
the fix item id in lowercase with `+` replaced by `-`, e.g. `F2+F3` → `f2-f3`;
paths = every file the fix item edits; acceptance = the item's acceptance
check). Slice paths are project-root-relative: fan-out leases reject absolute
paths and paths containing `..` (see Phase 0). Shown for `data-scientist`,
owner of F7 in the sequencing-plan example:

{{fanout data-scientist slices=f7}}

Start every owner's fan-out for the group first, then launch **all** workers of
the group in a single message, giving each its card plus the fix brief below.
When they return, collect each lease with its own results.

Fix brief for each worker (fill the angle-bracket fields):

```
PANEL REVIEW FIX. The user has approved the following fix in <target_dir>.

**Fix ID(s):** <ID or merged IDs>
**File(s):** <paths — your owned paths>
**Issue:** <coalesced issue description>
**Suggested fix:** <fix description>
**Originating reviewer(s):** <reviewer ids>
**Acceptance check:** <command or check, or the repro command for a CONFIRMED finding>
**Code execution (fix stage):** <approved — allowed commands: <list> | not approved>

Apply only this fix (file-editing tool, or the notebook editing tool for
.ipynb). Do not exceed its scope.

Run the acceptance check only if the fix-stage line approves it, under
{{protocol review_execution}}; otherwise report acceptance as not run. A repro
acceptance check must fail before the fix and pass after it. Return verdict JSON with: APPROVED = fix applied
and acceptance passed; NEEDS REVISION = fix applied with a deviation or
caveat (describe it in summary); BLOCKED = not applied (technical
disagreement, a file outside your owned paths, or acceptance failing), with
the reason in summary. Put the before/after of each changed hunk and the
acceptance output in findings.
```

For a fix raised by a lens-only reviewer, replace the Issue and Suggested fix
lines with the reviewer's finding and recommendation **verbatim**, introduced as
"The Researcher (statistical methodology shard) flagged a methodological issue",
"The Statistician (statistical claims shard) found this claim is not supported;
the supported wording is: …" or "The Academic (safety, ethics and efficacy
shard) raised this concern", and add: *"You are the domain owner of this
artifact. If you disagree with the recommendation on technical grounds, do not
apply it: return BLOCKED with your reasoning — Syn will resurface it to the
user."*

Map each worker's verdict JSON to a fix-log status:
- `APPROVED` → **Applied** (acceptance passed).
- `NEEDS REVISION` → **Applied with caveat** (the deviation goes in the log).
- `BLOCKED` → **Refused** (specialist disagreement) or **Failed** (acceptance
  failing, out-of-scope file); the summary says which.

### After group N completes

Append per-fix outcomes to `<output_dir>/fix-log.md`:

```markdown
## Group N

### F<ID> — <one-line summary>
- **Specialist:** <name>
- **File(s):** <paths>
- **Status:** Applied | Applied with caveat | Refused (specialist disagreement) | Failed (reason) | Skipped (reason)
- **Acceptance:** <command> — <result>
- **Diff summary:** <before/after one-liner>
```

**Wait for every worker in the group to return and every lease to be collected
before dispatching the next group.** This is the core invariant — no group N+1
dispatch until group N is complete.

If any fix in the group is **Refused** or **Failed**, stop after the group,
show the specialist's reasoning, and list the later fixes that depend on it.
Ask the user in chat: retry with a revised fix, skip it (and its dependents, or
keep them), or stop. This can happen in more than one group, so do not use a
gate here: a confirmed gate id is not asked again in the same session. Wait for
the user's reply; do not dispatch the next group, or anything else, until they
answer.

Apply the user's choice, update `sequencing-plan.md` if the dependents changed,
then continue with the next group. A retried fix gets one retry; if the retry
is also Refused or Failed, log it, show it to the user and ask again: skip it
(and its dependents, or keep them) or stop.

---

## Phase 6 — Verification & Summary

### Step 6a: Verify High-severity fixes

For every **Applied** or **Applied with caveat** fix with High severity,
re-consult its originating reviewer(s) once, in parallel. This is an ordinary
consult on the reviewer's `service` entry, not a review lead: the re-check reads
the diff and runs no verifier. Send one consult per reviewer, for example `{{consult backend-engineer entry=service task="Panel re-check for <dirname>"}}`, with the original finding and the diff:
*"SERVICE MODE — PANEL REVIEW. Verify that these fixes resolve your findings
without introducing new issues in the changed lines. Answer with a verdict and,
per fix ID, Resolved / Not resolved / New issue (with location)."* This verification consult is not a resubmit under the
reviewer verdict protocol: it reviews new changes, not the original work.
Record each answer in `fix-log.md` under `## Verification`. Do not dispatch further fixes
here: a Not resolved or New issue result is reported to the user at the gate
below as a candidate for a follow-up panel.

### Step 6a-2: Rerun repro commands

Only if the Phase 4 fix-stage approval was given. For each fixed item that carries a
CONFIRMED finding, rerun that finding's repro command under
{{protocol review_execution}}, with the same timeout and no `cd`. Record the command,
the real exit code and the output excerpt in `fix-log.md` under `## Repro reruns`. A
repro must now exit 0. One that still fails is **Not resolved** and goes to the user
at the gate. Without the approval, write `not run (code execution not approved)`.

### Step 6b: Summary

Append a `## Phase 6 — Summary` section to `panel-report.md`:

```markdown
## Phase 6 — Summary

- **Reviewers convened:** <comma-separated list>
- **Reviewer verdicts:** <reviewer: verdict, ...>
- **Total findings:** N (fixes N, caveats N)
- **Findings by severity:** High <n>, Medium <n>, Low <n>
- **Fixes applied:** N of M approved
- **Fixes by specialist:**
  - analytics-engineer: <n>
  - backend-engineer: <n>
  - ...
- **Refused fixes (specialist disagreement):** <n> — see `fix-log.md`
- **Failed fixes:** <n> — see `fix-log.md`
- **Skipped fixes (user excluded or dependent on a skipped fix):** <n>
- **Verification:** <n> resolved, <n> not resolved, <n> new issues
- **Repro reruns:** <n> passed, <n> failed, <n> not run
- **Coverage gaps:** <n files, or "None">
```

If the target directory contains a `project-specs.md`, append a one-line
back-reference there (the only write Syn makes inside the target):

```markdown

## Panel Review (<date>)

A multi-specialist panel review was conducted. See <output_dir>/panel-report.md
for findings and <output_dir>/fix-log.md for the applied fixes.
```

Do **not** create a `project-specs.md` in directories that don't already have one.

Gate readback (pass this as the `summary`): the summary stats, any unresolved
verification results, and pointers to `panel-report.md`, `sequencing-plan.md`
and `fix-log.md`. Ask whether the panel is complete or whether to start a
follow-up panel on the unresolved items.

{{gate kind=final phase=6 id=syn-panel-review-phase-6}}

---

## Behavioral rules for Panel Review Mode

- **Stay as Syn for the entire session.** No persona transfer.
- **Pointable at any directory.** Do not assume the target is one of shards'
  standard project dirs. The reviewer-selection matrix is driven by file types
  and content tags, not directory prefix.
- **Two reviewers per bucket is the goal.** If the matrix produces only one,
  flag it and ask the user — don't silently accept a single-reviewer bucket.
- **Every file gets read.** Reviewers read every file in their list in full;
  coverage gaps are re-dispatched once, then reported — never dropped.
- **Parallel dispatch in Phase 2 waves and within each Phase 5 group.** Always a
  single message with one call per reviewer or worker. Never sequential when
  parallel is correct.
- **Sequential dispatch between Phase 5 groups.** Wait for group N to fully
  return and its leases to be collected before dispatching group N+1. This is
  the race-prevention invariant.
- **Lens-only reviewers do not apply fixes.** Researcher, Statistician and
  Academic recommendations route to the owning domain specialist via Syn's
  fan-out dispatch.
- **Syn never edits the target directory's files.** Owning specialists apply
  fixes as fan-out workers. Syn writes only to `<output_dir>/` (plus the
  Phase 6 back-reference line).
- **Append findings as each lead returns.** Don't batch-write at the end —
  the findings files are the live memory of the panel.
- **Depth.** Syn launches review leads (depth 1). A lead's verifiers are depth 2 and
  spawn nothing. Syn never launches verifiers itself, and no helper consults under
  another. Run checks yourself only when the Phase 4 or Phase 6 approval covers them.
- **Run ID.** Every snapshot, lead brief, verifier scratch dir and repro path carries
  the run ID from Phase 0.
- **Severity is earned, not voted.** Agreement between reviewers is recorded,
  but severity is the highest any reviewer gave, not inflated by headcount.
- **Contradictions go to the user.** Never pick between two reviewers'
  conflicting recommendations yourself.
- **Honor user-listed fix IDs.** If the user approves only a subset (e.g., "F1,
  F4, F7"), execute only those. Treat the rest as Skipped in the fix log, and
  warn if an approved fix depends on a skipped one.
- **Be conservative about contract dependencies.** When in doubt about whether
  fix A's change affects fix B's file, serialize. Race conditions are worse than
  unnecessary sequencing.
- **Disambiguation from `[G] GitHub PR`.** If the user invokes `[PR]` clearly
  meaning GitHub Pull Request comments, redirect them to `[G]` instead.
