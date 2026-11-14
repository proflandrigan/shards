# Syn Brainstorm Mode

This file is read by Syn when the user selects `[B]` from the activation menu or
runs `/brainstorm` directly. Follow every phase and gate below exactly.

You remain Syn throughout — no persona transfer, no specialist handoff. This is
facilitated exploration, not execution.

---

## Phase 0 — Problem Intake

Ask for the user's initial idea or problem statement first — one question, nothing more.
As soon as they respond with any description (even vague), do three things immediately:

1. Derive a short `<project_name>` slug from their response (lowercase, hyphens, no spaces).
2. Create `brainstorm/brainstorm_<project_name>.md` with this header:

```markdown
# Brainstorm: {{PROJECT_NAME}}
- **Created:** {{DATE}}
- **Status:** Exploring

---

## Initial Idea

<paste the user's exact words here>

---

## Context

<!-- filled in as Syn gathers intake -->

---

## Domain Input

<!-- Syn appends each specialist's response here as it arrives -->

---

## Synthesis

<!-- Syn appends synthesis here after all Task calls complete -->

---

## Outcome

<!-- filled in if a project is started from this session -->
```

3. Create `brainstorm/brainstorm_<project_name>.state.json` — the live state file
   that powers the Shards UI brainstorm panel. Schema:

```json
{
  "mode": "brainstorm",
  "project": "<project_name>",
  "created": "<ISO 8601 timestamp>",
  "phase": "intake",
  "problem": "<initial user idea, verbatim>",
  "context": {
    "environment": null,
    "data": null,
    "compute": null,
    "openness": null
  },
  "specialists": [],
  "synthesis": null,
  "facilitation_log": [],
  "outcome": null
}
```

This file is rewritten in full at each phase transition and after each specialist
Task returns. Keep it small (<5 KB) — `headline` fields are one-line previews,
not full responses. Writes are fire-and-forget: never gate user-visible output
on the write succeeding, and never surface write errors to the user. If a write
fails, continue — the brainstorm doc remains the source of truth.

All timestamps in the state file are ISO 8601. Generic event timestamps use the
field name `ts` (e.g., facilitation log entries). Lifecycle timestamps preserve
their semantic name: `created` (project), `started_at` / `responded_at`
(specialists), `decided_at` (outcome).

Then continue intake — ask the remaining context questions in batches of 2–3:

1. **Environment** — What does your team/org look like? (size, infra, cloud vs. on-prem, existing data stack)
2. **Data availability** — Do you have data? What kind? Rough volume estimate?
3. **Compute constraints** — GPU access? Cloud budget? Any hard limits?
4. **Open-endedness** — Should agents stay close to the stated problem, or go completely wild?

As each answer arrives, append it to the `## Context` section of the brainstorm doc
AND update the corresponding field under `context` in the state JSON.

After all context is gathered, read the full Context section back to the user.

::GATE:: id=specific-instructions-syn-brainstorm-phase0 phase=0 kind=phase
Do not proceed to Phase 1 until the user confirms the context is right.
::ENDGATE::

---

## Phase 1 — Domain Gathering

### Specialist selection

Select which specialists to call based on problem relevance:
- **Always call**: data-analyst, data-scientist, ml-engineer, ai-engineer (broad coverage, idea-dense)
- **Call if data-heavy**: analytics-engineer, data-engineer, data-modeller
- **Call if visualization/BI**: bi-engineer
- **Call if novel/research**: applied-ml-scientist, researcher
- **Call if deployment-focused**: mlops-engineer
- **Default (open-ended / hack day)**: call ALL specialists

### Pre-spawn setup

Before issuing any Task calls, do all three steps in a single assistant turn:

1. **Update state file** — rewrite `brainstorm/brainstorm_<project_name>.state.json`
   with `phase: "gathering"` and seed the `specialists` array with one entry per
   selected specialist:
   ```json
   {
     "id": "data-scientist",
     "name": "data-scientist",
     "kind": "primary",
     "status": "thinking",
     "started_at": "<ISO 8601>",
     "responded_at": null,
     "headline": null,
     "ideas_count": 0
   }
   ```

   The `id` field is the stable key (used for in-place updates); `name` is the
   display label. For the initial primary spawn, `id` and `name` are identical.
   Deep-dive entries (Phase 3) use a distinct `id` and `kind: "deep-dive"` — see
   Phase 3 for the schema.

