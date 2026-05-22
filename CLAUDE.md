# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **shards** source repository — a suite of data-focused Claude Code agents published as an npm package. Users install it into their own projects with `npx github:proflandrigan/shards install`, which copies files from `src/` into their project's `.claude/` directory.

There are no build steps and no compiled output. There is a vitest test suite under `test/` (`test/gate-hook.test.js`, `test/permission-pattern.test.js`, `test/session-index.test.js`, plus `tools/gate-hook/__tests__/auto-verify.test.js`) — run it with `npm test` (`vitest run`).

The executables are `tools/install.js`, `tools/shards-ui.js`, `tools/shards-gates.js`, and `tools/shards-sessions.js` (Node.js v18+). All four are registered as bin commands in `package.json` (`shards`, `shards-ui`, `shards-gates`, `shards-sessions`). A separate `tools/migrate-gates.js` script is available for one-off gate-state migrations but is not exposed as a bin.

## Running the tools

```bash
node tools/install.js          # install into current working directory
node tools/install.js uninstall

node tools/shards-ui.js        # start UI server and open browser
node tools/shards-ui.js stop   # stop the UI server
node tools/shards-ui.js status # check if UI server is running

node tools/shards-gates.js status        # current gate state + recent history
node tools/shards-gates.js history       # full gate history
node tools/shards-gates.js violations    # violation log
node tools/shards-gates.js force-close   # operator override when a gate is stuck

npm test                       # run the vitest suite
```

The installer copies `src/agents/` → `.claude/agents/`, `src/commands/` → `.claude/commands/`, `src/templates/` → `templates/`, `src/ui/` → `.shards/ui/`, and `src/docs/` → both `.shards/ui/docs/` (served by the UI guide panel) and `docs/shards-guide/` (plain-markdown copy at the project root) in the target project. It also creates output directories (`analysis/`, `studies/`, `models/`, `data_models/`, `services/`, `research/`, `dashboards/`, `brainstorm/`, `fixes/`, `presentations/`, `projects/`, `panels/`), sets up the Knowledge Ledger at `.shards/knowledge/` (with `entities/`, `infrastructure/`, `patterns/`, `features/` subdirectories and an `INDEX.md`), installs gate-enforcement hooks under `.shards/hooks/gate-hook.js` (wired into `.claude/settings.json` via the `Stop`, `PreToolUse`, and `UserPromptSubmit` events), writes a manifest to `.claude/.shards-manifest.json` for uninstall tracking, and appends a Shards section to CLAUDE.md.

The `.claude/` directory at the repo root is a live installation used when working on shards itself. After editing source files, re-run `node tools/install.js` from the repo root to update it.

## Architecture

### Five file types in `src/`

**`src/commands/*.md`** — slash command entry points. Each command file is short (~30 lines). It sets the agent's persona, references the corresponding agent file path (`.claude/agents/<name>.md`), and contains the startup instructions. When a user runs `/shards` or `/data-analyst`, Claude reads this file and enters the described character.

**`src/agents/*.md`** — the core agent definitions. These contain each agent's persona, activation menu, Phase 0 (triage), mode references, and behavioral rules. Phased workflow instructions (Phase 1+) are deferred to `specific_instructions/<agent_name>/phases/` (or `phases_quick/` + `phases_deep/` for dual-track agents) — one file per phase, loaded progressively after Phase 0 completes. Each agent file has YAML frontmatter specifying `name`, `description`, `tools`, and `model`.

**`src/templates/*.md` + `src/templates/*.json`** — output document templates with `{{PLACEHOLDER}}` tokens. `project-specs.md` is the central one — every specialist project produces a filled-in instance. `project-plan.md` is the PM Mode equivalent (multi-specialist orchestration). `analysis-template.md`, `study-template.md`, and `report-template.md` are output-specific templates. `model-card.md` plus `model-card-schema.md` / `model-card-schema.json` cover ML/DL specialists. `branch-report.md` and `diff-report.md` support Time-Travel branching and cross-project comparison. `panel-report.md` and `panel-sequencing-plan.md` are produced by Syn's Panel Review mode. `presentation-spec.md` is produced by Syn's Slides mode. `research-brief.md` is produced by the Autonomous Research protocol. `knowledge-index.md` seeds the Knowledge Ledger INDEX.

