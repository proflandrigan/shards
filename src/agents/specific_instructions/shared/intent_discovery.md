---
name: intent-discovery
description: Intent-driven discovery protocol for Phase 0 and Phase 1 — replaces checklist-based triage with open-ended probing
type: reference
---

This protocol replaces the standard question-list approach in Phase 0 and Phase 1
with intent-driven discovery. The goal is to uncover what the user is building and
where to look, not to tick through a boilerplate checklist.

## Phase 0 — Open Probe

Open with exactly one question — adapt the phrasing to the agent's domain:

> "What are you building — what problem are you solving?"

Listen to the response. Let the user's intent guide the follow-ups. Do not
enumerate a fixed list of questions. Instead, probe surgically at what the
user reveals:

- **Scope and boundaries:** "What's in scope? What's explicitly out?"
- **Looking points:** "Where should I start looking? (files, directories, data
  sources, dashboards, stakeholders, docs, PRDs, tickets)"
- **"Done" criteria:** "What does 'done' look like — what would you check?"
- **Dependencies:** "Who or what does this depend on? What depends on this?"

After 2-3 exchanges you should have enough to route:

- **For dual-track agents (Analytics Engineer, Data Modeller, Data Engineer):**
  Determine Explore / Quick / Deep from the scope and looking points revealed.
- **For single-track agents (ML Engineer, Data Scientist, AI Engineer, BI Engineer):**
  Assess complexity and look for signs that a lighter path (Route to Data Analyst,
  Route to Backend Engineer) is appropriate.
- **For Syn:** Derive specialist routing from the user's intent description, not
  from a pre-ordained decision tree.

Record "Looking points" in the Phase 0 doc template — these are the concrete
places the agent should inspect in Phase 1.

## Phase 1 — Depth Probe

Phase 1 should NOT be a fresh question list. Open with a question that references
what the user already told you in Phase 0:

> "Tell me more about [specific thing they mentioned] — how does that work day-to-day?"

Let the conversation flow. Surface these topics naturally, in the user's own
vocabulary:

- **Consumers:** who uses this and how — probe when the user mentions downstream users
- **Grain / granularity:** "What's the right level of detail?" — ask when it's relevant
- **Edge cases / unknowns:** ask "What edge cases or unknowns are you aware of?" —
  don't ask until the user has described their domain
- **Acceptance criteria:** steer toward domain-specific invariants, not generic
  structural ones. Ask "In your world, what needs to be true for this to be right?"
- **Where to look for more context:** data models, source files, stakeholders to
  consult, existing specs, intake docs

Each question should be a response to something the user said, not a line item
on a checklist. If a topic genuinely doesn't come up and you need it for the
next phase, ask it once — don't bury it in a block of boilerplate.

## How agents reference this file

In Phase 0 sections of core agent files, replace the question list with a short
instruction paragraph that names this protocol:

```
Follow the intent-driven discovery protocol in
`.claude/agents/specific_instructions/shared/intent_discovery.md`.
Open with: "What are you building — what problem are you solving?"
```

In Phase 1 files, replace the bullet-point checklist with:

```
Use the depth probe pattern from
`.claude/agents/specific_instructions/shared/intent_discovery.md`
(Phase 1 — Depth Probe). Reference what the user said in Phase 0 to open.
```

## Doc template fields to add

Phase 0 should capture:

- **Looking points:** <files, dirs, data sources, stakeholders identified>

Phase 1 should capture:

- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>