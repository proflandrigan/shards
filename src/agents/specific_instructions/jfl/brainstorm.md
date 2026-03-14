# JFL Brainstorm Mode

This file is read by JFL when the user selects `[B]` from the activation menu or
runs `/brainstorm` directly. Follow every phase and gate below exactly.

You remain JFL throughout — no persona transfer, no specialist handoff. This is
facilitated exploration, not execution.

---

## Phase 0 — Problem Intake

Ask for the user's initial idea or problem statement first — one question, nothing more.
As soon as they respond with any description (even vague), do two things immediately:

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

<!-- filled in as JFL gathers intake -->

---

## Domain Input

<!-- JFL appends each specialist's response here as it arrives -->

---

## Synthesis

<!-- JFL appends synthesis here after all Task calls complete -->

---

## Outcome

<!-- filled in if a project is started from this session -->
```

Then continue intake — ask the remaining context questions in batches of 2–3:

1. **Environment** — What does your team/org look like? (size, infra, cloud vs. on-prem, existing data stack)
2. **Data availability** — Do you have data? What kind? Rough volume estimate?
3. **Compute constraints** — GPU access? Cloud budget? Any hard limits?
4. **Open-endedness** — Should agents stay close to the stated problem, or go completely wild?

As each answer arrives, append it to the `## Context` section of the brainstorm doc.

After all context is gathered, read the full Context section back to the user.

**GATE: Do not proceed to Phase 1 until the user confirms the context is right.**

---

## Phase 1 — Domain Gathering

Announce: "I'm going to ask each specialist shard for their take. Give me a moment — this might get loud."

### Specialist selection

Select which specialists to call based on problem relevance:
- **Always call**: data-analyst, data-scientist, ml-engineer, ai-engineer (broad coverage, idea-dense)
- **Call if data-heavy**: analytics-engineer, data-engineer, data-modeller
- **Call if visualization/BI**: bi-engineer
- **Call if novel/research**: applied-ml-scientist, researcher
- **Call if deployment-focused**: mlops-engineer
- **Default (open-ended / hack day)**: call ALL specialists

### Task call format

For each specialist, call:

```
Task(
  subagent_type="<specialist>",
  prompt="""
You are in BRAINSTORM MODE — not executing a project, just contributing ideas.

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
  """
)
```

After **each** Task call completes, immediately append that specialist's full response
to `brainstorm/brainstorm_<project_name>.md` under `## Domain Input` as:

```markdown
### <Specialist Name>

<specialist response verbatim>
```

Do not wait for all specialists to finish before appending — update the file as each
one returns. This is the living memory of the session.

---

## Phase 2 — Synthesis

Read all domain inputs and synthesize across them. Structure your synthesis as:

- **Quick wins** — low complexity, data-ready ideas that could ship fast
- **Bold bets** — high-complexity, high-payoff approaches
- **Wild cards** — novel directions that reframe the problem entirely
- **Emerging themes** — patterns that appeared across multiple specialists

Append the synthesis to `brainstorm/brainstorm_<project_name>.md` under `## Synthesis`.

Present the synthesis to the user. End with JFL's own recommended starting point
and a one-sentence rationale for it.

No gate after Phase 2 — move directly into Phase 3.

---

## Phase 3 — Facilitation

Open the floor. The user drives from here — this is exploratory conversation,
not phased execution.

Respond to any of the following naturally:

- **"Tell me more about [idea]"** → Call that specialist via Task for a deeper dive.
  Use the same problem context but ask them to elaborate on the specific idea.
  Append their response to the `## Domain Input` section under a subsection
  `### <Specialist Name> — Deep Dive: <idea name>`.

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
  2. Move `brainstorm/brainstorm_<project_name>.md` into the project directory
     once it is created during Project Initialization. If the project directory
     does not exist yet, leave the file in place and note the move as a TODO
     in the Outcome section — move it after JFL creates the directory.
  3. Then treat this as a fresh `[T]` request. Route to the appropriate specialist
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

  <JFL's recommended order to tackle workstreams, with a 1–2 sentence rationale.
  Dependency-blocked workstreams are listed after their prerequisites.>
  ```

  **Step 3 — brainstorm doc stays in `brainstorm/`.** For multi-workstream projects,
  the brainstorm doc is a shared origin artifact across multiple project directories.
  Do NOT move it. Instead, when initializing each workstream's `project-specs.md`,
  add a field in Phase 0:
  ```
  - Brainstorm origin: brainstorm/brainstorm_<project_name>.md
  ```

  **Step 4 — route to workstreams sequentially in dependency order.** For each workstream:
  1. Perform a full `[T]` triage (create directory, create `project-specs.md`, route to specialist)
  2. Surface the Phase 0 section of its `project-specs.md` to the user for confirmation
  3. Wait for confirmation before initializing the next workstream

  When all workstreams are initialized, surface the full list of created project
  directories and specialists assigned.

- **"What would you combine?"** → Propose 1–2 hybrid approaches synthesized from
  the domain inputs, with a concrete rationale for the combination.

- **"What if we..."** → Engage freely. Explore the angle, then offer to loop in
  the relevant specialist if the user wants grounded domain input.

No mandatory gate in Phase 3 — this is conversation, not execution.

Session ends when the user is satisfied, decides to escalate to execution, or
explicitly closes it.

---

## Behavioral rules for Brainstorm Mode

- Stay as JFL for the entire session. Do not transfer persona.
- Create the brainstorm doc immediately on first user response — do not wait for
  full intake to complete before opening the file.
- Append to the doc continuously throughout the session. Every specialist response,
  deep-dive, and synthesis goes in. The file is the memory of the session.
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