**`src/ui/*.js` + `src/ui/index.html`** — the Shards web UI. Installed to `.shards/ui/` in target projects. The UI hooks into Claude Code via `UserPromptSubmit`, `Stop`, `PostToolUse`, and `PreToolUse` (Bash only) hooks configured in `.claude/settings.json`. Key files:

- `server.js` — HTTP/HTTPS server (ports 7842–7845, localhost-bound). Serves `index.html`, handles session storage under `.shards/sessions/`, exposes a REST API for the browser client. Uses a per-process auth token.
- `chat-session.js` — tracks a single Claude Code session: buffers tool calls, user prompts, and stop events into a session JSON file.
- `relay.js` — WebSocket relay that pushes live hook events from Claude Code to the browser.
- `ui-push.js` — thin client run by hooks; POSTs events to the relay.
- `spawn-server.js` / `open-browser.js` — called by the `/shards-ui` slash command to start the server and open the browser.
- `symbol-index.js` — ctags-based symbol indexing engine (with regex fallback) for code intelligence features in the UI. Builds and watches an in-memory index of symbols across the project.
- `permission-pattern.js` — parses and normalises Claude Code permission patterns (e.g., `Bash(python3:*)`) for the Permissions settings panel. Shared with `tools/gate-hook/` so the gate hook and UI agree on what is read-only.
- `session-index.js` — durable session index at `.shards/sessions/INDEX.json`. Records every chat (active / ended / abandoned) with agent, project, phase, last prompt, gate-open-at-end, etc. Read/written by `server.js` and the `shards-sessions` bin; powers the Sessions sidebar panel and the `/resume` and `/end` slash commands. Uses atomic-write (tmp + rename) and runs an abandonment sweep on server startup that reclassifies stale active rows past 24h.
- `notebook-kernel.py` — persistent Jupyter kernel helper used by Notebook Walkthrough mode (executes cells under `.shards/notebooks/<session>/`).
- `js/` — browser-side ES modules: `state.js`, `events.js`, `chat.js`, `agents.js`, `panels.js`, `tabs.js`, `explorer.js`, `file-view.js`, `table.js`, `tabular.js`, `notebook.js`, `notebook-walkthrough.js`, `monaco.js`, `markdown.js`, `split-view.js`, `command-palette.js`, `quick-open.js`, `settings.js`, `init.js`, `utils.js`, `bookmarks.js`, `code-intel.js`, `git.js`, `pinboard.js`, `selection-context.js`, `guide.js`, `hud.js`, `knowledge-map.js`, `terminal.js`, `timeline.js`, `sessions.js`.
- `css/` — browser-side stylesheets: `base.css`, `layout.css`, `sidebar.css`, `chat.css`, `editor.css`, `experiment.css`, `eval-dashboard.css`, `model-card.css`, `prompt-lab.css`, `theme-light.css`, `guide.css`, `knowledge-map.css`, `notebook-walkthrough.css`, `pr-review.css`, `brainstorm.css`, `terminal.css`, `sessions.css`.

**`src/docs/` (numbered section directories + `manifest.json` + `README.md`)** — the Shards Developer Guide, a single-source-of-truth reference for agents, protocols, the UI, commands, output directories, and example workflows. Content lives in eight numbered section directories (`01-getting-started/`, `02-agents/`, `03-protocols/`, `04-ui/`, `05-commands/`, `06-outputs/`, `07-workflows/`, `08-integrations/`) plus a top-level `README.md` landing page. `manifest.json` defines the TOC (sections → pages) and is the canonical source the UI guide panel reads. Installed to two places: `.shards/ui/docs/` (served by the UI guide panel — `openGuidePanel()` in `src/ui/js/guide.js`, routes `/docs/manifest` and `/docs/page` in `server.js`) and `docs/shards-guide/` at the project root for plain-markdown browsing. When editing guide content, update the corresponding markdown file under `src/docs/` and re-run `node tools/install.js` — do not edit the installed copies directly. If you add or remove a page, also update `manifest.json`.

