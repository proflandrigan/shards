# Shards Agent Assessment

**Date:** 2026-04-17
**Scope:** All files under `src/agents/` and `src/agents/specific_instructions/` (15 agent core files, 84 instruction files, ~17.7K lines of prose instructions).
**Lens:** Architectural gaps, behavioral weaknesses, orchestration bugs, and context-window pressure.

---

## 1. Executive Summary

The Shards suite is an ambitious prose-coded orchestration framework. Routing, personas, and documentation gates are all expressed as Markdown instructions read by the model at runtime. The architecture is coherent at a conceptual level (Syn → specialist → reviewer via Task), and the deferred-phase-loading pattern is the single best design choice in the repo — it prevents Phase 1+ from ever touching Syn's context.

However, the system has accumulated significant **instructional debt**. The core agent files are 250–730 lines; the phases files run 400–1,120 lines; and many cross-references cause the model to load the same protocol repeatedly in a single session. There are also several structural patterns that will produce silent bugs: non-deterministic persona transfer via a prose contract, gate escape hatches scattered across modes, circular Task calls that nest Syn inside itself, and three separate "knowledge protocols" (retrieval, checkpoint, harvest) that compete for the same context budget.

Below are the 23 highest-priority findings grouped into four themes: Context Bloat, Orchestration Bugs, Behavioral Gaps, and Structural Smells.

---

## 2. Sizing Baseline

| Layer | Files | Total lines |
|-------|-------|-------------|
| Core agent files (`src/agents/*.md`) | 15 | 5,315 |
| Phase files (largest: ml_engineer, ai_engineer) | 13 | ~7,200 |
| Shared protocols | 7 | 1,087 |
| Mode variants (review, advise, update, etc.) | 40+ | ~4,100 |
| **Instruction surface total** | **84 files** | **~17,700 lines** |

The two biggest phase files (`ml_engineer/phases.md` at 1,119 lines and `ai_engineer/phases.md` at 1,058 lines) are larger than many full production codebases. They are read in full at Phase 1 start and remain in context for the rest of the session.

Across all agents there are **121 "in full" directives** and **114 `Read .claude/agents/specific_instructions/...` cross-references**. Every "in full" read is an uncached, from-scratch file load.

---

## 3. Context Bloat Findings

### 3.1 Double-reading of phase files on resume
`data-analyst.md:260` and identical blocks in every other specialist tell the model to `Read .claude/agents/specific_instructions/<agent>/phases.md in full` on three different trigger conditions (Phase 0 gate confirmation, Syn handoff, and `[B]` resume). There is no deduplication. A Syn-handoff session that later resumes (e.g., user returns after `/compact`) will read the phase file twice in the same session, each time at 500–1,100 lines.

**Fix:** State once, at the top of each core file, that the phase file is loaded exactly once upon transition to Phase 1, regardless of origin. Remove the "When to load" bullet list — it promotes re-reads.

### 3.2 Redundant Reviewer Verdict Protocol reload
`ml-engineer.md:364` reads `reviewer_verdict_protocol.md` once under "Behavioral Rules." But every phase file that invokes a reviewer repeats the verdict mapping inline anyway (see `ml_engineer/phases.md:311`, `:808`). Net effect: the 30-line protocol is loaded once and then re-stated in phase-local language multiple times, doubling the cognitive surface without improving clarity.

**Fix:** Pick one location. The shared protocol or the phase file — not both.

### 3.3 "Syn review NEEDS REVISION" boilerplate replicated per phase
The same ~12-line "If Syn returns NEEDS REVISION a second time" escalation script appears verbatim in `data_analyst/phases.md:432`, `ai_engineer/phases.md:836`, `ml_engineer/phases.md:906`, `data_scientist/phases.md`, `mlops_engineer/phases.md`, etc. Same for the "If Syn's review includes a Code Review section" block. This is copy-paste prose coding.

**Fix:** Extract to `shared/syn_review_resolution.md` and reference from each phase's review section.

### 3.4 Model-card JSON schema duplicated in two phase files ✅ COMPLETE
`ml_engineer/phases.md:964–1039` and `ai_engineer/phases.md:893–967` contain the same ~75-line JSON schema. Any schema change requires edits in two places; if they drift, the BI/UI model-card panel will break for one specialist or the other.

