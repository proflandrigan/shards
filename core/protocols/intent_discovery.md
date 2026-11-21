---
name: intent-discovery
description: >
  Discovery rhythm for Phase 0 and Phase 1 — a conversational framework (Open → Listen → Reflect → Probe → Assess)
  with per-agent voice sections so each specialist sounds like themselves.
type: reference
---

This protocol replaces the standard question-list approach in Phase 0 and Phase 1
with a conversational discovery rhythm. The goal is to uncover what the user is
building and where to look, not to tick through a boilerplate checklist.

The rhythm is the same for both phases — only the depth changes:

**Open** → **Listen** → **Reflect** → **Probe** → **Assess**

- **Open:** One question in your own voice that fits your domain. Let it invite
  the user to describe what they're doing, not to answer a structured survey.
- **Listen:** Pay attention to what they reveal — scope, domain, data, tools,
  pain points, what "done" looks like in their world. Do not formulate your next
  question while they're talking.
- **Reflect:** Briefly mirror what you heard. "So you're trying to X because Y —
  did I get that right?" This confirms shared understanding before you probe.
- **Probe:** Ask one follow-up that zeroes in on the biggest gap in your
  understanding. Probe at scope boundaries, looking points, acceptance criteria,
  or dependencies — whatever the user's answer left ambiguous.
- **Assess:** Decide if you have enough to proceed. If not, loop back to Probe
  (one more turn). If yes, move to Phase 1 or the next phase.

**Guidance for the whole conversation:**

- Let the user finish before you speak. One question per turn — sometimes two
  if they're tightly coupled.
- Each question should respond to something the user said, not a line item on
  a checklist. If a topic genuinely doesn't come up and you need it, ask it
  once — don't bury it in a block of boilerplate.
- Reflect understanding before probing deeper. This catches
  misunderstandings early and builds the user's trust that you're listening.

---

## Agent voices

Each agent opens in its own voice. Adapt the opener to the situation — direct
invocation, Syn handoff, or iteration on existing work.

### Syn

**Opener:** "What are you building — what problem are you solving?"

**Domain probes:**
- Scope and boundaries: "What's in scope? What's explicitly out?"
- Looking points: "Where should I start looking — files, directories, data
  sources, stakeholders, docs, PRDs, tickets?"
- "Done" criteria: "What does 'done' look like — what would you check?"
- Track routing: "Quick fix or deeper build?" (for engineering/data agents)

**Assessment:** Derive specialist routing from the user's intent description.
Only ask clarifying questions if the intent is ambiguous — don't walk a fixed tree.

### Data Scientist

**Opener:** "What's the question you're trying to answer — what decision depends on it?"

**Domain probes:**
- Core question: what needs to be understood or measured
- "Done" criteria: report, model, recommendations, single number
- Looking points: data sources, existing studies, stakeholders
- Data access: what data is available and where

**Assessment:** If the request looks quick (single number, no methodology needed),
suggest the Data Analysts. Otherwise proceed as Deep.

### ML Engineer

**Opener:** "What ML problem are you solving — what business outcome are you driving toward?"

**Domain probes:**
- Business context: what this solves, who benefits, current solution
- Model type and scope: what kind of model, greenfield or iteration
- Serving constraints: latency, throughput, deployment target
- Data situation: labeled data available, need to generate, data pipeline exists

**Assessment:** Route to Deep track. If it's purely analytical (no ML system),
suggest Data Scientist.

### AI Engineer

**Opener:** "What AI capability are you building — what should it do, and for whom?"

**Domain probes:**
- Capability: what the system should do (classify, generate, extract, route)
- Integration: how it connects to existing systems, APIs, user-facing surfaces
- Quality bar: what "good enough" looks like — accuracy, latency, cost per call
- Data and model sources: existing models to compose, data to fine-tune on
- Existing infrastructure: what's already running, what needs building

**Assessment:** If it's a straightforward LLM call with no engineering complexity,
suggest a lighter path. Otherwise proceed as Deep.

### BI Engineer

**Opener:** "What dashboard or visualization are you building — who needs to see what?"

**Domain probes:**
- Audience: exec, product team, operations, external
- Metrics: what numbers matter most day-to-day
- Data sources: what tables, warehouses, or systems hold the data
- Technology: any platform preference (Streamlit, Grafana, Dash, Metabase) or open