### Agent taxonomy

| Type | Agents | Characteristics |
|------|--------|-----------------|
| Orchestrator | `syn` | Triages requests, creates project dir + specs, delegates to specialist via in-session persona transfer |
| Specialist | `data-analyst`, `data-scientist`, `ml-engineer`, `ai-engineer`, `data-engineer`, `data-modeller`, `analytics-engineer`, `applied-ml-scientist`, `deep-learning-engineer`, `bi-engineer`, `mlops-engineer`, `backend-engineer` | Phased workflow, gate pattern, invokes Syn for final review via Task |
| Review-only | `researcher`, `academic` | No phases, no files produced, consulted by specialists via Task calls |

### The gate pattern

Every specialist phase ends with the same sequence:
1. Write decisions to `project-specs.md`
2. Read the section back to the user
3. Wait for confirmation before advancing

Gates are machine-enforced via `::GATE:: ... ::ENDGATE::` fences parsed by three Claude Code hooks (`Stop`, `PreToolUse`, `UserPromptSubmit`) installed under `.shards/hooks/gate-hook.js`. The hook implementation lives in `tools/gate-hook.js` (entry point) and `tools/gate-hook/` (modules: `parser.js`, `classify.js`, `state.js`, `auto-state.js`, `auto-allowlist.js`, `validation.js`, `transcript.js`, `sql-guard.js`, `log.js`, plus `VALIDATION_SPEC.md`). State is tracked in `.shards/gates/state.json` (atomic tmp+rename writes so concurrent UI polls / hook invocations never observe partial JSON). Use `shards-gates status` for diagnostics and `shards-gates force-close` to unstick a session (also resets any open auto-verify block). Set `SHARDS_GATE_ENFORCE=0` to disable enforcement entirely.

**Gate kinds.** Every gate carries a `kind=` attribute drawn from this enum:

| kind | advances phase? | label | notes |
|------|-----------------|-------|-------|
| `phase` | yes | "Phase gate" | intermediate phase gate, the default |
| `final` | yes | "Final gate" | last phase of a track |
| `execute` | yes | "Execute gate" | an experiment / Autonomous Research iteration completed |
| `handoff` | yes | "Handoff gate" | specialist-to-specialist transition |
| `checkpoint` | no | "Checkpoint gate" | mid-build component seam — incremental testing punctuation |
| `confirm` | no | "Confirm gate" | micro-confirmation checkpoint used in AR loops |

Non-advancing kinds (`checkpoint`, `confirm`) are advisory under `SHARDS_CHECKPOINT_ENFORCE=0` — they are logged to the JSONL history but do not block subsequent tool calls. Phase / final / execute / handoff gates always enforce (only `SHARDS_GATE_ENFORCE=0` disables them). Unknown kinds are normalized to `phase` and a warning is recorded in `violations.jsonl`. `shards-gates checkpoints` merges advisory-mode checkpoints (which never enter `state.json.history`) with confirmed ones from `gates.jsonl`.

### Task tool orchestration

**Syn → Specialist:** After Phase 0 triage, Syn creates the project directory and `project-specs.md`, then prompts the user to run `/compact` to clear context. After the user signals readiness, Syn reads the specialist's agent file (`.claude/agents/<name>.md`) and performs an **in-session persona transfer** — Syn becomes the specialist for all subsequent phases. The specialist reads the existing `project-specs.md` and skips Phase 0.

**Specialist → Review agents:** Specialists call `Task(subagent_type="researcher", ...)` or `Task(subagent_type="data-modeller", ...)` at defined checkpoints within their phases. These are in-phase consultations, not handoffs.

**Specialist → Syn (final review):** Every specialist's final phase invokes `Task(subagent_type="syn", ...)` for sign-off. Syn returns APPROVED / NEEDS REVISION / BLOCKED.

This means a full `/shards` session is a depth-2 nested Task call: Syn spawns specialist; specialist spawns Syn for review.

### Output directory conventions

