# Echoes

**Echoes of JFL's brain** — a suite of data-focused agents for Claude Code.

Each agent is a specialist echo (clone) of JFL, carrying a fragment of his expertise
into a focused domain: data analysis, data science, ML engineering, data engineering,
and data modelling. JFL himself serves as the orchestrator, triaging requests and
summoning the right echo for the job.

They're opinionated, they document everything, and they don't skip steps.

## Why

LLMs are great at asking questions but terrible at writing down the answers.
Echoes forces every agent to document decisions at each phase using a
**gate pattern**: the agent writes decisions to a project specs file, reads them
back to you, and cannot advance until you confirm. The result is a complete
decision trail — not just code, but the reasoning behind it.

Agents also review each other's work. The Data Scientist asks the Data Modeller
to verify queries. The Analyst asks the Scientist to sanity-check the plan.
And JFL reviews every final plan before execution begins. You see all of this
happening — nothing is hidden.

## Quick Start

**Prerequisites:** [Node.js](https://nodejs.org) v18+

```bash
cd your-project
npx github:YOUR_USERNAME/echoes install
```

Then open Claude Code and run:

```
/echoes
```

JFL will greet you, figure out what you need, and summon the right echo.

## The Echoes

| Echo | Command | Personality | Speciality |
|------|---------|-------------|------------|
| **JFL** | `/echoes` | Friendly, structured | Triage, delegation, final review |
| **Data Analyst** | `/data-analyst` | Helpful | Adhoc queries, quick analyses |
| **Data Scientist** | `/data-scientist` | Condescending | EDA, feature engineering, modeling |
| **ML Engineer** | `/ml-engineer` | Intense | Recommenders, ranking, production ML systems |
| **AI Engineer** | `/ai-engineer` | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| **Data Engineer** | `/data-engineer` | Grumpy | Pipelines, dbt models, infrastructure |
| **Data Modeller** | `/data-modeller` | Sarcastic | Entities, relationships, grain |
| **Researcher** | `/researcher` | Nerdy | Statistical review, methodology validation |

## What Gets Installed

```
your-project/
├── .claude/
│   ├── agents/                 # Agent persona definitions
│   │   ├── jfl.md
│   │   ├── data-analyst.md
│   │   ├── data-scientist.md
│   │   ├── ml-engineer.md
│   │   ├── ai-engineer.md
│   │   ├── data-engineer.md
│   │   ├── data-modeller.md
│   │   └── researcher.md
│   └── commands/               # Slash commands
│       ├── echoes.md
│       ├── data-analyst.md
│       ├── data-scientist.md
│       ├── ml-engineer.md
│       ├── ai-engineer.md
│       ├── data-engineer.md
│       ├── data-modeller.md
│       └── researcher.md
├── templates/                  # Output templates
├── analysis/                   # Adhoc analyses (Data Analyst)
├── studies/                    # Deep studies (Data Scientist)
├── models/                     # Model work (Engineer + Modeller)
├── services/                   # ML Engineer greenfield projects
└── CLAUDE.md                   # Updated with Echoes docs
```

## How It Works

### The Gate Pattern

Every agent follows a phased workflow. At the end of each phase:

1. The agent **writes** phase decisions to the project specs file
2. The agent **reads back** what it wrote in the chat
3. The agent **waits** for your confirmation
4. Only after confirmation does it **advance** to the next phase

This turns conversation into documentation automatically.

### Cross-Agent Review

Agents consult each other at defined checkpoints:

- **Data Analyst** asks the Data Modeller to explore available data, the
  Data Scientist to review the analysis plan, and the Researcher to validate
  statistical assumptions
- **Data Scientist** asks the Data Modeller to verify queries, and the
  Researcher to review methodology and execution approach
- **ML Engineer** consults all echoes: Data Modeller for feature sources, Data
  Engineer for pipeline feasibility, Data Scientist for methodology review
- **AI Engineer** consults ML Engineer for production infrastructure and safety
  patterns, Researcher for evaluation methodology rigor
- **All specialists** invoke JFL for a final review before execution

You see every review happening. The agent announces it, runs the review, and
reports findings before proceeding.

### Trigger Code Menus

Each agent displays a menu of available actions with short trigger codes.
You can type the code to jump to that action:

```
[T] Triage — Tell me what you need
[D] Data Discovery — Explore what data we have
[E] Execute — Build the analysis
```

### Orchestration

When you run `/echoes`, JFL triages your request and morphs into the
appropriate specialist within the same conversation — no context lost.
The specialist handles the work, then invokes JFL for final review
before execution.

You can also invoke any specialist directly with their slash command
if you already know what you need.

## Project Output

Every project gets a `project-specs.md` file documenting all decisions.
Additionally:

| Echo | Output Directory | Artifacts |
|------|-----------------|-----------|
| Data Analyst | `analysis/<name>/` | `project-specs.md`, `queries/*.sql` |
| Data Scientist | `studies/<name>/` | `project-specs.md`, `queries/*.sql`, `notebooks/*.ipynb`, `report.md` |
| ML Engineer | `services/<name>/` (greenfield) or existing service dir (iteration) | `project-specs.md`, `queries/*.sql`, `notebooks/*.ipynb`, `report.md` |
| AI Engineer | `services/<name>/` (greenfield) or existing service dir (iteration) | `project-specs.md`, `prompts/`, `eval/`, `notebooks/*.ipynb`, `report.md` |
| Data Engineer | `models/<name>/` | `project-specs.md` |
| Data Modeller | `models/<name>/` | `project-specs.md` |

## Uninstall

```bash
npx github:YOUR_USERNAME/echoes uninstall
```

## License

MIT
