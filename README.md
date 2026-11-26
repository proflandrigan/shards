<p align="center">
  <img src="shards_icon.png" alt="Shards" width="250">
</p>

**Shards of Syn's brain** — a suite of data-focused agents for Claude Code, Codex and other Agent Skills hosts.

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

## Status

Shards v2 (`2.0.0-next.0`) is built and tested locally but **not published yet**:

- The npm packages `@proflandrigan/shards` and `@proflandrigan/shards-mcp` are pending (E10.4). `npx @proflandrigan/shards ...` will not work until they are published.
- The Claude Code marketplace plugin (`plugins/shards`) is generated and pushed to the `marketplace` branch by the release workflow (`.github/workflows/release.yml`), which has not run yet, so the `marketplace` branch is not published and `/plugin marketplace add proflandrigan/shards` cannot install it yet.
- The Codex path was checked live on Codex CLI 0.169.0 (macOS); the interactive TUI prompts and a live fan-out run are not. The T3 Code path is docs-only and unverified against a live host (see [`docs/compat.md`](docs/compat.md)).

Everything below marked "from source" works today.

## Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- git (git is the source of truth for everything Shards writes)
- Python 3 with `jupyter_client` and `ipykernel`, only if you use Notebook Walkthrough or the notebook tools
- One host: Claude Code, Codex, or an Agent Skills host such as T3 Code

## Quick Start

All three start from a clone of this repo (one time):

```bash
git clone https://github.com/proflandrigan/shards && cd shards && npm install
```

Replace `/abs/path/to/shards` and `/your/project` below with real absolute paths.

### Claude Code

```bash
node cli/shards.js build --target claude --dev          # from the shards clone
cd /your/project
claude --plugin-dir /abs/path/to/shards/adapters/claude-code
```

Then run `/shards:syn` (or `/shards:agents` to list agents). `--plugin-dir` is per launch; stop passing it to unload.
Once published this becomes `/plugin marketplace add proflandrigan/shards` then `/plugin install shards@shards` (pending E10.4/E10.5).

### Codex (checked on Codex CLI 0.169.0)

```bash
node cli/shards.js build --target codex --dev --marketplace     # from the shards clone -> adapters/codex-marketplace
codex plugin marketplace add "$PWD/adapters/codex-marketplace"
codex plugin add shards@shards-local                            # skills + hooks
node cli/shards.js install --codex --plugin-dir "$PWD/adapters/codex-marketplace/plugins/shards"   # MCP entry + profiles in ~/.codex
node cli/shards.js install --agents-md --root /your/project     # optional
```

Trust the Shards hooks when Codex asks (it skips untrusted hooks silently). See [`docs/dev-install.md`](docs/dev-install.md) section 4 and [`docs/release.md`](docs/release.md).

### T3 Code and other Agent Skills hosts (unverified)

```bash
node cli/shards.js install --project --root /your/project     # skills into .claude/skills and .agents/skills
claude mcp add shards -- node /abs/path/to/shards/runtime/server.js   # register the MCP server (use your host's equivalent)
node cli/shards.js doctor --root /your/project
```

Skills discovery in T3 Code has not been verified (compat T3-3). Once published the MCP server is `npx -y @proflandrigan/shards-mcp@next`. `shards build --target skills` produces the same content as a standalone package.

## What Shards is

Each agent is a specialist shard of Syn: a persona, a phased workflow and a documentation habit. Syn triages requests, summons the right shard, and reviews final plans. Agents document decisions at **gates**: at the end of a phase the agent writes the decisions to the project record, calls the `gate_request` tool, and cannot advance until you confirm. The runtime (`shards-mcp`) enforces this; it is not a text convention.

Agents also review each other. The Data Scientist asks the Data Modeller to verify queries, the Analyst asks the Scientist to sanity-check the plan, and Syn reviews every final plan before execution.

### How it fits together

