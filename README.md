<img 
  src="shards_logo.png" 
  alt="Shards" 
  style="display: block; margin-left: auto; margin-right: auto; width: 400px;" 
/>

**Shards of Syn's brain** — a suite of data-focused agents for Claude Code.

Each agent is a specialist shard (fragment) of Syn, carrying a piece of his expertise
into a focused domain: data analysis, data science, ML engineering, data engineering,
and data modelling. Syn himself serves as the orchestrator, triaging requests and
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
And Syn reviews every final plan before execution begins. You see all of this
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

Syn will greet you, figure out what you need, and summon the right shard.

## The Shards

| Shard | Command | Personality | Speciality |
|-------|---------|-------------|------------|
| **Syn** | `/shards` | Friendly, structured | Triage, delegation, final review |
| **Syn (Brainstorm)** | `/brainstorm` | Friendly, structured | Multi-agent ideation, exploration |
| **Syn (Knowledge)** | `/knowledge` | Friendly, structured | Seed, browse, and manage the Knowledge Ledger |
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
│   │   ├── syn.md
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
│   └── commands/               # Slash commands (18 total)
│       ├── shards.md
│       ├── brainstorm.md
│       ├── knowledge.md
│       ├── shards-ui.md
│       ├── data-analyst.md
│       └── ... (one per agent)
├── .shards/
│   ├── ui/                     # Shards web UI (local server + browser client)
│   │   ├── js/                 # Browser-side ES modules
│   │   └── css/                # Stylesheets
│   └── knowledge/              # Persistent Knowledge Ledger
│       ├── INDEX.md            # One-line-per-entry index
│       ├── entities/           # Table quirks, column semantics, grain
│       ├── infrastructure/     # Warehouse/API/system behaviors
│       ├── patterns/           # Reusable SQL/Python snippets
│       └── features/           # Verified ML features
├── templates/                  # Output templates
├── analysis/                   # Adhoc analyses (Data Analyst)
├── studies/                    # Deep studies (Data Scientist)
├── models/                     # ML Engineer and Data Engineer work
├── data_models/                # Data Modeller and Analytics Engineer work
├── services/                   # ML / AI / Deep Learning / MLOps greenfield projects
├── dashboards/                 # BI Engineer dashboards
├── research/                   # Applied ML Scientist novel frameworks
├── brainstorm/                 # Syn brainstorm sessions
├── fixes/                      # Syn Fixer quick fixes
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
- **All specialists** invoke Syn for a final review before execution

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
| `[EXP]` | Experiment | DS | Run targeted experiments on an existing study |
| `[PL]` | Prompt Lab | AI | Interactive prompt editing, evaluation, versioning via Shards UI |
| `[F]` | Fix | Syn | Quick fix — Syn handles it directly without specialist handoff |
| `[S]` | Status | Syn | Check on a current project |
| `[D]` | Diff | Syn | Compare two projects side by side |
| `[K]` | Knowledge | Syn | Seed, browse, or manage the Knowledge Ledger |
| `[B]` | Brainstorm | Syn | Multi-agent ideation session |
| `[C]` | Clean | BE | Apply structural fixes without changing functionality |
| `[F]` | FastAPI | BE | Route design, dependency injection, middleware |
| `[P]` | Pydantic | BE | Model design, validators, schema evolution |
| `[O]` | OOP | BE | Class structure, responsibility boundaries |
| `[M]` | Modularize | BE | Break down a monolith, restructure a module |
| `[X]` | Performance | BE | Profiling guidance, query efficiency, memory patterns |
| `[D]` | Data Contract | BE | API contracts, schema versioning |

Not every agent has every mode — the agent displays its own menu on startup.

### Orchestration

When you run `/shards`, Syn triages your request and morphs into the
appropriate specialist within the same conversation — no context lost.
The specialist handles the work, then invokes Syn for final review
before execution.

Run `/brainstorm` to enter a lighter mode: Syn gathers context, polls
all relevant specialists via parallel Task calls, and synthesizes ideas
without committing to a full project workflow.

You can also invoke any specialist directly with their slash command
if you already know what you need.

### Fixer Mode

Type `[F]` at Syn's menu (or describe something that sounds like a minor fix)
and Syn handles it directly — no specialist handoff, no full phased workflow.
Syn plans the change, gets a quick specialist review via Task, and applies
the fix. Designed for small updates where the overhead of a full workflow
isn't warranted.

