# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **shards** source repository — a suite of data-focused Claude Code agents published as an npm package. Users install it into their own projects with `npx github:USERNAME/shards install`, which copies files from `src/` into their project's `.claude/` directory.

There are no build steps, no compiled output, and no tests. The only executable is `tools/install.js` (Node.js v18+), which copies source files into target projects.

## Running the installer

```bash
node tools/install.js          # install into current working directory
node tools/install.js uninstall
```

The installer copies `src/agents/` → `.claude/agents/`, `src/commands/` → `.claude/commands/`, and `src/templates/` → `templates/` in the target project. It also creates output directories (`analysis/`, `studies/`, `models/`, `data_models/`, `services/`) and appends a Shards section to CLAUDE.md.

The `.claude/` directory at the repo root is a live installation used when working on shards itself. After editing source files, re-run `node tools/install.js` from the repo root to update it.

## Architecture

### Three file types in `src/`

**`src/commands/*.md`** — slash command entry points. Each command file is short (~30 lines). It sets the agent's persona, references the corresponding agent file path (`.claude/agents/<name>.md`), and contains the startup instructions. When a user runs `/shards` or `/data-analyst`, Claude reads this file and enters the described character.

**`src/agents/*.md`** — the core agent definitions. These contain each agent's persona, activation menu, Phase 0 (triage), mode references, and behavioral rules. Phased workflow instructions (Phase 1+) are deferred to `specific_instructions/<name>_phases.md` files that load on-demand after Phase 0 completes. Each agent file has YAML frontmatter specifying `name`, `description`, `tools`, and `model`.

**`src/templates/*.md`** — output document templates with `{{PLACEHOLDER}}` tokens. `project-specs.md` is the central one — every project produces a filled-in instance of it.

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
2. **Phases file** (`src/agents/specific_instructions/<name>_phases.md`, ~350-870 lines) — Phase 1+ workflow instructions. Loaded on-demand after Phase 0 gate passes.

The core file contains a "Phase Progression" section that instructs Claude to `Read .claude/agents/specific_instructions/<name>_phases.md in full` when it's time to advance past Phase 0. This uses the same proven pattern as Review, Advisory, and Explain mode references.

Agents with Quick/Deep tracks (analytics-engineer, data-modeller, data-engineer) keep their Explore track in the core file (non-phased) and defer both Quick and Deep track phases. Agents with Create Mode (deep-learning-engineer, applied-ml-scientist) defer the Create Mode phases.

### Editing workflow

When changing agent behavior:

- **Persona, activation, Phase 0, or behavioral rules:** edit `src/agents/<name>.md`
- **Phased workflow (Phase 1+):** edit `src/agents/specific_instructions/<name>_phases.md`
- **Command file** (`src/commands/`): only edit if startup instructions or persona framing change
- **Templates** (`src/templates/`): only edit if output document structure changes

After editing source files, re-run `node tools/install.js` in any target project to pick up the changes.

### Variant files in `specific_instructions/`

Beyond the `_phases.md` files (core workflow), `specific_instructions/` also contains mode variants and experimental files:

- **Mode variants** (copied by installer): `*_review.md`, `*_advise.md`, `*_explain.md`, `*_update.md` — referenced by core agent files for `[R]`, `[ADV]`, `[EX]`, `[U]` menu options
- **Brainstorm:** `jfl_brainstorm.md` (also has a `/brainstorm` command entry point in `src/commands/brainstorm.md`)
- **Experiment:** `ml_engineer_experiment.md`, `ai_engineer_experiment.md`
- **BI handoffs:** `ai_engineer_bi_handoff.md`, `ml_engineer_bi_handoff.md`, `data_scientist_bi_handoff.md`, `analytics_engineer_bi_handoff.md` — specialist variants that hand off to the BI Engineer at the end of their workflow
- **DA handoffs:** `analytics_engineer_da_handoff.md`, `bi_engineer_da_handoff.md` — variants that hand off to the Data Analyst
- **Explain:** `data_analyst_explain.md`, `data_scientist_explain.md` — explanation-focused variants
