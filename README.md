<img 
  src="shards_logo.png" 
  alt="Shards" 
  style="display: block; margin-left: auto; margin-right: auto; width: 400px;" 
/>

**Shards of JFL's brain** — a suite of data-focused agents for Claude Code.

Each agent is a specialist shard (fragment) of JFL, carrying a piece of his expertise
into a focused domain: data analysis, data science, ML engineering, data engineering,
and data modelling. JFL himself serves as the orchestrator, triaging requests and
summoning the right shard for the job.

They're opinionated, they document everything, and they don't skip steps.

## Why

LLMs are great at asking questions but terrible at writing down the answers.
Shards forces every agent to document decisions at each phase using a
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
npx github:proflandrigan/shards install
```

Then open Claude Code and run:

```
/shards
```

JFL will greet you, figure out what you need, and summon the right shard.

## The Shards

| Shard | Command | Personality | Speciality |
|-------|---------|-------------|------------|
| **JFL** | `/shards` | Friendly, structured | Triage, delegation, final review |
| **JFL (Brainstorm)** | `/brainstorm` | Friendly, structured | Multi-agent ideation, exploration |
| **Data Analyst** | `/data-analyst` | Helpful | Adhoc queries, quick analyses |
| **Data Scientist** | `/data-scientist` | Condescending | EDA, feature engineering, modeling |
| **ML Engineer** | `/ml-engineer` | Intense | Recommenders, ranking, production ML systems |
| **AI Engineer** | `/ai-engineer` | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| **Applied ML Scientist** | `/applied-ml-scientist` | Technically obsessed | Novel ML framework design, custom architectures, research-oriented ML |
| **Deep Learning Engineer** | `/deep-learning-engineer` | Robot-precise | Neural architecture design, training protocols, custom model implementation |
| **MLOps Engineer** | `/mlops-engineer` | Perpetually stressed | Model serving, training pipelines, feature stores, drift monitoring |
| **Analytics Engineer** | `/analytics-engineer` | Bored | dbt transformation layers, SQL, metrics |
| **BI Engineer** | `/bi-engineer` | Bored and exhausted | Dashboards, Streamlit, Plotly, Altair |
| **Backend Engineer** | `/backend-engineer` | Methodical, precise | Python code review, FastAPI, production readiness |
| **Data Engineer** | `/data-engineer` | Grumpy | Pipelines, dbt models, infrastructure |
| **Data Modeller** | `/data-modeller` | Sarcastic | Entities, relationships, grain |
| **Researcher** | `/researcher` | Nerdy | Statistical review, methodology validation |
| **Academic** | `/academic` | Cool professor | Safety, ethics, cognitive science, behavioral research |
| **Shards UI** | `/shards-ui` | — | Open the local web UI in your browser |

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
│   │   ├── applied-ml-scientist.md
│   │   ├── deep-learning-engineer.md
│   │   ├── mlops-engineer.md
│   │   ├── analytics-engineer.md
│   │   ├── bi-engineer.md
│   │   ├── backend-engineer.md
│   │   ├── data-engineer.md
│   │   ├── data-modeller.md
│   │   ├── researcher.md
│   │   ├── academic.md
│   │   └── specific_instructions/  # Deferred phase files per agent
│   └── commands/               # Slash commands
│       ├── shards.md
│       ├── brainstorm.md
│       ├── shards-ui.md
│       ├── data-analyst.md
│       └── ...
├── .shards/
│   └── ui/                     # Shards web UI (local server + browser client)
│       ├── js/                 # Browser-side ES modules
│       └── css/                # Stylesheets
├── templates/                  # Output templates
├── analysis/                   # Adhoc analyses (Data Analyst)
├── studies/                    # Deep studies (Data Scientist)
├── models/                     # ML Engineer and Data Engineer work
├── data_models/                # Data Modeller and Analytics Engineer work
├── services/                   # ML / AI / Deep Learning / MLOps greenfield projects
├── dashboards/                 # BI Engineer dashboards
├── research/                   # Applied ML Scientist novel frameworks
├── brainstorm/                 # JFL brainstorm sessions
└── CLAUDE.md                   # Updated with Shards docs
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
- **ML Engineer** consults all shards: Data Modeller for feature sources, Data
  Engineer for pipeline feasibility, Data Scientist for methodology review,
  Deep Learning Engineer when DL approaches are warranted, Applied ML Scientist
  for novel methodology assessment
- **AI Engineer** consults ML Engineer for production infrastructure and safety
  patterns, Researcher for evaluation methodology rigor
- **Applied ML Scientist** consults Deep Learning Engineer for implementation
  grounding on novel DL-based frameworks
- **Deep Learning Engineer** consults Applied ML Scientist for theoretical review
  on research-heavy architecture questions
- **Any agent** can consult the Academic when safety, ethical, or behavioral
  science questions arise
- **All specialists** invoke JFL for a final review before execution

You see every review happening. The agent announces it, runs the review, and
reports findings before proceeding.

### Trigger Code Menus

Each agent displays a menu of available actions with short trigger codes.
You can type the code to jump to that action. Common modes across agents:

| Code | Mode | Available on | What it does |
|------|------|-------------|--------------|
| `[T]` | Triage | All | Scope the request, ask clarifying questions |
| `[B]` | Build | Specialists | Full phased workflow from triage to execution |
| `[R]` | Review | All specialists | Evaluate existing work without a full build |
| `[ADV]` | Advisory | Most specialists | Discuss trade-offs and options without committing |
| `[U]` | Update | DA, AE, BI | Iterate on an existing analysis or model |
| `[EX]` | Explain | DA, DS | Walk through a completed analysis retrospectively |
| `[EX]` | Experiment | ML, AI | Run targeted experiments on an existing model |
| `[F]` | Fix | JFL | Quick fix — JFL handles it directly without specialist handoff |
| `[B]` | Brainstorm | JFL | Multi-agent ideation session |
| `[C]` | Clean | BE | Apply structural fixes without changing functionality |

Not every agent has every mode — the agent displays its own menu on startup.

### Orchestration

When you run `/shards`, JFL triages your request and morphs into the
appropriate specialist within the same conversation — no context lost.
The specialist handles the work, then invokes JFL for final review
before execution.

Run `/brainstorm` to enter a lighter mode: JFL gathers context, polls
all relevant specialists via parallel Task calls, and synthesizes ideas
without committing to a full project workflow.

You can also invoke any specialist directly with their slash command
if you already know what you need.

### Fixer Mode

Type `[F]` at JFL's menu (or describe something that sounds like a minor fix)
and JFL handles it directly — no specialist handoff, no full phased workflow.
JFL plans the change, gets a quick specialist review via Task, and applies
the fix. Designed for small updates where the overhead of a full workflow
isn't warranted.

### Experiment Mode

The ML Engineer and AI Engineer support an experiment mode (`[EX]`): run
targeted experiments on an existing model or pipeline to improve specific
metrics. The agent loads the existing project context, designs experiments,
runs them, and reports results — without going through the full build workflow.

### Code Review

During the final phases of a specialist workflow, JFL can run a structured
code review on the produced artifacts. It partitions files by type (Python
vs. non-Python), reviews each category, and reports findings. This happens
automatically when triggered by the specialist — you don't need to request it.

### Shards UI

Run `/shards-ui` inside Claude Code (or `shards-ui` from your terminal) to open
a local web dashboard that shows real-time agent session activity. It hooks into
Claude Code via `UserPromptSubmit`, `Stop`, and `PostToolUse` hooks and displays
the live feed of agent work in the browser. The UI includes a file explorer, Monaco
editor integration, code intelligence (symbol indexing via ctags), git status, and
a command palette.

### BI Handoffs

After completing their final phase, the AI Engineer, ML Engineer, Data Scientist,
and Analytics Engineer can optionally generate a `bi-engineer-handoff.md` file —
a structured brief for the BI Engineer to build an operational monitoring or
reporting dashboard. The specialist asks before generating it; you can say no.

### Explain Mode

The Data Analyst and Data Scientist support an explain mode: a guided retrospective
walkthrough of a completed analysis. Load it by pointing the agent at the relevant
`specific_instructions/` file. No queries are re-run — it reads `project-specs.md`
and the existing SQL/notebooks and walks you through the decisions and results.

## Project Output

Every project gets a `project-specs.md` file documenting all decisions.
Additionally:

| Shard | Output Directory | Artifacts |
|-------|-----------------|-----------|
| Data Analyst | `analysis/<name>/` | `project-specs.md`, `queries/*.sql` |
| Data Scientist | `studies/<name>/` | `project-specs.md`, `queries/*.sql`, `notebooks/*.ipynb`, `report.md` |
| ML Engineer | `models/<name>/` (greenfield) or existing service dir (iteration) | `project-specs.md`, `queries/*.sql`, `notebooks/*.ipynb`, `report.md` |
| AI Engineer | `services/<name>/` (greenfield) or existing service dir (iteration) | `project-specs.md`, `prompts/`, `eval/`, `notebooks/*.ipynb`, `report.md` |
| Applied ML Scientist | `research/<name>/` | `project-specs.md`, `notebooks/*.ipynb`, `report.md` |
| Deep Learning Engineer | `services/<name>/` | `project-specs.md`, `notebooks/*.ipynb`, `report.md` |
| MLOps Engineer | `services/<name>/mlops/` (greenfield or handoff) | `project-specs.md` |
| Analytics Engineer | `data_models/<name>/` | `project-specs.md` |
| BI Engineer | `dashboards/<name>/` | `project-specs.md` |
| Backend Engineer | — (review only, no files produced) | — |
| Data Engineer | `models/<name>/` | `project-specs.md` |
| Data Modeller | `data_models/<name>/` | `project-specs.md` |

## Uninstall

```bash
npx github:proflandrigan/shards uninstall
```

## License

MIT
