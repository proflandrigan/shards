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

The installer copies `src/agents/` → `.claude/agents/`, `src/commands/` → `.claude/commands/`, and `src/templates/` → `templates/` in the target project. It also creates output directories (`analysis/`, `studies/`, `models/`, `services/`) and appends a Shards section to CLAUDE.md.

## Architecture

### Three file types in `src/`

**`src/commands/*.md`** — slash command entry points. Each command file is short (~30 lines). It sets the agent's persona, references the corresponding agent file path (`.claude/agents/<name>.md`), and contains the startup instructions. When a user runs `/shards` or `/data-analyst`, Claude reads this file and enters the described character.

**`src/agents/*.md`** — the full agent definitions. These are the authoritative source of truth for each agent's persona, phased workflow, gate rules, documentation templates, cross-agent consultation calls, and behavioral rules. Each agent file has YAML frontmatter specifying `name`, `description`, `tools`, and `model`.

**`src/templates/*.md`** — output document templates with `{{PLACEHOLDER}}` tokens. `project-specs.md` is the central one — every project produces a filled-in instance of it.

### Agent taxonomy

| Type | Agents | Characteristics |
|------|--------|-----------------|
| Orchestrator | `jfl` | Triages requests, creates project dir + specs, delegates to specialist via in-session persona transfer |
| Specialist | `data-analyst`, `data-scientist`, `ml-engineer`, `ai-engineer`, `data-engineer`, `data-modeller`, `applied-ml-scientist`, `deep-learning-engineer` | Phased workflow, gate pattern, invokes JFL for final review via Task |
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
| Data Engineer, Data Modeller | `models/<project_name>/` |
| ML Engineer, AI Engineer (greenfield) | `services/<project_name>/` |
| ML Engineer, AI Engineer (iteration) | existing service directory |
| Applied ML Scientist | `research/<project_name>/` |
| Deep Learning Engineer | `services/<project_name>/` |

### Editing workflow

When changing agent behavior: edit `src/agents/<name>.md` (the authoritative file). The command file in `src/commands/` only needs editing if the startup instructions or persona framing change. Templates in `src/templates/` only need editing if the output document structure changes.

After editing source files, re-run `node tools/install.js` in any target project to pick up the changes.
