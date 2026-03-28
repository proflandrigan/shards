# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **shards** source repository — a suite of data-focused Claude Code agents published as an npm package. Users install it into their own projects with `npx github:proflandrigan/shards install`, which copies files from `src/` into their project's `.claude/` directory.

There are no build steps, no compiled output, and no tests. The executables are `tools/install.js` and `tools/shards-ui.js` (Node.js v18+). Both are registered as bin commands in `package.json` (`shards` and `shards-ui`).

## Running the tools

```bash
node tools/install.js          # install into current working directory
node tools/install.js uninstall

node tools/shards-ui.js        # start UI server and open browser
node tools/shards-ui.js stop   # stop the UI server
node tools/shards-ui.js status # check if UI server is running
```

The installer copies `src/agents/` → `.claude/agents/`, `src/commands/` → `.claude/commands/`, `src/templates/` → `templates/`, and `src/ui/` → `.shards/ui/` in the target project. It also creates output directories (`analysis/`, `studies/`, `models/`, `data_models/`, `services/`, `research/`, `dashboards/`, `brainstorm/`), writes a manifest to `.claude/.shards-manifest.json` for uninstall tracking, and appends a Shards section to CLAUDE.md.

The `.claude/` directory at the repo root is a live installation used when working on shards itself. After editing source files, re-run `node tools/install.js` from the repo root to update it.

## Architecture

### Four file types in `src/`

**`src/commands/*.md`** — slash command entry points. Each command file is short (~30 lines). It sets the agent's persona, references the corresponding agent file path (`.claude/agents/<name>.md`), and contains the startup instructions. When a user runs `/shards` or `/data-analyst`, Claude reads this file and enters the described character.

**`src/agents/*.md`** — the core agent definitions. These contain each agent's persona, activation menu, Phase 0 (triage), mode references, and behavioral rules. Phased workflow instructions (Phase 1+) are deferred to `specific_instructions/<agent_name>/phases.md` files that load on-demand after Phase 0 completes. Each agent file has YAML frontmatter specifying `name`, `description`, `tools`, and `model`.

**`src/templates/*.md`** — output document templates with `{{PLACEHOLDER}}` tokens. `project-specs.md` is the central one — every project produces a filled-in instance. `analysis-template.md`, `study-template.md`, and `report-template.md` are output-specific templates used by the Data Analyst, Data Scientist, and other specialists respectively.

**`src/ui/*.js` + `src/ui/index.html`** — the Shards web UI. Installed to `.shards/ui/` in target projects. The UI hooks into Claude Code via `UserPromptSubmit`, `Stop`, and `PostToolUse` hooks configured in `.claude/settings.json`. Key files:

- `server.js` — HTTP/HTTPS server (ports 7842–7845, localhost-bound). Serves `index.html`, handles session storage under `.shards/sessions/`, exposes a REST API for the browser client. Uses a per-process auth token.
- `chat-session.js` — tracks a single Claude Code session: buffers tool calls, user prompts, and stop events into a session JSON file.
- `relay.js` — WebSocket relay that pushes live hook events from Claude Code to the browser.
- `ui-push.js` — thin client run by hooks; POSTs events to the relay.
- `spawn-server.js` / `open-browser.js` — called by the `/shards-ui` slash command to start the server and open the browser.
- `symbol-index.js` — ctags-based symbol indexing engine (with regex fallback) for code intelligence features in the UI. Builds and watches an in-memory index of symbols across the project.
- `js/` — browser-side ES modules: `state.js`, `events.js`, `chat.js`, `agents.js`, `panels.js`, `tabs.js`, `explorer.js`, `file-view.js`, `table.js`, `tabular.js`, `notebook.js`, `monaco.js`, `markdown.js`, `split-view.js`, `command-palette.js`, `quick-open.js`, `settings.js`, `init.js`, `utils.js`, `bookmarks.js`, `code-intel.js`, `git.js`, `pinboard.js`, `selection-context.js`.
- `css/` — browser-side stylesheets: `base.css`, `layout.css`, `sidebar.css`, `chat.css`, `editor.css`, `experiment.css`, `theme-light.css`.

### Agent taxonomy

| Type | Agents | Characteristics |
|------|--------|-----------------|
| Orchestrator | `jfl` | Triages requests, creates project dir + specs, delegates to specialist via in-session persona transfer |
| Specialist | `data-analyst`, `data-scientist`, `ml-engineer`, `ai-engineer`, `data-engineer`, `data-modeller`, `analytics-engineer`, `applied-ml-scientist`, `deep-learning-engineer`, `bi-engineer`, `mlops-engineer`, `backend-engineer` | Phased workflow, gate pattern, invokes JFL for final review via Task |
| Review-only | `researcher`, `academic` | No phases, no files produced, consulted by specialists via Task calls |

### The gate pattern

Every specialist phase ends with the same sequence:
1. Write decisions to `project-specs.md`
2. Read the section back to the user
3. Wait for confirmation before advancing

This is enforced by prose in each agent file — "**GATE: Do not proceed until the user confirms.**" Documentation IS the gate.

### Task tool orchestration

**JFL → Specialist:** After Phase 0 triage, JFL creates the project directory and `project-specs.md`, then prompts the user to run `/compact` to clear context. After the user signals readiness, JFL reads the specialist's agent file (`.claude/agents/<name>.md`) and performs an **in-session persona transfer** — JFL becomes the specialist for all subsequent phases. The specialist reads the existing `project-specs.md` and skips Phase 0.