| Specialist | Directory |
|-----------|-----------|
| Data Analyst | `analysis/<project_name>/` |
| Data Scientist | `studies/<project_name>/` |
| Data Engineer | `models/<project_name>/` |
| Data Modeller, Analytics Engineer | `data_models/<project_name>/` |
| ML Engineer (greenfield) | `models/<project_name>/` |
| ML Engineer (iteration) | existing service directory |
| AI Engineer (greenfield) | `services/<project_name>/` |
| AI Engineer (iteration) | existing service directory |
| Applied ML Scientist | `research/<project_name>/` |
| Deep Learning Engineer | `services/<project_name>/` |
| MLOps Engineer | `services/<project_name>/` |
| BI Engineer | `dashboards/<project_name>/` |
| Syn (Fixer) | `fixes/<project_name>/` |
| Syn (Slides Mode) | `presentations/<deck_slug>/` |
| Syn (Panel Review) | `panels/<dirname>/` (default; user can override) |
| Syn (PM Mode) | `projects/<project_name>/` (writes `project-plan.md`; specialists still write into their own output dirs) |
| Syn (PR Review) | — (operates on a GitHub PR; no project directory produced) |
| Backend Engineer | — (review only, no files produced) |

### Progressive phase loading

Each specialist agent is split into a core file plus a per-phase directory:

1. **Core file** (`src/agents/<name>.md`, ~250-550 lines) — persona, activation menu, Phase 0, mode references, behavioral rules. Loaded immediately on invocation.
2. **Phases directory** (`src/agents/specific_instructions/<agent_name>/phases/`) — one `index.md` that lists all phases with 1-line goals, plus one `phase-<N>.md` per phase containing the full phase body (instructions, doc template, gate). Agents load the index first (to orient), then `phase-1.md`. When each phase's gate is confirmed, that phase's file directs the agent to read the next phase file. This keeps only one phase's content in context at a time.

The core file's "Phase Progression" section instructs Claude to read the index then `phase-1.md`. Phase-<N>.md ends with a `## When this gate is confirmed` block that points to `phase-<N+1>.md` (or to the final-phase wrap-up). Phase numbering uses a dash for subphases (e.g., ml_engineer's optional `phase-6-5.md`).

**Dual-track agents** (analytics_engineer, data_modeller, data_engineer) have two sibling directories: `phases_quick/` and `phases_deep/`, each with its own `index.md`. The core file's Phase Progression section directs the agent to the right track index based on Phase 0 decisions.

**Create Mode agents** (deep_learning_engineer, applied_ml_scientist) use the same layout — their phases are numbered 1-5 and labeled "Create Mode — Phase N".

**Gate IDs** follow the scheme `<kebab-agent-name>-phase-<N>` (e.g., `ml-engineer-phase-1`, `analytics-engineer-deep-phase-7`, `ml-engineer-phase-6-5`). Every gate carries `phase=<N>` matching its phase number and a `kind=` attribute from the enum above (`phase | final | checkpoint | execute | confirm | handoff`). Gates that front a validation-eligible build phase also carry `validates=<agent_name>`; non-advancing kinds (`checkpoint`, `confirm`) never carry `validates=` since validation evidence is a phase-gate concern. The `SHARDS_CHECKPOINT_ENFORCE=0` env var downgrades non-advancing gates to advisory; `SHARDS_GATE_ENFORCE=0` still disables all gate enforcement.

### Editing workflow

When changing agent behavior:

- **Persona, activation, Phase 0, or behavioral rules:** edit `src/agents/<name>.md`
- **Phased workflow (Phase 1+):** edit the relevant file under `src/agents/specific_instructions/<agent_name>/phases/` (or `phases_quick/` / `phases_deep/` for dual-track agents). Each phase lives in its own `phase-<N>.md`. If you add or remove a phase, also update the `index.md` table and the "When this gate is confirmed" pointer in the adjacent phase files.
- **Command file** (`src/commands/`): only edit if startup instructions or persona framing change
- **Templates** (`src/templates/`): only edit if output document structure changes
- **Developer Guide** (`src/docs/`): only edit when agents, protocols, UI features, commands, or output directories change. Update the relevant page and, if adding/removing pages, also update `src/docs/manifest.json`.

After editing source files, re-run `node tools/install.js` in any target project to pick up the changes.

### Shared behavioral files