- **`core/`** is the single source: agents (`core/agents/<id>/AGENT.md` + `agent.yaml`), shared protocols, templates, schemas.
- **`shards build`** compiles `core/` into generated packages: a Claude Code plugin, a Codex package and a generic Agent Skills package. Generated output is never hand-edited.
- **`shards-mcp`** is the runtime: an MCP server exposing `activate`, `gate_request`, `sessions_*`, task and fan-out tools, and keeping state under `.shards/state/`.
- **Jobs and bindings** (`shards.config.yaml`, `bindings/`) route record, tasks, knowledge, review, artifacts and presentation output. Git is the default for all six jobs. The Jira tasks binding lets Syn captain an existing epic or route one issue to a specialist. You can also give a Jira task directly to a shard. [Working from Jira](src/docs/08-bindings/integrations-status.md)
- **Studio** (`packages/studio`) is an optional browser view of what the runtime writes.

## The Shards

| Shard | Role | Personality | Speciality |
|-------|------|-------------|------------|
| **Syn** | Orchestrator | Friendly, structured | Triage, delegation, PM, panel review, brainstorm, final review |
| **Data Analyst** | Specialist | Helpful | Adhoc queries, quick analyses |
| **Data Scientist** | Specialist | Condescending | EDA, feature engineering, modeling |
| **ML Engineer** | Specialist | Intense | Recommenders, ranking, production ML systems |
| **AI Engineer** | Specialist | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| **Applied ML Scientist** | Specialist | Technically obsessed | Novel ML framework design, research-oriented ML |
| **Deep Learning Engineer** | Specialist | Robot-precise | Neural architectures, training protocols |
| **MLOps Engineer** | Specialist | Perpetually stressed | Serving, training pipelines, drift monitoring |
| **Analytics Engineer** | Specialist | Bored | dbt transformation layers, SQL, metrics |
| **BI Engineer** | Specialist | Bored and exhausted | Dashboards, Streamlit, Plotly, Altair |
| **Data Engineer** | Specialist | Grumpy | Sources, staging, pipeline infrastructure |
| **Data Modeller** | Specialist | Sarcastic | Entities, relationships, grain |
| **Backend Engineer** | Reviewer | Methodical, precise | Python code review, FastAPI |
| **Researcher** | Reviewer | Nerdy | Statistical review, methodology validation |
| **Statistician** | Reviewer | Nit-picky and insufferable | Claim review, Bayesian and frequentist inference, advanced modelling |
| **Academic** | Reviewer | Cool professor | Safety, ethics, cognitive science |

Utility skills: `agents` (list agents), `brainstorm`, `review-pr`, `notebook-walkthrough`, `resume`, `end`, plus `shards-conventions` in the Claude Code plugin. In the Claude Code plugin they are namespaced, for example `/shards:syn`, `/shards:data-analyst`.

## Common commands

```bash
node cli/shards.js doctor                 # check prerequisites, config, MCP, hooks, git state, gate permissions
node cli/shards.js sessions list          # list / show / resume / end sessions
node cli/shards.js gates status           # gate state (interim operator confirm)
node cli/shards.js migrate --dry-run      # migrate a v1 install (see below)
node cli/shards.js install --permissions  # opt-in permission preset
node cli/shards.js install --claude-md    # opt-in CLAUDE.md conventions block (--agents-md for Codex)
```

Each `install` option has `--remove` (uninstall only what it added) and `--dry-run`.

## Coming from v1

v1 installed files with `npx github:proflandrigan/shards install`, used `::GATE::` fences and a web UI. v2 replaces all of that. Run `shards migrate` in the old project: it exports the old Knowledge Ledger, imports gate history and removes v1 files using the install manifest. See [`src/docs/05-commands/migrate.md`](src/docs/05-commands/migrate.md).

## Documentation

- **Developer Guide:** [`src/docs/README.md`](src/docs/README.md) (agents, protocols, Studio, commands, outputs, workflows, bindings).
- **Runtime and design docs:** [`docs/`](docs/) - `runtime.md`, `gates.md`, `activation.md`, `delegation.md`, `sessions.md`, `config.md`, `release.md`, `compat.md`, and ADRs in `docs/adr/`.
- **Developing Shards itself:** [`CLAUDE.md`](CLAUDE.md).

## License

MIT