**Specialist → Review agents:** Specialists call `Task(subagent_type="researcher", ...)` or `Task(subagent_type="data-modeller", ...)` at defined checkpoints within their phases. These are in-phase consultations, not handoffs.

**Specialist → JFL (final review):** Every specialist's final phase invokes `Task(subagent_type="jfl", ...)` for sign-off. JFL returns APPROVED / NEEDS REVISION / BLOCKED.

This means a full `/shards` session is a depth-2 nested Task call: JFL spawns specialist; specialist spawns JFL for review.

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
| BI Engineer | `dashboards/<project_name>/` |
| Backend Engineer | — (review only, no files produced) |

### Deferred phase loading

Each specialist agent is split into two files:

1. **Core file** (`src/agents/<name>.md`, ~250-550 lines) — persona, activation menu, Phase 0, mode references, behavioral rules. Loaded immediately on invocation.
2. **Phases file** (`src/agents/specific_instructions/<agent_name>/phases.md`, ~350-870 lines) — Phase 1+ workflow instructions. Loaded on-demand after Phase 0 gate passes.

The core file contains a "Phase Progression" section that instructs Claude to `Read .claude/agents/specific_instructions/<agent_name>/phases.md in full` when it's time to advance past Phase 0. This uses the same proven pattern as Review, Advisory, and Explain mode references.

Agents with Quick/Deep tracks (analytics-engineer) have separate `quick_phases.md` and `deep_phases.md` files instead of a single `phases.md`. Agents with Create Mode (deep-learning-engineer, applied-ml-scientist) defer the Create Mode phases.

### Editing workflow

When changing agent behavior:

- **Persona, activation, Phase 0, or behavioral rules:** edit `src/agents/<name>.md`
- **Phased workflow (Phase 1+):** edit `src/agents/specific_instructions/<agent_name>/phases.md`
- **Command file** (`src/commands/`): only edit if startup instructions or persona framing change
- **Templates** (`src/templates/`): only edit if output document structure changes

After editing source files, re-run `node tools/install.js` in any target project to pick up the changes.

### Shared behavioral files

`specific_instructions/shared/` contains two cross-cutting files referenced by all agents:

- **`behavioral_rules.md`** — the four rules every specialist must follow: document before advancing, one phase at a time, announce cross-agent reviews, facilitate don't generate. Referenced from each agent's Behavioral Rules section to avoid duplication.
- **`reviewer_verdict_protocol.md`** — the three-tier verdict system (APPROVED / NEEDS REVISION / BLOCKED) used by JFL and all reviewer agents when returning sign-off decisions.

### Variant files in `specific_instructions/`

Each agent has a subdirectory under `specific_instructions/` (e.g., `specific_instructions/data_analyst/`). Beyond the `phases.md` files (core workflow), these subdirectories contain mode variants and other files:

- **Mode variants:** `review.md`, `advise.md`, `explain.md`, `update.md`, `clean.md` — referenced by core agent files for `[R]`, `[ADV]`, `[EX]`, `[U]`, `[C]` menu options
- **UI mode:** `data_analyst/ui_mode.md`, `analytics_engineer/ui_mode.md` — variant invoked by the Shards UI to push structured output for the browser client
- **Service mode:** `analytics_engineer/service_mode.md`, `data_modeller/service_mode.md` — stripped-down mode used when these agents are consulted as reviewers via Task by other specialists
- **JFL modes:** `jfl/brainstorm.md` (also has a `/brainstorm` command entry point), `jfl/final_review.md` (read when specialists invoke JFL for sign-off via Task), `jfl/code_review.md` (triggered when a specialist calls Task with `CODE REVIEW MODE` — partitions and reviews Python and non-Python artifacts), `jfl/fixer.md` (the `[F]` menu option — JFL directly implements minor fixes without specialist handoff, suspending the "facilitate don't generate" rule)
- **Experiment:** `ml_engineer/experiment.md`, `ai_engineer/experiment.md` — plus `ml_engineer/experiment_ui_mode.md` and `ai_engineer/experiment_ui_mode.md` for Shards UI integration of experiment mode
- **BI handoffs:** `ai_engineer/bi_handoff.md`, `ml_engineer/bi_handoff.md`, `data_scientist/bi_handoff.md`, `analytics_engineer/bi_handoff.md` — specialist variants that hand off to the BI Engineer
- **DA handoffs:** `analytics_engineer/da_handoff.md`, `bi_engineer/da_handoff.md` — variants that hand off to the Data Analyst
- **Handoff receivers:** `bi_engineer/handoff.md`, `data_analyst/handoff.md` — receiver-side instructions for agents accepting a structured handoff brief from another specialist
- **Explain:** `data_analyst/explain.md`, `data_scientist/explain.md` — explanation-focused variants
- **DS handoffs:** `data_scientist/greenfield_data.md`, `data_scientist/ml_engineer_handoff.md` — Data Scientist variants for greenfield data work and ML Engineer handoff
- **Checklists:** `backend_engineer/checklist.md`, `researcher/checklist.md` — review checklists used during service-mode consultations
- **Report:** `academic/report.md` — Academic shard variant for producing full literature review / research report documents
