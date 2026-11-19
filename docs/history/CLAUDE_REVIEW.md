# Shards Agent Suite — System Review

**Date:** 2026-03-02
**Reviewer:** Claude Code (automated architectural review)
**Branch:** backend-eng
**Scope:** Full review of `src/agents/`, `src/commands/`, `src/templates/`, `tools/install.js`, and system architecture

---

## 1. Executive Summary

Shards is a well-architected, production-quality agent suite. The foundational design patterns — gate-enforced documentation, in-session persona transfer, and layered cross-agent consultation — are sound and consistently applied. The system successfully solves a hard problem: structured, multi-phase analytical work inside a stateless LLM context window.

The weaknesses are not architectural. They are gaps in the edges of the gate pattern: what happens when a user says "no," when a reviewer flags a problem, when a Task call fails, and when compliance risk is present. These are fixable with targeted prose additions to individual agent files. None require redesign.

---

## 2. Strengths

### 2.1 The Gate Pattern

The write → read-back → wait sequence is enforced consistently across all specialist agents through explicit prose: **"GATE: Do not proceed until the user confirms."** This is the strongest design decision in the system. It forces documentation to happen continuously rather than at the end, which is when documentation reliably doesn't happen. The gates are hard to accidentally bypass because they're woven into the phase narrative, not bolted on as checklists.

### 2.2 In-Session Persona Transfer

JFL's delegation mechanism — write specs, prompt for `/compact`, read specialist file, adopt persona — is an elegant solution to a genuine constraint. Context windows don't hold a full multi-phase project plus all the routing context. Rather than building a message-passing architecture, the system clears context deliberately and transfers identity in-session. This avoids the coordination failures typical in multi-agent pipelines (lost context, handoff gaps, inconsistent state) by making JFL and the specialist literally the same process.

### 2.3 Routing Logic Depth

JFL's routing section is comprehensive and precise. It covers not just which specialist handles what, but also the ambiguous boundaries: Data Scientist vs. ML Engineer, ML Engineer vs. AI Engineer, ML Engineer vs. MLOps Engineer, Analytics Engineer vs. Data Modeller, BI Engineer vs. Data Analyst. Each boundary comes with a decision rule and an explicit gray-area note. This level of disambiguation is unusual and valuable — without it, users would frequently land in the wrong shard for their actual problem.

### 2.4 Personality Differentiation

Each agent has a distinct, maintainable voice that serves a functional purpose beyond aesthetics. The Data Scientist being "condescending but correct" calibrates user expectations about depth. The AI Engineer being "existentially anxious" about whether AI is even needed is an embedded check against AI-for-AI's-sake designs. The Data Engineer being "grumpy" signals that cutting corners on data quality will be called out. These aren't just flavor — they encode domain values.

### 2.5 Layered Code Review Architecture

JFL's Code Review Mode is well-designed: JFL handles SQL, YAML, shell, and config files directly; Python and notebooks are delegated to the Backend Engineer via Task. This is appropriate domain partitioning. The Backend Engineer's review criteria (FastAPI patterns, Pydantic model tightness, OOP, modularization, data contracts) align with what matters in the ML/AI service context where the system operates.

### 2.6 Final Review Loop

Every specialist's last phase invokes JFL as final reviewer. JFL checks for documentation gaps, consistency between phases, undocumented decisions, and alignment with the original ask. This functions as a project-level integration test before execution begins. The APPROVED / NEEDS REVISION / BLOCKED verdict structure is clear and actionable.

### 2.7 Installation Tooling

The installer is robust for a file-distribution system: manifest-based tracking, `.backup` creation for changed files, `.gitignore` integration, output directory scaffolding, and clean uninstall. It handles both new installation and re-installation without clobbering existing work.

### 2.8 Greenfield Detection

Data Analyst and Data Scientist both explicitly detect when no data infrastructure exists and flag work as theoretical. This is a meaningful honesty mechanism — it prevents the system from producing queries against tables that don't exist and presenting them as validated results.

### 2.9 Track System (Quick vs. Deep)

The Quick/Deep track system in Data Engineer, Analytics Engineer, and BI Engineer is practical. It gates the depth of engagement upfront rather than letting scope creep happen mid-phase. The distinction is concrete: Quick is a single model or patch; Deep is architectural decisions or multi-mart builds.

### 2.10 Brainstorm Mode