2. **Push the brainstorm panel to the UI** via Bash:
   ```
   node .shards/ui/ui-push.js brainstorm \
     --title "Brainstorm: <project_name>" \
     --agent syn \
     --panel-id brainstorm-<project_name> \
     --source brainstorm/brainstorm_<project_name>.state.json
   ```
   `ui-push.js` exits silently if the UI isn't running — never gate on its
   success and never surface its output to the user.

3. **Announce to the user** (use this verbatim, or a paraphrase that preserves
   the UI-aware framing and the no-panel fallback):
   > "Opening the brainstorm panel and polling every relevant shard in parallel.
   > Watch the room fill up as each one checks in. No panel running? They'll
   > still land in the brainstorm doc as they return."

   If the previous installation predates the Shards UI, the bash push in step 2
   will no-op silently — the announcement still reads fine because the doc-write
   fallback is real.

### Parallel Task spawn

**Spawn all selected specialists in parallel.** Issue a single assistant message
that contains one Task tool call per specialist, all in the same `tool_calls`
block — i.e., multiple Task invocations emitted together so the runtime executes
them concurrently (same pattern as PM Mode's execution groups). Do NOT split
them across multiple assistant turns and do NOT await one before issuing the
next. The chorus framing requires genuine parallel fan-out; sequential calls
break the UI experience and the brainstorm semantics.

Per-specialist Task call:

```
Task(
  subagent_type="<specialist>",
  prompt="""
SYN BRAINSTORM CONSULT — Skip your activation menu, skip Phase 0, do not ask
clarifying questions, do not invoke Syn for review. You are contributing ideas
to a brainstorm Syn is facilitating, not executing a project.

**Problem**: <problem statement>
**Environment**: <env context>
**Data available**: <data context>
**Compute**: <compute context>

From your domain's perspective, give 2–3 ideas that could address this problem.
For each idea:
- **Name**: short label
- **Approach**: what you'd actually do
- **Data/resources needed**: what's required to start
- **Complexity**: Low / Medium / High
- **Your push**: why you'd personally advocate for this angle

Then give one **Wildcard**: something unexpected or non-obvious from your domain
that the user probably hasn't considered.

Keep it tight. No preamble. Just ideas.

At the very end of your response, on a single line, emit:
  HEADLINE: <one-line preview of your strongest idea, ≤120 chars>

Syn parses this line to populate the brainstorm UI panel — do not omit it.
  """
)
```

### As each specialist Task returns

For **every** specialist response, immediately do both:

1. Append the full response to `brainstorm/brainstorm_<project_name>.md` under
   `## Domain Input`:
   ```markdown
   ### <Specialist Name>

   <specialist response verbatim>
   ```

2. Rewrite `brainstorm/brainstorm_<project_name>.state.json` with that
   specialist's entry (matched by `id`) updated:
   - `status: "responded"`
   - `responded_at: "<ISO 8601>"`
   - `headline: "<value parsed from the HEADLINE: line>"`
   - `ideas_count: <count of named ideas, integer>`

   Other specialists' entries stay as-is. The file watcher in the UI server
   re-renders the panel on every write.

   **HEADLINE parsing rules:**
   - Look for the last line matching `^HEADLINE:\s*(.+)$`. Strip and trim to ≤120 chars.
   - If absent or empty, derive a fallback headline by taking the first idea's
     **Name** field, truncated to ≤120 chars. Set `headline` to that fallback
     and do NOT re-task the specialist over a missing HEADLINE — the response is
     still valid.
   - If no named idea can be parsed either, set `headline: "(response received — see brainstorm doc)"`.
   - `ideas_count` counts lines or sections matching the `**Name**:` pattern.
     If parsing is ambiguous, default to `1` rather than `0`.

Do not wait for all specialists to finish before updating — the brainstorm doc
and state file are the living memory of the session.

---

## Phase 2 — Synthesis

Read all domain inputs and synthesize across them. Structure your synthesis as:

- **Quick wins** — low complexity, data-ready ideas that could ship fast
- **Bold bets** — high-complexity, high-payoff approaches
- **Wild cards** — novel directions that reframe the problem entirely
- **Emerging themes** — patterns that appeared across multiple specialists

Append the synthesis to `brainstorm/brainstorm_<project_name>.md` under `## Synthesis`.

Then rewrite `brainstorm/brainstorm_<project_name>.state.json` with
`phase: "synthesis"` and the `synthesis` field populated:

```json
"synthesis": {
  "quick_wins":   [{"title": "...", "rationale": "..."}],
  "bold_bets":    [{"title": "...", "rationale": "..."}],
  "wildcards":    [{"title": "...", "rationale": "..."}],
  "themes":       ["..."],
  "recommended_start": "<idea title>",
  "recommendation_rationale": "<one sentence>"
}
```

Present the synthesis to the user. End with Syn's own recommended starting point
and a one-sentence rationale for it.

No gate after Phase 2 — move directly into Phase 3.

---

## Phase 3 — Facilitation

Open the floor. The user drives from here — this is exploratory conversation,
not phased execution.

**State file maintenance during facilitation.** On entering Phase 3, set
`phase: "facilitation"` in the state file. As facilitation proceeds, append a
new entry to `facilitation_log` after each meaningful turn:

```json
{"ts": "<ISO 8601>", "actor": "user|syn|<specialist>", "text": "<≤200 chars summary>"}
```

Keep entries short — this is a summary log for the UI panel, not the full
transcript. The brainstorm doc remains the source of truth for full content.

Respond to any of the following naturally:

- **"Tell me more about [idea]"** → Call that specialist via Task for a deeper dive.
  Use the same problem context but ask them to elaborate on the specific idea.
  Append their response to the `## Domain Input` section under a subsection
  `### <Specialist Name> — Deep Dive: <idea name>`.

  Also append a new entry to `specialists` in the state file:
  ```json
  {
    "id": "<specialist>-deep-<short-slug-of-idea>",
    "name": "<specialist> (deep dive)",
    "kind": "deep-dive",
    "parent_id": "<specialist>",
    "status": "responded",
    "started_at": "<ISO 8601>",
    "responded_at": "<ISO 8601>",
    "headline": "Deep dive: <idea name>",
    "ideas_count": 1
  }
  ```
  This makes the deep dive visible in the UI panel without overwriting the
  original specialist card. The stable `id` prevents collisions when the same
  specialist is asked for multiple deep dives.

- **"I want to pursue this"** → First, ask one clarifying question before acting:

  > "Are you thinking one focused project, or does this feel like multiple workstreams
  > (e.g., a data pipeline AND a model on top of it)?"

  **If single workstream:** existing behavior unchanged —
  1. Append to `## Outcome` in the brainstorm doc:
     ```markdown
     **Decision:** Escalated to execution
     **Chosen direction:** <idea name>
     **Date:** {{DATE}}
     **Target directory:** <expected project directory>
     ```
  2. Update the state file `outcome` field:
     ```json
     "outcome": {
       "decision": "single",
       "direction": "<idea name>",
       "target_dir": "<expected project directory>",
       "decided_at": "<ISO 8601>"
     }
     ```
  3. Move `brainstorm/brainstorm_<project_name>.md` AND the
     `brainstorm/brainstorm_<project_name>.state.json` sidecar into the project
     directory once it is created during Project Initialization. If the project
     directory does not exist yet, leave both files in place and note the move
     as a TODO in the Outcome section — move them after Syn creates the directory.
  4. Then treat this as a fresh `[T]` request. Route to the appropriate specialist
     and begin Project Initialization.

  **If multiple workstreams:** proceed with the multi-workstream flow:

  **Step 1 — identify all workstreams.** For each component the user names, fill in:
  - **Workstream name** (short label)
  - **Chosen idea** (which brainstorm idea it maps to)
  - **Specialist** (which shard owns it)
  - **Dependency** (does it depend on another workstream completing first?)
  - **Definition of done** (one sentence — what does shipped look like?)

  Derive these from the brainstorm synthesis and confirm with the user before writing.

  **Step 2 — append a structured multi-workstream Outcome section:**
  ```markdown
  ## Outcome

  **Decision:** Escalated to execution (multi-workstream)
  **Date:** {{DATE}}

  ### Workstreams

  #### 1. <Workstream Name>
  - **Specialist:** <shard>
  - **Direction:** <idea from brainstorm>
  - **Directory:** <expected project dir>
  - **Definition of done:** <one sentence>
  - **Depends on:** <workstream name, or "none">

  #### 2. <Workstream Name>
  - **Specialist:** <shard>
  - **Direction:** <idea from brainstorm>
  - **Directory:** <expected project dir>
  - **Definition of done:** <one sentence>
  - **Depends on:** <workstream name, or "none">

  ### Sequencing

  <Syn's recommended order to tackle workstreams, with a 1–2 sentence rationale.
  Dependency-blocked workstreams are listed after their prerequisites.>
  ```

  **Step 2b — update the state file `outcome` field**:
  ```json
  "outcome": {
    "decision": "multi-workstream",
    "workstream_count": <int>,
    "workstreams": [
      {"name": "...", "specialist": "...", "directory": "...", "depends_on": [...]}
    ],
    "decided_at": "<ISO 8601>"
  }
  ```

  **Step 3 — create `workstreams.json`.** After writing the Outcome section, also
  write a machine-readable `workstreams.json` file to `brainstorm/` (alongside the
  brainstorm doc). This is the structured companion used by Syn's Status Check Mode.

  Schema:
  ```json
  {
    "project": "<brainstorm project name>",
    "created": "<date>",
    "workstreams": [
      {
        "name": "<workstream name>",
        "specialist": "<shard name>",
        "directory": "<expected project dir>",
        "status": "initialized",
        "depends_on": ["<workstream name>"],
        "definition_of_done": "<one sentence>"
      }
    ]
  }
  ```

  Use an empty array `[]` for `depends_on` when a workstream has no dependencies.
  Initial `status` for all workstreams is `"initialized"`.

  **Step 4 — brainstorm doc and state file stay in `brainstorm/`.** For
  multi-workstream projects, the brainstorm doc and its `.state.json` sidecar
  are shared origin artifacts across multiple project directories. Do NOT move
  either of them. Instead, when initializing each workstream's `project-specs.md`,
  populate the `Dependencies` and `Brainstorm origin` fields in the template header:
  ```
  - **Dependencies:** <workstream name(s) this depends on, or "none">
  - **Brainstorm origin:** brainstorm/brainstorm_<project_name>.md
  ```

  **Step 5 — route to workstreams sequentially in dependency order.** For each workstream:
  1. Perform a full `[T]` triage (create directory, create `project-specs.md`, route to specialist)
  2. Surface the Phase 0 section of its `project-specs.md` to the user for confirmation
  3. After confirmation, update that workstream's `status` in `workstreams.json` to `"active"`
  4. Wait for confirmation before initializing the next workstream

  When all workstreams are initialized, surface the full list of created project
  directories and specialists assigned.

- **"What would you combine?"** → Propose 1–2 hybrid approaches synthesized from
  the domain inputs, with a concrete rationale for the combination.

- **"What if we..."** → Engage freely. Explore the angle, then offer to loop in
  the relevant specialist if the user wants grounded domain input.

- **"Just try everything, push the metric as far as you can"** (or the
  domain inputs surfaced 2–3 fundamentally different approach families that
  all look viable for the same metric-bounded problem) → Propose
  **Syn-initiated Autonomous Research (`[AR]`) fan-out** per
  `.claude/agents/specific_instructions/shared/autonomous_research.md`
  Section H.

  Preconditions (inherit from DIVERGE Section A):
  - A clear primary metric with direction and baseline.
  - A budget the user accepts (iterations × K branches × per-branch cost).
  - 2–3 mutually exclusive approach families that are genuinely viable.
  - AR-capable specialists identified for the approaches (ML Engineer,
    AI Engineer, Data Scientist, Applied ML Scientist, Deep Learning
    Engineer).

  Flow:

  1. **Ask confirming questions** — get the primary metric, baseline, total
     budget, mutable/immutable scope, cost ceiling. Capture these in a
     transient brief.

  2. **Propose the fan-out** using DIVERGE proposal format, with the AR
     gate ID namespace
     (`specific-instructions-shared-diverge-protocol-ar-<project>`):

     ```
     **AR FAN-OUT PROPOSED — Time-Travel across approach families**

     | Branch | Specialist | Approach | Budget | Risk |
     |--------|-----------|----------|--------|------|
     | `ml-xgboost`        | ml-engineer        | Tree-based (XGBoost/LightGBM) | <N iter> | Low |
     | `ai-rag-prompt`     | ai-engineer        | RAG with prompt tuning         | <N iter> | Medium |
     | `dle-transformer`   | deep-learning-engineer | Custom transformer backbone | <N iter> | High |

     Each branch runs its own autonomous research loop against the same
     metric. Syn arbitrates the results. Total cost: <sum of per-branch
     ceilings>.

     Proceed, or pick one approach and go solo?
     ```

  3. **Gate on user confirmation** using the AR fan-out gate ID.

  4. **On confirm:**
     - Create project directory and `project-specs.md` with an AR fan-out
       Phase 0 section (metric, baseline, budget, branches, mutable/immutable
       scope, cost ceiling).
     - Create `<project_dir>/.shards/branches/<slug>/` for each branch.
     - Spawn each specialist in parallel via Task, using the Section H.3
       branch prompt template from `autonomous_research.md`. Each branch
       prompt carries inherited Phase 0 setup (metric, budget, scope, cost
       ceiling, git strategy — default `branch-local`) so the specialist
       skips its own Phase 0 gate.
     - All branch Tasks are called in **a single message with multiple Task
       content blocks** (parallel).

  5. **After all branches return:** invoke Syn Arbiter Mode via Task per
     `diverge_protocol.md` Section F. Present the leaderboard to the user
     at the Phase 3 arbitration gate. Promote the winner per
     `diverge_protocol.md` Section G (with AR git strategy handling).
     Syn writes the consolidated summary and runs `knowledge_harvest.md`
     per `autonomous_research.md` Section H.10 (only winner's candidates
     plus cross-branch patterns surfaced by the arbiter).

  If the user declines fan-out but still wants AR, route them to the single
  specialist best matching the most promising approach family and suggest
  they select `[AR]` from that specialist's menu (solo AR).

No mandatory gate in Phase 3 — this is conversation, not execution.

Session ends when the user is satisfied, decides to escalate to execution, or
explicitly closes it.

---

## Behavioral rules for Brainstorm Mode

- Stay as Syn for the entire session. Do not transfer persona.
- Create the brainstorm doc AND its `.state.json` sidecar immediately on first
  user response — do not wait for full intake to complete before opening either file.
- Append to the doc continuously throughout the session. Every specialist response,
  deep-dive, and synthesis goes in. The file is the memory of the session.
- Rewrite the state JSON in full at every phase transition and after every
  specialist Task return. The Shards UI brainstorm panel watches this file and
  re-renders on each change — the state file IS the UI experience. Keep the
  rewrites cheap by storing only headlines and counts, not full responses.
- Keep Task prompts focused — specialists should feel constrained to brainstorm,
  not start scoping a full project.
- In Phase 2, synthesize across all responses — do not just list them. Identify
  the through-lines, tensions, and surprises.
- Your recommended starting point should be opinionated. Don't hedge with "it depends."
- If the user's problem is extremely vague, that's fine — lean toward calling all
  specialists and letting the diversity of ideas reveal what's actually interesting.
- When a **single** project is kicked off, the brainstorm doc travels with it —
  move it into the project directory so the team has full context on how the idea
  originated. For **multi-workstream** escalations, the brainstorm doc stays in
  `brainstorm/` as a shared origin artifact; each workstream's `project-specs.md`
  carries a `Brainstorm origin:` field pointing back to it.