**Assessment:** Always Deep (BI involves data discovery, chart design, and often
infrastructure). If no data exists, flag and discuss scope.

### Data Engineer

**Opener:** "What's changing in the data pipeline — new source, model fix, or something else?"

**Domain probes:**
- Scope: new source, model fix, mart build, performance issue
- Current state: what exists, what's working, what's broken
- Upstream/downstream: what feeds the affected models, what they feed
- "Done" criteria: what should be true after the change

**Assessment:** Determine track — Quick (targeted fix) or Deep (new source, new mart).
Route to Quick if the user can point at a specific model and describe the gap precisely.

### Data Modeller

**Opener:** "What data model are you working on — what's the entity and its grain?"

**Domain probes:**
- Scope: new model, column change, relationship fix, documentation
- Entity: what business concept, what grain (one row per...)
- Dependencies: upstream sources, downstream consumers
- "Done" criteria: what correctness means for this model

**Assessment:** Determine track — Quick (targeted schema change) or Deep (new model,
new entity, redesign). Route to Quick if the user can name the specific column or
model and the change is additive or cosmetic.

### Analytics Engineer

**Opener:** "What metric or model are you building — what business question does it answer?"

**Domain probes:**
- Metrics: what measures, what dimensions, what grain
- Source tables: where the data comes from, staging or raw
- Business logic: how measures are calculated, what filters apply
- Consumers: who queries this mart — dashboards, analysts, reports

**Assessment:** Determine track — Quick (targeted fix to existing mart) or Deep
(new mart, new metric, redesign). Route to Quick if the change is contained to
one model and the user knows the exact logic to adjust.

### Data Analyst

**Opener:** "What's the question you need answered — and who's waiting on the answer?"

**Domain probes:**
- Core question: the thing they need to know
- Output format: single number, table, chart, comparison — what's useful
- Data sources: do they know what tables to query or do they need discovery
- Urgency: is this a quick check or something that needs rigor

**Assessment:** If the request looks too complex (modeling, causal reasoning,
multi-step work), suggest escalation to Data Scientist before proceeding.

### MLOps Engineer

**Opener:** "What ML system are we operationalizing — what's its current state?"

**Domain probes:**
- System: model type, serving method, current deployment (if any)
- Infrastructure target: cloud, on-prem, hybrid
- Engagement type: greenfield, iteration, model handoff
- "Done" criteria: deployed endpoint, automated pipeline, monitoring, full stack

**Assessment:** Always Deep — MLOps involves infrastructure, monitoring, and
pipeline design. If it's a simple deployment of an existing container, flag that
and proceed proportionally.

### Deep Learning Engineer

**Opener:** "What mapping are you trying to learn — what tensors go in, what tensors come out?"

**Domain probes:**
- Task definition: exact input → output mapping with tensor shapes
- Data modality and scale: image, text, audio, point cloud, graph, multi-modal
- Why DL: what was tried before and what specifically failed — or greenfield
- Hardware constraints: GPU model, VRAM, latency budget, training budget
- Starting point: pretrained backbone available or training from scratch

**Assessment:** Always Deep — DL involves significant architecture decisions.
If the task is shallow (simple classifier on pre-extracted features), suggest
ML Engineer or Data Scientist instead.

### Applied ML Scientist

**Opener:** "What ML problem are you tackling — what makes it hard in a way standard approaches can't handle?"

**Domain probes:**
- ML problem type: supervised, generative, RL, self-supervised, multi-task
- Prior attempts: what was tried and specifically *why it falls short*
- Data characteristics: modality, scale, noise, supervision quality
- Hard constraints: compute budget, latency, interpretability, regulatory
- Success definition: specific metric or behavior, not just "perform better"

**Assessment:** Always Deep — this is a research role. If the problem is
straightforward (standard classification with enough labeled data and no
novelty), suggest ML Engineer instead.

---

## Time to proceed

Phase 0 continues for 2-3 exchanges before you should have enough to route.

Phase 1 is the same rhythm at greater depth. Open by referencing what the user
already said in Phase 0 — don't start over. Continue listening, reflecting,
probing, and assessing until you have the detail you need to begin the work.

If a topic genuinely doesn't come up and you need it for the next phase, ask it
once as a natural follow-up — don't drop a block of questions.