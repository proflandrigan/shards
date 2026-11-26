# Agent Taxonomy

Shards ships 16 agents, defined once in `core/agents/<id>/` (`AGENT.md`, `agent.yaml`, `modes/`, phase files). The `role` in each `agent.yaml` gives three types: one orchestrator (Syn), 11 specialists with phased workflows, and 4 reviewers (Researcher, Statistician, Academic, Backend Engineer) that have no phased build of their own.

Run `/shards:agents` to print the live list (role, modes, switch command, consult subagents) from the same files.

## By type

| Type (`role`) | Agents | Characteristics |
|---|---|---|
| **Orchestrator** | [Syn](syn.md) | Triage, delegation, final review and branch arbitration, plus its own modes (PM, panel review, brainstorm, fixer, ...). No phased workflow of its own. |
| **Specialist: analysis** | [Data Analyst](data-analyst.md), [Data Scientist](data-scientist.md) | Produce analysis artifacts (SQL, notebooks, reports). |
| **Specialist: data** | [Data Engineer](data-engineer.md), [Data Modeller](data-modeller.md), [Analytics Engineer](analytics-engineer.md) | Build pipelines, model entities, design transformation layers. Quick and Deep tracks. |
| **Specialist: ML/AI** | [ML Engineer](ml-engineer.md), [AI Engineer](ai-engineer.md), [Applied ML Scientist](applied-ml-scientist.md), [Deep Learning Engineer](deep-learning-engineer.md), [MLOps Engineer](mlops-engineer.md) | Design, build and deploy ML and AI systems. |
| **Specialist: visualization** | [BI Engineer](bi-engineer.md) | Dashboards and data visualization. |
| **Reviewer** | [Researcher](researcher.md), [Statistician](statistician.md), [Academic](academic.md), [Backend Engineer](backend-engineer.md) | Review and advise. No project directory. Files are written only on request (Academic reports, Researcher and Academic critical reviews) or by Backend Engineer Clean mode, which edits in place. |

The 11 specialists are the 12 of earlier versions minus the Backend Engineer, which is now a reviewer: `agent.yaml` gives it `role: reviewer` and `output_dir: null`.

## How an agent becomes active

`activation` in each `agent.yaml` lists how the agent can run:

| Activation | Meaning | Who has it |
|---|---|---|
| `switch` | The agent's persona becomes the active frame (`activate` pushes, `return` pops). The user talks to it, it loads phases with `load_phase`, and it owns gates until it returns. | All 16 agents. |
| `consult` | An isolated subagent that answers one question and returns a verdict. It never nests: a consult cannot consult, switch or fan out. One subagent per `consult_entries` key (`<id>-review`, `<id>-advise`, `<id>-service`, ...). | All 16 agents. |
| `fanout_worker` | A `<id>-worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. | The 11 specialists only. |

Details are in [Activation Modes](../03-protocols/activation-modes.md). To start an agent on Claude Code use its switch skill, `/shards:<id>` (for example `/shards:data-analyst`), or ask Syn, which calls `activate`. On Codex the form is `$<id>` or `codex --profile shards-<id>`. Nothing is published yet; install from source ([Install](../01-getting-started/install.md)).

Every agent also declares `jobs` (which of record, tasks, knowledge, review, artifacts it uses; Syn adds presentation) that bindings supply. See [Bindings](../08-bindings/overview.md).

## By "quick vs. deep"

Some specialists support two tracks:

- **Quick Track**: 2 phases for tactical work (a bug fix, a single query change, a mart iteration).
- **Deep Track**: 7-8 phases for greenfield or multi-week projects.

Quick and Deep agents: Data Engineer (2 + 7 phases), Data Modeller (2 + 7), Analytics Engineer (2 + 8).

The Data Analyst is a single 4-phase track by design; it escalates to the Data Scientist for deep work.

## Picking the right shard

| If you want to... | Use |
|---|---|
| Answer a quick business question with SQL | [Data Analyst](data-analyst.md) |
| Investigate causally, model, or build a study | [Data Scientist](data-scientist.md) |
| Build a production ranking/classification model | [ML Engineer](ml-engineer.md) |
| Build an LLM, RAG, or agent system | [AI Engineer](ai-engineer.md) |
| Design or debug a neural architecture | [Deep Learning Engineer](deep-learning-engineer.md) |
| Propose a novel ML method | [Applied ML Scientist](applied-ml-scientist.md) |
| Deploy/monitor/retrain a model | [MLOps Engineer](mlops-engineer.md) |
| Build a data pipeline or dbt model | [Data Engineer](data-engineer.md) |
| Design a schema or resolve grain issues | [Data Modeller](data-modeller.md) |
| Build a mart or transformation layer | [Analytics Engineer](analytics-engineer.md) |
| Build a dashboard | [BI Engineer](bi-engineer.md) |
| Review Python (`.py`) code for quality | [Backend Engineer](backend-engineer.md) |
| Validate statistical methodology | [Researcher](researcher.md) |
| Check whether a statistical or metric claim holds | [Statistician](statistician.md) |
| Assess safety, ethics, or behavioral efficacy | [Academic](academic.md) |
| Not sure? | [Syn](syn.md): run `/shards:syn` and it will triage |

## How shards talk to each other

Specialists consult each other at defined points in their phases, with the `{{consult <agent> entry=<entry>}}` macro, which resolves to a native subagent call on the host. Common patterns:

- The Data Scientist consults the **Researcher** for statistical methodology review.
- Specialists making claims on stats or metrics consult the **Statistician**, which checks whether the conclusion follows (method questions stay with the Researcher).
- The ML Engineer consults the **Data Modeller** for feature source understanding.
- The AI Engineer consults the **Academic** for safety and ethics assessment.
- Every specialist's final phase asks **Syn** for final review (`syn-final_review`), and, when Syn finds code files, offers a code pass that the specialist runs itself (`core/protocols/code_review.md`).

Consultations are in-phase and do not transfer context: the consulted agent returns a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)) and exits. Because consults never nest, a consult that needs another agent's input receives it from the caller in the task text. Each phase ends with a gate: a `gate_request` tool call that only a human confirms ([The Gate Pattern](../03-protocols/gate-pattern.md)).

## See also

- One page per agent in this section.
- [Example Workflows](../07-workflows/quick-analysis.md): real projects showing how shards chain together.