The JFL Brainstorm mode (parallel Task calls to selected specialists, synthesis to file) is a sophisticated use of the Task orchestration layer. It converts the system from a linear project executor into an ideation engine without changing any specialist agent's design.

---

## 3. Weaknesses

### 3.1 Greenfield Gate — No "No" Path

**Severity: High**

Both Data Analyst (Phase 1) and Data Scientist (Phase 2) correctly detect greenfield states and ask "Do you want to proceed on a theoretical basis?" Neither defines what happens if the user says no. In practice the agent will either continue anyway or go conversationally off-script. Every gate must have a documented path for both answers.

**Fix options:**
- **Option A (Minimal):** Add a 3-choice exit branch (pause, escalate to DE, close) immediately after each greenfield gate question. Document the outcome in specs.
- **Option B (Structured):** Create a shared "greenfield protocol" prose block, paste it into both agents, and also add it to ML Engineer Phase 3 and AI Engineer Phase 3 (which have the same gap).
- **Option C (Template):** Add a `**Data environment:** GREENFIELD | VALIDATED` field to the analysis-template.md and study-template.md as a required field, forcing documentation of the state.

---

### 3.2 Reviewer Verdict Escalation — No Protocol

**Severity: High** — **RESOLVED (Option E, 2026-03-02)**

When a consulted reviewer (Researcher, Data Modeller, Applied ML Scientist, Deep Learning Engineer) returns a negative verdict, the calling agent's response is vague: "discuss alternatives before proceeding," "address any concerns." There is no defined re-gate protocol, no resubmission limit, and no arbitration path when two reviewers disagree.

**Fix options:**
- **Option A (Minimal):** Add a 3-tier table (Sound → proceed; Concerns → document and gate; Revise → halt, fix, resubmit once, then escalate to user if still failing) to each specialist's documentation section that receives reviewer verdicts.
- **Option B (Cross-cutting):** Create a shared behavioral rule section for verdict handling and paste it into all specialists' behavioral rules. Standardizes text, reduces drift across agents.
- **Option C (Partial):** Only add the table to the agents with the highest reviewer traffic (DS, MLE, AIE), accepting that less-used agents may still have the gap.
- **Option E (Full-Stack — chosen):** Fix on all three layers: (1) review-only agents get normalized verdict vocabulary + tier-mapping notes; (2) all five specialist agents receive a shared "Reviewer Verdict Protocol" behavioral block with 3-tier table, escalation script, resubmission cap, and multi-reviewer arbitration rules; (3) every reviewer Task call site gets structured verdict documentation fields (Verdict, Tier, Reviewer resolution) replacing vague "discuss" language.

**Implementation:**
- Pass 1 — `data-modeller.md`: "Issues Found" normalized to "Revise"; Verdict vocabulary subsection added to Behavioral Rules. `researcher.md`, `applied-ml-scientist.md`, `deep-learning-engineer.md`: tier-mapping note added after verdict definitions.
- Pass 2 — Shared `### Reviewer Verdict Protocol` block added to Behavioral Rules of: `data-scientist.md`, `ml-engineer.md`, `ai-engineer.md`, `analytics-engineer.md`, `data-engineer.md`.
- Pass 3 — Vague per-call action language replaced with protocol references at 12 locations across 5 specialist agents. Tier and Reviewer resolution fields added to all affected docs templates.

---

### 3.3 PII / Compliance Checkpoint Missing

**Severity: High**

No agent asks whether data contains PII before executing queries, engineering features, or training models. This is the highest-consequence gap: a GDPR violation is not recoverable the way a bad SQL query is. The gap appears at DA Phase 1, DS Phase 2, ML Engineer Phase 3, and AI Engineer Phase 3.

**Fix options:**
- **Option A (Minimal):** Add a 3-question PII check (does it contain PII? what type? is compliance review in place?) to DA Phase 1 and DS Phase 2. MLE and AIE can be added separately.
- **Option B (Full):** Add the same standard PII checkpoint to all four agents + a `**PII / sensitive data present:** Yes | No | Unknown` field to each relevant phase template. Ensures no agent starts data work without a documented compliance acknowledgment.
- **Option C (Agent):** Build a Privacy/Compliance specialist agent (as noted in BACKLOG.md) that specialists consult via Task at data discovery phases. Higher effort but creates a real expertise layer (GDPR, CCPA, model bias audit, data minimization).

