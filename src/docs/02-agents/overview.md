# Agent Taxonomy

Shards ships 15 agents: one orchestrator (Syn), 12 specialists with phased workflows, and 2 review-only advisors.

## By type

| Type | Agents | Characteristics |
|---|---|---|
| **Orchestrator** | Syn | Triage, delegation, final review. No phased workflow of its own. |
| **Specialist — analysis** | Data Analyst, Data Scientist | Produce analysis artifacts (SQL, notebooks, reports). |
| **Specialist — data** | Data Engineer, Data Modeller, Analytics Engineer | Build pipelines, model entities, design transformation layers. |
| **Specialist — ML/AI** | ML Engineer, AI Engineer, Applied ML Scientist, Deep Learning Engineer, MLOps Engineer | Design, build, and deploy ML and AI systems. |
| **Specialist — visualization** | BI Engineer | Dashboards and data visualization. |
| **Specialist — code** | Backend Engineer | Python code review and cleanup. |
| **Review-only** | Researcher, Academic | Consulted by other specialists; no projects of their own. |

## By "quick vs. deep"

Some specialists support two tracks:

- **Quick Track** — 2-3 phases for tactical work (a bug fix, a single query, a mart iteration).
- **Deep Track** — 6-8 phases for greenfield or multi-week projects.

Quick/Deep agents: Data Engineer, Data Modeller, Analytics Engineer.

The Data Analyst is quick-only by design (escalates to Data Scientist for deep work).

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
| Review Python code for quality | [Backend Engineer](backend-engineer.md) |
| Validate statistical methodology | [Researcher](researcher.md) |
| Assess safety, ethics, or behavioral efficacy | [Academic](academic.md) |
| Not sure? | [Syn](syn.md) — run `/shards` and it'll triage |

## How shards talk to each other

Shards consult each other via the Claude Code **Task tool** at defined points in their phased workflows. Common patterns:

- The Data Scientist consults the **Researcher** for statistical methodology review.
- The ML Engineer consults the **Data Modeller** for feature source understanding.
- The AI Engineer consults the **Academic** for safety and ethics assessment.
- Every specialist's final phase invokes **Syn** for sign-off.

Consultations happen in-phase and do not transfer context permanently — the consulted shard returns a verdict and exits.

## See also

- One page per agent in this section (see left sidebar).
- [Example Workflows](../07-workflows/quick-analysis.md) — real projects showing how shards chain together.