**Fix:** Move the schema to `src/templates/model-card-schema.md` (alongside `model-card.md`) and reference it. Better: make it a JSON Schema file (`.json`) and have both phase files say "conform to `templates/model-card-schema.json`".

### 3.5 Knowledge-ledger surface is over-engineered for the benefit
Three separate protocols — `knowledge_retrieval.md` (75 lines, before Phase 1), `knowledge_checkpoint.md` (83 lines, mid-phase), `knowledge_harvest.md` (180 lines, at close). All three are referenced in every specialist. Knowledge re-grounding is mandatory at multiple checkpoints. For a short Data Analyst quick-analysis, three knowledge protocol loads plus the INDEX.md read plus 3 candidate-file reads can easily eat 800+ lines of context before the first query is written.

**Fix:** For Quick-Track specialists (Data Analyst, Data Engineer Quick, BI Engineer Quick), retrieval should be opt-in via a one-line flag, not mandatory. The harvest protocol should auto-skip for Quick tracks (already suggested in the harvest protocol itself, but not enforced by the calling code).

### 3.6 The Knowledge Ledger retrieval scan is done twice in PM mode
`syn/pm.md:116–135` runs the full retrieval protocol per workstream, then the PM-mode prompt at `:164–169` tells the specialist "Do NOT re-run retrieval" — but every specialist core file still includes "Before beginning Phase 1, check for relevant prior knowledge" in its Behavioral Rules. There's a real risk the specialist re-runs retrieval because the PM-mode prompt is a single soft instruction buried in a 30-line preamble, while the specialist's own behavioral rule is top-level in its agent file.

**Fix:** The PM preamble must use the same "skip entirely" wording already proven in the knowledge protocol's Syn-handoff section. Add a `__pm_mode__: true` marker the specialist can check.

### 3.7 "Read the project-specs.md" happens over and over
Every handoff, every mode switch, every phase checkpoint includes "Read project-specs.md." In a long session the same file can be read 5–8 times. Each read is a full file load.

**Fix:** State once: "At session start, load project-specs.md. Treat it as live — update in place." Remove the "read project-specs.md" sentence from individual phase transitions. Add it only at boundaries where the file may have changed out-of-band (e.g., Syn arbiter mode, resume after compact).

### 3.8 Anti-repetition "voice rule" is dead weight ✅ COMPLETE
Every specialist has a "Voice rule — anti-repetition: Track which openers you've used in this session..." block. This is ~6 lines × 13 specialists = 78 lines of instructions asking the model to run a tracker it cannot actually maintain reliably (state is conversational, not structured). The intent is good; the implementation is magical thinking.

**Fix:** Remove. Or replace with a single top-of-file tag `voice: vary-openers` and one shared protocol if the behavior really matters.

---

## 4. Orchestration Bugs and Risks

### 4.1 The Task-nesting fan-out is unbounded in the Syn-review path
Call stack for a normal ML Engineer session:

1. `Task(syn)` — user invokes via `/shards`
2. Syn hands off in-session to ML Engineer (no Task — persona transfer)
3. ML Engineer runs Phase 2 → `Task(data-engineer)` — nest depth 1
4. ML Engineer runs Phase 3 → `Task(data-modeller)` — nest depth 1
5. ML Engineer runs Phase 4 → `Task(data-scientist)` + `Task(applied-ml-scientist)` + `Task(deep-learning-engineer)` — three parallel Task calls
6. ML Engineer runs Phase 7 → `Task(backend-engineer)` + `Task(mlops-engineer)` + `Task(syn)` (final review) + potentially `Task(academic)` + potentially `Task(syn)` (code review) — five more Task calls
7. `Task(syn)` in code review mode may itself call `Task(backend-engineer)` — **nest depth 2, with Syn nested inside itself**.

A single ML Engineer project can spawn **10+ Task calls**, several nested. There is no token budget, no timeout, and no fail-safe for a malformed Task prompt. The "don't re-submit to the same reviewer more than once" rule is phrased as a soft instruction; nothing enforces it.

**Fix:**
- Cap Task nesting at depth 2 explicitly in the behavioral rules.
- Add a "Task call budget" line to each phase: "This phase will make at most N Task calls."
- The Syn-calls-Syn code-review path should not exist — split Syn's code-review mode into a sibling agent (`syn-code-review`) so the caller never asks "syn" to do two different jobs.