---

### 3.4 Task Call Error Recovery Undefined

**Severity: Medium**

No agent defines behavior when a Task call returns an error, times out, or returns empty. The instructions assume Task calls always succeed. In practice, consultation calls will occasionally fail, and the correct behavior (document the skip, tell the user, get acknowledgment) is never specified.

**Fix options:**
- **Option A (Minimal):** Add a 3-step error handling clause to the behavioral rules of all agents that issue Task calls: note failure in specs, tell user, ask whether to proceed/retry/pause.
- **Option B (Selective):** Only add error handling to the agents that make the most Task calls (JFL, DS, MLE, AIE). Accepts the gap in lower-traffic agents.

---

### 3.5 DS Phase 3→4 Routing — Implicit Decision

**Severity: Medium**

In Data Scientist Phase 3, the decision about whether to proceed to Phase 4 (ML Modeling Design) or skip directly to Phase 5 is an inferred outcome of question classification, not an explicit user-confirmed gate. The template field `**Proceeds to Phase 4 (ML):** Yes | No` already exists — the problem is that the prose doesn't make the user confirm this routing before advancing. Skipping Phase 4 has downstream consequences on feature engineering and evaluation strategy.

**Fix options:**
- **Option A (Minimal):** Add a mandatory gate question in Phase 3 prose: "Based on the question type, this study [does/does not] require an ML modeling phase. Confirm before advancing."
- **Option B (None):** The template field already exists and technically captures the decision. Accept the current behavior as sufficient given Phase 3 gate confirmation implicitly covers the routing field.

---

### 3.6 Reproducibility Standards Absent

**Severity: Medium**

No agent requires random seed documentation, experiment IDs, or experiment tracking platform selection. Data Scientist Phase 6 asks about reproducibility intent but never mandates seed setting. ML Engineer similarly. Deep Learning Engineer Phase 3 already requires experiment tracking configuration — this standard hasn't propagated to the agents that need it most.

**Fix options:**
- **Option A (Minimal):** Add `**Random seed:** <integer>` and `**Experiment tracking:** <MLflow | W&B | None — rationale>` to DS Phase 4 and MLE Phase 4 documentation templates. Add seed-setting to DS Phase 6 notebook structure.
- **Option B (Propagate DLE standard):** Copy DLE's existing experiment tracking requirement verbatim into DS and MLE. Consistent with a standard already established in the system.

---

### 3.7 AI Engineer Evaluation Framework Underspecified

**Severity: Medium**

The AI Engineer describes evaluation harnesses (test sets, golden evals, metrics) but provides no structure for what constitutes a minimum viable eval. The gap matters most for production AI systems where regression thresholds and golden eval formats need to be decided before execution, not improvised during it.

**Fix options:**
- **Option A (Full template):** Add a required eval specification to AIE Phase 4 covering: minimum eval set size by deployment tier, required metrics by task type (classification, generation, RAG, agentic), golden eval format, and regression threshold.
- **Option B (Minimal):** Add a single required field `**Minimum eval set size:** N (minimum 100 for production, 50 for prototype)` and the golden eval file format. Defers metric specification to the agent's existing judgment.

---

### 3.8 /compact Dependency is Manual and Fragile

**Severity: Medium**

The in-session persona transfer requires the user to manually run `/compact` between JFL triage and specialist activation. If the user forgets, the specialist starts with full JFL context in the window, partially defeating the memory management purpose. There is no recovery path documented if the user skips `/compact` and signals readiness anyway.

**Fix options:**
- **Option A (Minimal):** Add a check in JFL's persona transfer step: "If the user signals readiness without confirming they ran `/compact`, ask once to confirm before reading the specialist file."
- **Option B (Graceful degrade):** Add a note that if `/compact` was skipped, the specialist should acknowledge the fuller context and note it may affect context window availability later in the session.
- **Option C (Accept risk):** The cost of a missed `/compact` is high context usage but not data loss. Accept this as a known user-side risk.

---

### 3.9 Academic Agent Scope Too Narrow

**Severity: Low-Medium**

The Academic agent explicitly limits itself to neuroscience, psychology, and cognitive science. It has no mandate for fairness/accountability/transparency (FAT-ML), algorithmic bias review, or legal/regulatory risk flagging. The AI Engineer already consults it for safety and ethics, but the Academic's current scope doesn't include the FAT-ML literature or regulatory dimensions most actionable for practitioners.

