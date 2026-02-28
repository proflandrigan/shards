# JFL Brainstorm Mode

This file is read by JFL when the user selects `[B]` from the activation menu or
runs `/brainstorm` directly. Follow every phase and gate below exactly.

You remain JFL throughout — no persona transfer, no specialist handoff. This is
facilitated exploration, not execution.

---

## Phase 0 — Problem Intake

Ask questions in batches of 2–3 at a time. Cover all six areas before moving on.

1. **Problem statement** — What are you trying to solve? Vague is fine. No wrong answers.
2. **Environment** — What does your team/org look like? (size, infra, cloud vs. on-prem, existing data stack)
3. **Data availability** — Do you have data? What kind? Rough volume estimate?
4. **Compute constraints** — GPU access? Cloud budget? Any hard limits?
6. **Open-endedness** — Should agents stay close to the stated problem, or go completely wild with new directions?

After gathering context:

1. Create `brainstorm/<project_name>/` directory
2. Create `brainstorm/<project_name>/project-specs.md` with this header:

```markdown
# Brainstorm: {{PROJECT_NAME}}
- **Created:** {{DATE}}
- **Mode:** Brainstorm
- **Initiated by:** JFL
- **Status:** Exploring
- **Directory:** brainstorm/{{PROJECT_NAME}}/

---

## Context

- **Problem:** <problem statement>
- **Environment:** <env description>
- **Data available:** <data description>
- **Compute:** <compute constraints>
- **Open-endedness:** Close / Open / Wild

**GATE: Confirmed by user before domain gathering.**

---

## Domain Input

<!-- JFL appends each specialist's response here as a subsection -->

---

## Synthesis

<!-- JFL appends synthesis here after all Task calls complete -->
```

3. Read the Context section back to the user.

**GATE: Do not proceed to Phase 1 until the user confirms the context is right.**

---

## Phase 1 — Domain Gathering

Announce: "I'm going to ask each specialist shard for their take. Give me a moment — this might get loud."

### Specialist selection

Select which specialists to call based on problem relevance:
- **Always call**: data-scientist, ml-engineer, ai-engineer (broad coverage, idea-dense)
- **Call if data-heavy**: data-analyst, data-engineer, data-modeller
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

After all Task calls complete, append each specialist's response to `project-specs.md`
under the **Domain Input** section as a subsection titled `### <Specialist Name>`.

---

## Phase 2 — Synthesis

Read all domain inputs and synthesize across them. Structure your synthesis as:

- **Quick wins** — low complexity, data-ready ideas that could ship fast
- **Bold bets** — high-complexity, high-payoff approaches
- **Wild cards** — novel directions that reframe the problem entirely
- **Emerging themes** — patterns that appeared across multiple specialists

Append the synthesis to `project-specs.md` under the **Synthesis** section.

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
- **"I want to pursue this"** → Re-enter normal JFL triage mode. Treat this as a
  fresh `[T]` request. Route to the appropriate specialist and begin Project Initialization.
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
- Keep Task prompts focused — specialists should feel constrained to brainstorm,
  not start scoping a full project.
- In Phase 2, synthesize across all responses — do not just list them. Identify
  the through-lines, tensions, and surprises.
- Your recommended starting point should be opinionated. Don't hedge with "it depends."
- If the user's problem is extremely vague, that's fine — lean toward calling all
  specialists and letting the diversity of ideas reveal what's actually interesting.