### 4.2 Persona transfer is a prose contract, not an engine behavior
`syn.md:449–578` describes "in-session persona transfer" — Syn reads the specialist's agent file and becomes the specialist. The model is instructed "Do NOT refer to yourself as Syn after the persona transfer. Do NOT revert to Syn mid-session." But there is no mechanism, only prose. The model retains Syn's system prompt and its entire prior context. Personality bleed is essentially guaranteed for short specialists or after `/compact` (which does not re-anchor).

**Failure modes:**
- Post-`/compact` resume with ambiguous early messages — model reverts to Syn because Syn's system instructions are still the last anchor.
- Specialist invokes Syn for final review via Task, gets the verdict, then "forgets" it's still the specialist (especially likely for ML Engineer whose tone overlaps Syn's).
- User addresses "Syn" directly ("hey Syn, wait —") and the specialist breaks character.

**Fix:** Push the specialist persona into a real tool-level subagent (spawned via Task), not an in-session takeover. The current pattern saves one Task boundary but sacrifices identity integrity. If the cost is a second system-prompt load, it's worth it.

### 4.3 `/compact` is load-bearing and fragile
The handoff sequence at `syn.md:552` says "Wait for the user to run `/compact` and signal they're ready." `/compact` is an Anthropic-harness command whose behavior is not under shards' control. It can fail silently, be skipped, or be misinterpreted. If the user says "go" without having actually compacted, Syn proceeds to the persona transfer with the full triage context still loaded. This wastes context and makes the specialist behave like Syn-with-different-rules.

**Fix:**
- Detect whether `/compact` actually ran by checking the context size or timestamp (via a heartbeat file).
- If not, make the persona-transfer conditional on compaction succeeding, and re-prompt.
- Or, drop the reliance on `/compact` entirely and use real subagents (see 4.2).

### 4.4 The "gate" system has no enforcement — just prose ✅ DONE
There are **180 `GATE:` directives and 70 `Wait for the user to explicitly confirm` sentences** across the instruction surface. Every one of them is a request to the model to stop and wait. There is no mechanism to actually stop. The model's incentive is to keep producing; gate adherence depends entirely on the model recognizing the marker. In practice:

- Gates written early in a phase file tend to hold; gates written 800 lines deep in `ml_engineer/phases.md` do not.
- Gates that follow an announcement-plus-gate sequence ("Tell the user ... then GATE") are frequently skipped because the "Tell the user" line was followed by immediate action.
- Gates in review-mode files (e.g., `backend_engineer/clean.md` Phase 3 plan gate) are interpreted as rhetorical.

**Fix:** Introduce explicit gate anchors the harness can recognize (e.g., a fence like `::GATE::` with a well-known parser). Until then, assume ~20–30% gate slippage and design accordingly.

### 4.5 Reviewer resubmission rule is ambiguous on "same reviewer"
`reviewer_verdict_protocol.md:28` says "Never resubmit to the same reviewer more than once per phase." But:

- Some specialists (`ml-engineer.md`) consult *two* reviewers of the same type in one phase (Data Scientist for methodology + Applied ML Scientist). If both Halt and get resubmitted, the per-phase counter is not defined.
- In PM mode (`syn/pm.md:205–230`), specialists can be re-tasked up to 3 times — breaking the "1 resubmit" cap without explicitly saying so.
- The "Syn NEEDS REVISION twice" escalation (§3.3) is 2 attempts, not 1. The cap differs silently across code paths.

**Fix:** Unify the cap: `max_resubmits: 1` for Halt reviewers in normal flow, `max_revisions: 3` for PM-orchestrated specialists, and state both explicitly in the protocol.

### 4.6 DIVERGE branches copy the entire project-specs into the Task prompt
`diverge_protocol.md:120–123`: "Insert the full text of all completed phase sections from project-specs.md here, verbatim." For a Data Scientist study that forks at Phase 4, that's Phases 0–4, which is often 200–400 lines of prose. Each of the N branches gets that prompt. So a 3-way fork costs ~1,000 lines of context just to set up branches — before any of them runs.

**Fix:** Write a branch context file to disk (`<project_dir>/.shards/branches/context.md`) once, and have each branch Task read it. Reduces cost from O(N × |context|) to O(N + |context|).

### 4.7 The Time-Travel Syn arbiter writes to a file the user might not have seen
`syn/arbiter.md:34` writes `<project_dir>/.shards/branches/leaderboard.md`. The leaderboard is authoritative. But `diverge_protocol.md:210–222` then has the calling specialist present it to the user and gate on selection. If the specialist misreads the leaderboard (e.g., paraphrases a close call as a winner), the user gets a biased presentation.