`specific_instructions/shared/` contains cross-cutting files referenced by agents:

- **`behavioral_rules.md`** — the four rules every specialist must follow: document before advancing, one phase at a time, announce cross-agent reviews, facilitate don't generate. Referenced from each agent's Behavioral Rules section to avoid duplication.
- **`engineering_guidelines.md`** — code-craft rules applied when writing or editing code, SQL, notebooks, or configuration artifacts: think before coding (surface assumptions, present alternatives), simplicity first (no speculative features or abstractions), surgical changes (touch only what's required, match existing style), goal-driven execution (define verifiable success criteria before writing code). Cross-references `validation_protocol.md` and `incremental_testing.md`. Referenced from each specialist's Behavioral Rules section alongside `behavioral_rules.md`.
- **`reviewer_verdict_protocol.md`** — the three-tier verdict system (APPROVED / NEEDS REVISION / BLOCKED) used by Syn and all reviewer agents when returning sign-off decisions.
- **`diverge_protocol.md`** — Time-Travel branching protocol for parallel experimentation. Defines fork-execute-converge lifecycle, branch spawning via Task, and Syn arbiter convergence.
- **`experiment_versioning.md`** — versioning protocol for experiment mode. Detects DVC or git and creates checkpoints after each experiment result.
- **`join_path_protocol.md`** — self-check protocol for tracing join paths before writing or executing multi-table SQL.
- **`knowledge_harvest.md`** — protocol for extracting reusable knowledge at project completion. Agents present candidates for user confirmation before writing to the Knowledge Ledger.
- **`autonomous_research.md`** — `[AR]` Autonomous Research mode protocol. Budget-bounded self-steering loop with adaptive hypothesis generation, auto-keep/revert, steering document the user can edit mid-loop, windowed history reads, dual reviewer cadence. Sections A-G cover solo AR; Section H covers AR fan-out (parallel approach families via DIVERGE composition); Section I covers Phase 3 research summary. Referenced by ML Engineer, AI Engineer, Data Scientist, Applied ML Scientist, and Deep Learning Engineer from their `research.md` files.
- **`knowledge_retrieval.md`** — protocol for checking the Knowledge Ledger before Phase 1. Agents scan INDEX.md for entries relevant to the current project.
- **`incremental_testing.md`** — mid-build testing contract for notebook and pipeline specialists (ML, DS, AI, AMS, DLE, DE, AE, MLOps). Between each component written (notebook cell group, dbt model, pipeline step, etc.) the agent executes the component, records evidence, and emits a `kind=checkpoint` gate. Prevents the build-then-run-all pathology where failures surface only at the end. Referenced from each agent's build-phase file.
- **`auto_verify_mode.md`** — scope-bounded auto-approval for bulk read-only verification stretches (per-model grain checks, fan-out queries, dbt show/ls, SELECT-only warehouse-CLI SQL). Agents emit `::AUTO-VERIFY:: ... ::ENDAUTO::` markers and the gate hook auto-approves tool calls matching a hardcoded read-only allowlist (with budget + TTL bounds). Phase/checkpoint gates always win. Disabled by `SHARDS_AUTO_VERIFY=0`. Referenced from Data Modeller, Analytics Engineer, Data Engineer, Data Analyst phases that run bulk validation, plus the join-path protocol.
- **`validation_protocol.md`** — shared validation contract. Every specialist must produce evidence of output correctness (executed test, query result, sanity check) before closing build/execute phases. Referenced from `engineering_guidelines.md`, the build-phase files of each pipeline/notebook specialist, and the agent-specific `validation_checklist.md` files.
- **`knowledge_checkpoint.md`** — mid-phase knowledge re-grounding protocol. Specialists pause inline during execution phases to re-read relevant Knowledge Ledger entries before continuing, so verified facts beat stale model assumptions.
- **`notebook_walkthrough_protocol.md`** — shared protocol for `[NW]` Notebook Walkthrough mode: cell-by-cell live execution via `notebook-kernel.py`, watched state JSON at `<project>/.shards/notebook-walkthrough.json`, and the UI's `notebook-walkthrough` panel type. Used by Data Scientist, ML Engineer, and Syn variants.
- **`goal_mode.md`** — opt-in `/goal` activation that runs gate-free autonomous loops. Currently surfaces in AR Phase 2 and Experiment Phase 2 — once the user declares a goal, the loop runs without phase-gate confirmations until the budget/convergence stop condition fires.

### Variant files in `specific_instructions/`

Each agent has a subdirectory under `specific_instructions/` (e.g., `specific_instructions/data_analyst/`). Beyond the `phases/` directories (core workflow), these subdirectories contain mode variants and other files:

- **Mode variants:** `review.md`, `advise.md`, `explain.md`, `update.md`, `clean.md` — referenced by core agent files for `[R]`, `[ADV]`, `[EX]`, `[U]`, `[C]` menu options
- **Validation checklists:** `validation_checklist.md` exists for each build/execute specialist (ai_engineer, analytics_engineer, applied_ml_scientist, bi_engineer, data_analyst, data_engineer, data_modeller, data_scientist, deep_learning_engineer, ml_engineer, mlops_engineer). Read inline during build phases to satisfy `shared/validation_protocol.md`.
- **UI mode:** `data_analyst/ui_mode.md`, `analytics_engineer/ui_mode.md` — variant invoked by the Shards UI to push structured output for the browser client
- **Service mode:** `analytics_engineer/service_mode.md`, `data_modeller/service_mode.md`, `researcher/service_mode.md`, `data_scientist/service_mode.md`, `ml_engineer/service_mode.md`, `mlops_engineer/service_mode.md`, `backend_engineer/service_mode.md` — stripped-down mode used when these agents are consulted as reviewers via Task by other specialists. The Data Scientist and ML Engineer service modes specifically handle domain-aware Jupyter notebook (`.ipynb`) code review (code quality, bugs, data leakage, split discipline, feature/modelling logic) — routed by project directory prefix (`studies/`/`analysis/` → Data Scientist; `models/`/`research/`/`services/` → ML Engineer).
- **Critical Review (`[CR]`):** `researcher/critical_review.md`, `academic/critical_review.md` — review-only specialists can perform a more adversarial critique pass than their default `[R]` review.
- **Syn modes:** `syn/brainstorm.md` (also has a `/brainstorm` command entry point — Phase 1 spawns all selected specialists in parallel via a single multi-Task message, writes a live `brainstorm/brainstorm_<project>.state.json` sidecar, and pushes a `brainstorm` UI panel via `ui-push.js`; renderer in `src/ui/js/panels.js`, styles in `src/ui/css/brainstorm.css`), `syn/final_review.md` (read when specialists invoke Syn for sign-off via Task), `syn/code_review.md` (triggered when a specialist calls Task with `CODE REVIEW MODE` — partitions artifacts by type and routes: `.sql` → Analytics Engineer, `.py` → Backend Engineer, `.ipynb` → Data Scientist or ML Engineer by project directory prefix, config/infra → MLOps Engineer), `syn/fixer.md` (the `[F]` menu option — Syn directly implements minor fixes without specialist handoff, suspending the "facilitate don't generate" rule), `syn/arbiter.md` (Time-Travel branch comparison — reads all branch reports, builds leaderboard, returns advisory recommendation), `syn/diff.md` (cross-project comparison — reads two project directories and produces structured diff report), `syn/knowledge.md` (also has a `/knowledge` command entry point — seed, browse, and manage the Knowledge Ledger), `syn/slides.md` (the `[SL]` menu option — Syn drafts a Google Slides deck via MCP, polling specialists in parallel at outline pre-build and post-build fidelity checkpoints; suspends "facilitate don't generate" and "don't do the specialist's job"; output to `presentations/<deck_slug>/`; depends on a user-level Google Slides MCP), `syn/panel_review.md` (the `[PR]` menu option — multi-specialist Panel Review of any directory; reviewer selection driven by `(file types found) × (content tags the user declares)`, not by directory prefix; ideal of two reviewers per file-type bucket; coalesces findings into a single prioritized report and produces a sequencing plan with execution groups so conflicting fixes serialize and independent fixes parallelize; the Researcher gains net-new capability to review `.ipynb`, analysis-domain `.sql`, and study/analysis reports for statistical rigor — its recommendations are routed to the bucket's primary domain reviewer for application; output to `panels/<dirname>/`; suspends "facilitate don't generate" but keeps "don't do the specialist's job" — Syn never edits target files, reviewers apply fixes via service-mode Tasks), `syn/pm.md` (the `[P]` Project Manager menu option — Syn orchestrates a multi-specialist project by writing a `project-plan.md` to `projects/<project_name>/` and then delegating each phase of work to the right specialist; each specialist still produces its own outputs in its own directory and its own `project-specs.md`), `syn/pr_review.md` (the `[G]` GitHub PR menu option, also reached via the `/review-pr` command — Syn walks through GitHub PR review comments with the user, proposes a change per comment, and applies it on approval)
- **Experiment:** `ml_engineer/experiment.md`, `ai_engineer/experiment.md`, `data_scientist/experiment.md` — plus `ml_engineer/experiment_ui_mode.md` and `ai_engineer/experiment_ui_mode.md` for Shards UI integration of experiment mode
- **Autonomous Research:** `ml_engineer/research.md`, `ai_engineer/research.md`, `data_scientist/research.md`, `applied_ml_scientist/research.md`, `deep_learning_engineer/research.md` — `[AR]` mode for each agent, referenced from the core agent file. Tier 1 agents (ML/AI/DS) also have `research_ui_mode.md` variants that reuse the `experiment-dashboard` panel type (the renderer detects `mode: "autonomous-research"` in `results.json` and renders AR enrichments — auto-decision color coding, cost strip, convergence badge).
- **Prompt Lab:** `ai_engineer/prompt_lab.md`, `ai_engineer/prompt_lab_ui_mode.md` — interactive prompt editing, evaluation, and versioning via the Shards UI `prompt-lab` panel type
- **Notebook Walkthrough:** `data_scientist/notebook_walkthrough.md`, `ml_engineer/notebook_walkthrough.md`, `syn/notebook_walkthrough.md` — `[NW]` mode for each agent, plus a shared protocol at `shared/notebook_walkthrough_protocol.md` and a `/notebook-walkthrough` slash command. Live cell-by-cell walkthrough of a Jupyter notebook: agent executes cells via the `notebook-kernel.py` helper (persistent kernel under `.shards/notebooks/<session>/`), explains each cell, takes questions, and edits/inserts/deletes cells via `NotebookEdit`. Watched state JSON at `<project>/.shards/notebook-walkthrough.json` drives the UI's `notebook-walkthrough` panel type. Interactive only — no phases, no gates, no project-specs.md. Requires `pip install jupyter_client ipykernel` in the project's Python env.
- **BI handoffs:** `ai_engineer/bi_engineer_handoff.md`, `ml_engineer/bi_engineer_handoff.md`, `data_scientist/bi_engineer_handoff.md`, `analytics_engineer/bi_engineer_handoff.md` — specialist variants that hand off to the BI Engineer
- **DA handoffs:** `analytics_engineer/data_analyst_handoff.md`, `bi_engineer/data_analyst_handoff.md` — variants that hand off to the Data Analyst
- **Handoff receivers:** `bi_engineer/incoming_handoff.md`, `data_analyst/incoming_handoff.md` — receiver-side instructions for agents accepting a structured handoff brief from another specialist
- **Explain:** `data_analyst/explain.md`, `data_scientist/explain.md` — explanation-focused variants
- **DS handoffs:** `data_scientist/greenfield_data.md`, `data_scientist/ml_engineer_handoff.md` — Data Scientist variants for greenfield data work and ML Engineer handoff
- **Service mode (Backend):** `backend_engineer/service_mode.md` — stripped-down mode used when the Backend Engineer is consulted as a `.py` script reviewer via Task by other specialists. Notebooks (`.ipynb`) are explicitly out of Backend Engineer scope — they route to the Data Scientist or ML Engineer service modes.
- **Review checklists:** `backend_engineer/review_checklist.md`, `researcher/review_checklist.md` — review checklists used during service-mode consultations
- **Report:** `academic/report.md` — Academic shard variant for producing full literature review / research report documents
