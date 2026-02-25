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

| Type | Agent | Model | Characteristics |
|------|-------|-------|-----------------|
| Orchestrator | `jfl` | opus | Triages requests, creates project dir + specs, delegates via in-session persona transfer; also serves as final reviewer when invoked via Task by specialists |
| Specialist | `data-analyst` | sonnet | Quick adhoc analyses (1–3 SQL queries); escalates complex work to Data Scientist |
| Specialist | `data-scientist` | sonnet | Deep multi-step analytical studies: EDA, causal inference, predictive modeling; produces notebooks and reports |
| Specialist | `ml-engineer` | sonnet | Production ML systems: recommenders, rankers, classifiers; handles greenfield, iteration, and productionization from a Data Scientist study |
| Specialist | `ai-engineer` | opus | Production LLM-powered systems: RAG, prompt engineering, agentic workflows, AI integrations |
| Specialist | `data-engineer` | sonnet | Data pipelines and dbt models; two tracks: Quick Fix and Deep Build |
| Specialist | `data-modeller` | sonnet | Data model understanding and design; three tracks: Explore (no gates), Quick Change, and Deep Design |
| Review-only | `researcher` | opus | Statistical methodology review; no phases, no files; consulted by Data Analyst, Data Scientist, and AI Engineer |
| Review-only | `academic` | opus | Neuroscience, psychology, and cognitive science review; no phases, no files; consulted by AI Engineer for safety and ethics; available to any agent |

### The gate pattern

Every specialist phase ends with the same sequence:
1. Write decisions to `project-specs.md`
2. Read the section back to the user
3. Wait for confirmation before advancing

This is enforced by prose in each agent file — "**GATE: Do not proceed until the user confirms.**" Documentation IS the gate.

### JFL delegation — in-session persona transfer

After Phase 0 is confirmed and `project-specs.md` is created, JFL does **not** use the Task tool to spawn the specialist. Instead it performs an in-session persona transfer:

1. JFL announces the handoff and asks the user to run `/compact` to clear triage context
2. Once the user signals ready, JFL reads the specialist's agent file from `.claude/agents/<name>.md`
3. JFL immediately adopts the specialist's full persona — name, personality, communication style
4. The specialist reads `project-specs.md` to orient, skips Phase 0, and continues from Phase 1

The user interacts directly with the specialist for all remaining phases. JFL does not re-appear except as a Task call for final review (see below).

### Specialist → Review agents (Task tool)

Specialists consult review-only agents via `Task(subagent_type="<name>", ...)` at defined checkpoints within their phases. These are in-phase consultations that return results to the specialist — they are not handoffs.

| Calling specialist | Consultant | When |
|-------------------|-----------|------|
| Data Analyst | Data Modeller | Phase 1 (data clarification) |
| Data Analyst | Data Scientist | Phase 2 (plan review) |
| Data Analyst | Researcher | Phase 2 (statistical assumption check) |
| Data Scientist | Data Modeller | Phases 2 and 6 |
| Data Scientist | Researcher | Phases 3 and 6 |
| Data Scientist | ML Engineer | Phase 4 (modeling approach, if ML task) |
| Data Scientist | Data Analyst | Phase 4 (feature interpretability, if High) |
| ML Engineer | Data Modeller | Phases 3, 5, and 6 |
| ML Engineer | Data Engineer | Phases 2 and 5 |
| ML Engineer | Data Scientist | Phase 4 (methodology review) |
| ML Engineer | Data Analyst | Phase 4 (feature interpretability, if High) |
| AI Engineer | Researcher | Phases 4 and 7 |
| AI Engineer | Academic | Phase 5 (safety and ethics) |
| Data Modeller | Data Analyst + Data Engineer | Phase 2 of Deep track (entity validation) |
| Researcher | Data Modeller | As needed (data structure context for statistical review) |

### Specialist → JFL (final review)

Every specialist's final phase invokes `Task(subagent_type="jfl", ...)` for sign-off. JFL reads the full `project-specs.md` and returns APPROVED / NEEDS REVISION / BLOCKED. The specialist appends the verdict to specs and presents it to the user before closing.

### Output directory conventions

| Specialist | Directory |
|-----------|-----------|
| Data Analyst | `analysis/<project_name>/` |
| Data Scientist | `studies/<project_name>/` |
| Data Engineer, Data Modeller | `models/<project_name>/` |
| ML Engineer, AI Engineer (greenfield) | `services/<project_name>/` |
| ML Engineer, AI Engineer (iteration) | existing service directory |

### Editing workflow

When changing agent behavior: edit `src/agents/<name>.md` (the authoritative file). The command file in `src/commands/` only needs editing if the startup instructions or persona framing change. Templates in `src/templates/` only need editing if the output document structure changes.

After editing source files, re-run `node tools/install.js` in any target project to pick up the changes.