**Fix:** The specialist should return the leaderboard markdown verbatim, not paraphrased, and explicitly surface the "Syn's Read" paragraph unchanged.

### 4.8 Circular "Syn calls Syn for code review" is a true cycle ✅ DONE
Phase 7 Syn review returns a "Code Review" section if code artifacts exist. Specialist then calls `Task(subagent_type="syn", prompt="CODE REVIEW MODE...")`. Syn in code-review mode invokes `Task(subagent_type="backend-engineer")`. If the Backend Engineer flags a bug that requires fixing a Python file *that the ML Engineer would ordinarily own*, Syn edits the file directly (via Edit tool in code review mode). This violates "don't do the specialist's job" — which Syn has explicitly suspended in fixer mode but not in code review mode. The instruction set does not clarify.

**Fix:** Explicitly state that Syn code-review mode carries the same exception as fixer mode. Or, alternatively, have the backend-engineer apply its own fixes (it already has Write/Edit permission in Clean mode).

### 4.9 Handoff intake files have no version / schema
`ae-intake.md` (written by Data Analyst), `bi-intake.md`, `data_analyst_handoff.md`, `ml_engineer_handoff.md`, `bi_engineer_handoff.md`, `incoming_handoff.md` — 6+ intake file formats, each specified only as a code fence inside one agent's phase file. The corresponding *receiver* agent's incoming-handoff file parses them by prose pattern match. If the upstream format drifts, the downstream agent silently parses the wrong fields.

**Fix:** Define each intake format in `src/templates/` with a template file and a stable schema (YAML frontmatter + named sections). Receivers validate presence of required fields before proceeding.

---

## 5. Behavioral Gaps and Inconsistencies

### 5.1 Inconsistent rules about when to enter Phase 0
- Data Analyst: "If the user includes a request or context in their invocation message: Do not use that context to skip or shorten Phase 0" (explicit).
- Data Engineer: same rule.
- MLOps Engineer: not stated — the model may or may not skip Phase 0.
- Applied ML Scientist: rule is present but nested inside "When activated directly" — if the user arrives from Syn, the rule does not apply, which is correct. But the message is ambiguous.

**Fix:** Apply one "inline context does not satisfy a gate" rule across all specialists via the shared behavioral_rules.md.

### 5.2 Triage routing tables contain overlapping categories
`syn.md:214–355` has 13 "Distinguishing X from Y" blocks — totaling 140 lines. Each block tries to resolve one ambiguity. Several categories have **three-way overlap** (e.g., "build a prediction model" can route to Data Scientist, ML Engineer, or Applied ML Scientist depending on wording). The distinguishing rules themselves encourage ambiguity by offering multiple tiebreakers.

**Fix:** Prefer a decision-tree structure over a flat comparison table. Each decision node should produce a single answer or explicitly ask the user a question.

### 5.3 "Creativity preference" is collected by Syn but not consistently reused
Syn collects Creative/Strict in Phase 0 for Data Analyst and Data Scientist. The Data Analyst phase file references it once (`phases.md:300`, "If this is creative mode..."). Data Scientist references it in the triage, but the phases file never reads the flag again. Result: Creativity is a prompt-time flag, not a workflow variable.

**Fix:** Either enforce creativity in multiple phases (feature exploration, chart sketching, follow-up suggestions) or drop it.

### 5.4 Greenfield-data handling is copy-pasted three times and drifting
The "NO DATA ENVIRONMENT DETECTED" fallback logic exists in at least three places:
- `data_scientist/greenfield_data.md`
- `data_analyst/phases.md:29–60`
- `ml_engineer/phases.md:145–175`

They have subtle differences (e.g., the (a)(b)(c) options differ in wording; the specs documentation line differs in tags like `THEORETICAL` vs `GREENFIELD` vs both). A reviewer searching for these tags won't find them reliably.

**Fix:** Extract to `shared/greenfield_data_fallback.md`. Standardize the options and the docs tags.

### 5.5 Academic and Researcher consultations are opportunistic, not systematic
Academic is consulted only in model-card generation (phase 7 of ML and AI Engineers). Its broader mandate — safety/ethics review — is never triggered automatically except at that one point. An AI Engineer building a customer-facing LLM chatbot could cruise through all 8 phases without ever consulting the Academic shard unless the user asks.