### Experiment Mode

The ML Engineer, AI Engineer, and Data Scientist support experiment mode:
run targeted experiments on an existing model, pipeline, or study to improve
specific metrics. The agent loads the existing project context, designs
experiments, runs them, and reports results — without going through the full
build workflow. ML Engineer and AI Engineer use `[EX]`; Data Scientist uses
`[EXP]` (since `[EX]` is Explain mode on that agent).

### Code Review

During the final phases of a specialist workflow, Syn can run a structured
code review on the produced artifacts. It partitions files by type (Python
vs. non-Python), reviews each category, and reports findings. This happens
automatically when triggered by the specialist — you don't need to request it.

### Knowledge Ledger

Shards maintains a persistent workspace-wide Knowledge Ledger at `.shards/knowledge/`.
Agents automatically check it before starting work and contribute to it when projects
complete.

- **Auto-retrieval:** Before Phase 1, agents scan `INDEX.md` for entries relevant to the current project
- **Auto-harvest:** After Syn final review, agents extract reusable knowledge and present candidates for your confirmation before writing to the ledger

Run `/knowledge` or type `[K]` at Syn's menu to seed, browse, or manage the ledger directly.
The knowledge directory is preserved across installs and uninstalls.

### Prompt Lab

The AI Engineer supports a Prompt Lab mode (`[PL]`): interactive prompt editing,
evaluation, and versioning via the Shards UI. Design prompts, run evaluations,
and iterate — all within the browser dashboard.

### Diff Mode

Type `[D]` at Syn's menu to compare two projects side by side. Syn reads both
project directories, compares methodology, metrics, implementation, and artifacts,
and produces a structured diff report.

### Time-Travel Branching

Specialists can propose parallel experimentation branches during a build. The
diverge protocol forks the work into parallel Task branches, each exploring a
different approach. When branches complete, Syn enters Arbiter mode — reads all
branch reports, builds a side-by-side leaderboard, and returns an advisory
recommendation. You make the final call on which branch to promote.

### Shards UI

Run `/shards-ui` inside Claude Code (or `shards-ui` from your terminal) to open
a local web dashboard that shows real-time agent session activity. It hooks into
Claude Code via `UserPromptSubmit`, `Stop`, `PostToolUse`, and `PreToolUse` hooks and displays
the live feed of agent work in the browser. The UI includes a file explorer, Monaco
editor integration, code intelligence (symbol indexing via ctags), git status, and
a command palette.

#### Permission Whitelisting

By default, Claude Code prompts for approval on every shell command. You can
whitelist common tools at startup so agents can run them without interruption:

```bash
# Apply a preset
shards-ui start --permissions permissive
shards-ui start --permissions readonly

# Whitelist specific commands (bare names auto-wrap to Bash(cmd:*))
shards-ui start --allow "find,grep,ls"

# Full pattern syntax
shards-ui start --allow "Bash(python3:*),Bash(pytest:*)"

# Combine both
shards-ui start --permissions readonly --allow "Bash(python3:*)"
```

**Presets:**

| Preset | What it allows |
|--------|---------------|
| `readonly` | `find`, `grep`, `rg`, `ls`, `cat`, `head`, `tail`, `wc`, `git log`, `git status`, `git diff`, `git branch`, `git show`, `echo`, `pwd`, `which` |
| `permissive` | Everything in `readonly` + `python`, `python3`, `node`, `npm`, `pip`, `pip3`, `env` |

You can also manage permissions from the browser: open **Settings** (Cmd+,) in
the Shards UI and use the **Permissions** panel to apply presets, add custom
rules, or remove existing ones. Changes take effect immediately — they write
directly to `.claude/settings.json`.

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
| MLOps Engineer | `services/<name>/` | `project-specs.md` |
| Analytics Engineer | `data_models/<name>/` | `project-specs.md` |
| BI Engineer | `dashboards/<name>/` | `project-specs.md` |
| Syn (Fixer) | `fixes/<name>/` | `project-specs.md` |
| Backend Engineer | — (review only, no files produced) | — |
| Data Engineer | `models/<name>/` | `project-specs.md` |
| Data Modeller | `data_models/<name>/` | `project-specs.md` |

## Uninstall

```bash
npx github:proflandrigan/shards uninstall
```

## License

MIT