**Fix options:**
- **Option A (Scope expansion):** Add FAT-ML, algorithmic bias frameworks, and a legal risk flagging mandate (with explicit instruction not to provide legal advice) to the Academic's scope statement.
- **Option B (Defer to Privacy agent):** Accept the narrow scope and add bias/compliance review to the planned Privacy/Compliance agent instead. Avoids agent scope creep.

---

### 3.11 No Session Recovery Protocol

**Severity: Low**

If a session ends mid-phase (crash, disconnect, user leaves), there is no documented recovery path. Project-specs.md will contain partial documentation up to the last completed gate, but agents have no instruction for how to re-read that state and resume from the correct phase.

**Fix options:**
- **Option A (Minimal):** Add a recovery instruction to each specialist's activation section: "If project-specs.md exists with in-progress status, read it, identify the last completed phase gate, and offer to resume from the next phase."
- **Option B (JFL status check):** The existing Status Check Mode (`[S]`) in JFL is designed for this. Expand it to offer a "resume from last phase" action when an in-progress project is found.

---

## 4. Weakness Priority Table

| # | Weakness | Severity | Recommended Fix | Effort | Priority |
|---|----------|----------|-----------------|--------|----------|
| 3.1 | Greenfield "No" path undefined | High | Option B — 4-agent shared prose block with exit branches | Low | **1 — Do first** |
| 3.2 | Reviewer verdict escalation undefined | High | ~~Option B~~ Option E — Full-Stack Reviewer Verdict Protocol (vocabulary normalization + shared behavioral block + per-call verdict fields) | Medium | **Implemented** |
| 3.3 | PII / compliance checkpoint missing | High | Option B — standard checkpoint in DA/DS/MLE/AIE + template field | Low | **3 — Do first** |
| 3.4 | Task call error recovery undefined | Medium | Option A — 3-step error clause in behavioral rules of all Task-calling agents | Low | **4 — Do next** |
| 3.5 | DS Phase 3→4 routing implicit | Medium | Option A — mandatory gate question in Phase 3 prose | Low | **5 — Do next** |
| 3.6 | Reproducibility standards absent | Medium | Option B — propagate DLE standard to DS and MLE | Low | **6 — Do next** |
| 3.7 | AI Engineer eval underspecified | Medium | Option A — full eval spec template in AIE Phase 4 | Medium | **7 — Do next** |
| 3.8 | /compact step is manual and fragile | Medium | Option A — add confirmation check before persona transfer | Low | **8 — Do next** |
| 3.9 | Academic scope too narrow | Low-Medium | Option A — scope expansion to include FAT-ML and regulatory risk | Low | **9 — Do later** |
| 3.11 | No session recovery protocol | Low | Option B — expand JFL Status Check to offer phase-resume action | Low | **10 — Do later** |
| — | Missing Privacy/Compliance agent | High | Build new specialist agent (GDPR, CCPA, bias audit, consent review) | High | **12 — Plan separately** |

---

## 5. System-Level Observations

**The gate pattern is the load-bearing wall.** Everything that works in this system works because the gate forces documentation before advancement. Every weakness identified is a place where a gate exists but lacks a branch — a door without a path to the left. The fixes are all additive prose changes, not redesigns.

**The persona transfer is a bet on model behavior.** The system works because the model reliably reads and adopts the specialist file. There's no code enforcement of this — it's purely instruction-following. This is appropriate given the medium (LLM-based agents), but it means quality is sensitive to model degradation on long contexts. The `/compact` step is the only mitigation, and it's manual.

**The Task orchestration depth is correct.** Depth-2 nesting (JFL → specialist → JFL for review) is the right maximum. Going deeper would create coordination failures the system is explicitly designed to avoid.

**Agent count is at a maintainable ceiling.** Fifteen agents is sustainable only because the system uses a clear taxonomy (orchestrator, specialist, review-only) and consistent conventions. Adding agents beyond this count without equally strict conventions would degrade the routing logic's ability to disambiguate cleanly.

**The distribution model is the right call.** File copying rather than a live npm package means target projects can customize agents without breaking on upstream updates. The tradeoff (no automatic updates) is worth it for an agent suite where customization is a primary use case.