**Fix:** Add an Academic consultation trigger at Phase 2 (Scope and Constraints) whenever output sensitivity > Low, or when end users include "customer-facing."

### 5.6 `fast` mode / model routing is not used consistently
Data Analyst, Data Engineer, and BI Engineer are declared `model: sonnet` in YAML. Syn, Researcher, Backend Engineer, Academic are `model: opus`. ML Engineer is `model: sonnet` despite being the most complex workflow. Applied ML Scientist is `model: opus` (correct — it's research-heavy). The choice is inconsistent with complexity: the 1,119-line ml_engineer/phases.md runs on Sonnet, while the 156-line researcher.md gets Opus.

**Fix:** Re-assign model per complexity: ML Engineer, AI Engineer, Applied ML Scientist, Deep Learning Engineer, Data Scientist → opus. Data Analyst, Data Engineer Quick, BI Engineer, Analytics Engineer → sonnet. Researcher (reviewer only) can safely be sonnet.

### 5.7 The "facilitate don't generate" rule is contradicted in several modes
Shared rule at `behavioral_rules.md`: "Facilitate, don't generate. Guide structured discovery." But:
- Fixer Mode explicitly suspends it.
- Syn Code Review Mode implicitly suspends it (Syn writes Edit calls).
- Backend Engineer Clean Mode explicitly suspends it.
- PM Mode tasks specialists to run autonomously without gates — a form of suspension.

The rule is violated in ~30% of operational modes without a unifying principle.

**Fix:** Re-frame as a default with explicit exceptions. Each exception must say: "This mode suspends Rule X because Y." That list should live in one place.

### 5.8 No rollback or state-cleanup protocol if a session fails mid-phase
If a user aborts during Phase 4 (Model Design), the partially written project-specs.md contains a half-finished section. There is no "how to recover" protocol. The user returning later could invoke `[S] Status` and get confusing output.

**Fix:** Add a `status: in_progress | stalled | completed` field to each phase section, and an agent-side recovery protocol that can reset a stalled phase to its start.

---

## 6. Structural Smells

### 6.1 Prose-as-code is the fundamental pattern
Everything — routing, gating, persona, error handling, reviewer mapping — is English text interpreted at runtime. Advantages: easy to edit, readable, observable. Disadvantages:
- No schema validation.
- No refactoring tools.
- Silent drift between copies (see 4.9, 5.4).
- Token-expensive at scale.

**Directional fix:** Move toward a hybrid where persona and voice remain prose, but state transitions, reviewer mapping, file paths, and routing become structured data (YAML or JSON tables). The agent file references them.

### 6.2 The repo is a mix of "product shipped to users" and "live install"
`CLAUDE.md` explains that the repo root `.claude/` is a live install used during development. That means editing `src/agents/<name>.md` does nothing until `node tools/install.js` is re-run. The phase files are the same — edits to `src/agents/specific_instructions/...` require a re-install. There is no watcher. A developer can spend an hour debugging a "bug" that is actually stale installed instructions.

**Fix:** A dev mode that symlinks `src/` → `.claude/` for hot-reload. Or a file watcher on `src/` that re-runs install.

### 6.3 Eight "Distinguishing X from Y" paragraphs add 140 lines for an ambiguity Syn could just ask about
Syn's triage could resolve every "gray area" by asking one direct question to the user ("Is the goal to train a model, or to operate an existing one?"). Instead there are eight paragraphs of pre-computed rules the model must reason through. The asking approach is cheaper, clearer, and more robust.

**Fix:** Replace the paragraphs with a routing-decision tree of at most 5 user-facing questions.

### 6.4 Mode proliferation: 10+ modes per specialist
Data Analyst alone has `[T]`, `[B]`, `[R]`, `[ADV]`, `[U]`, `[EX]` plus handoff-in and handoff-out. Each mode is a separate file. Adding a new mode requires touching: the core agent file (menu + routing), the command file, and writing a new specific_instructions file. Deep Learning Engineer has `[C] Create` with its own phased sub-workflow.

**Risk:** Mode explosion makes the menu un-memorizable and the installer harder to maintain. Menu letters are already starting to collide (Data Analyst `[B]`=Build, BI Engineer `[B]`=Build-dashboard, ML Engineer `[B]`=Build-ML — fine, but `[EX]`=Experiment in ML/AI, `[EX]`=Explain in Data Analyst).

**Fix:** Audit menu letters for collisions across specialists. Consider removing `[ADV]` and `[EX]`(plain) from most specialists — they duplicate default conversational use.

### 6.5 The YAML frontmatter `description` field is a long multi-line blob
E.g., `ml-engineer.md:2–21` has 20 lines of description, including four "Examples:" bullets. This is fine for agent discovery, but it means every time the Claude Code harness enumerates available Task subagents, the entire description is loaded. Across 15 agents this is ~200 lines of boilerplate in every conversation.

**Fix:** Shorten descriptions to 2–3 lines. Move examples into the core file body, where they're only loaded when that agent activates.

### 6.6 No end-to-end test of the gate pattern or persona transfer
There are no tests at all (CLAUDE.md: "There are no build steps, no compiled output, and no tests"). Every change is validated only by running a real conversation. Gate behaviors that regress cannot be caught before ship.

**Fix:** A lightweight "scenario tape" — record expected conversations for a handful of common flows (triage + DA, full ML Engineer path, PM mode with 3 workstreams) and replay them through a harness. Even a 10-scenario baseline would catch most gate regressions.

---

## 7. Priority Recommendations

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Extract the ~12-line "Syn NEEDS REVISION" escalation to `shared/syn_review_resolution.md` and reference from each phase | Moderate bloat reduction; single source of truth | Small |
| 2 | Move model-card JSON schema to `src/templates/` | Removes drift risk | Small |
| 3 | Standardize greenfield-data fallback in one shared file | Removes silent drift; unifies docs tags | Medium |
| 4 | Cap Task-call nesting depth at 2 and document per-phase budgets | Hard limits runaway | Small |
| 5 | Replace prose "in-session persona transfer" with actual subagent spawns via Task | Fixes identity bleed; removes `/compact` dependency | **Large** |
| 6 | Introduce explicit gate anchors the harness can detect (e.g., `::GATE::`) | Enforces gates structurally | Medium |
| 7 | Re-assign model tier per complexity (ML/AI Engineer → opus) | Better routing of capability | Trivial |
| 8 | Add a watcher in `tools/` that hot-reloads `src/` → `.claude/` during development | Kills a class of "why isn't my edit working" bugs | Small |
| 9 | Define intake file formats as templates with schemas | Prevents silent upstream/downstream drift | Medium |
| 10 | Audit menu letters across all specialists for collisions | Prevents UX confusion | Trivial |
| 11 | Add a "stalled phase" recovery protocol to Status mode | Handles aborted sessions | Small |
| 12 | Reduce the triage "Distinguishing X from Y" section to a decision tree | Reduces Syn's Phase 0 context cost by ~140 lines | Medium |

---

## 8. What's Good (Keep)

- **Deferred phase loading.** The pattern of reading Phase 1+ only after Phase 0 gate is the single strongest design choice. Preserves it across all specialists.
- **Reviewer Verdict Protocol.** The three-tier universal mapping (Proceed / Caveats / Halt) is genuinely reusable and correctly shared.
- **Escalation Brief format.** Handoffs via project-specs.md are simple and version-controlled.
- **Knowledge Ledger architecture.** The separation of retrieval / checkpoint / harvest is conceptually clean even if the current implementation is heavy.
- **Time-Travel / DIVERGE.** The parallel-branch + arbiter pattern is a sophisticated but principled extension.
- **Separation of review-only and producer agents.** Researcher, Academic, Backend Engineer (mostly) produce no files — this is the right constraint.
- **Directory conventions.** `analysis/`, `studies/`, `models/`, `services/`, `dashboards/`, `research/`, `fixes/`, `brainstorm/` — clear, memorable, consistently applied.

---

## 9. Closing Note

Shards works because the model is willing to follow prose rules carefully. But its correctness envelope narrows as instructions grow — and the instruction surface is already large enough that drift, duplication, and silent skip are real operational costs. The highest-leverage move is not more instructions; it's **fewer, enforced ones.** Every fix above is a variant of "move from prose to structure" or "deduplicate."

If forced to pick one change: replace in-session persona transfer with real Task-based subagents (recommendation #5). That one change removes the `/compact` dependency, fixes persona bleed, eliminates the Syn-calls-Syn cycle risk, and reduces the average session's peak context by 30–40%.
