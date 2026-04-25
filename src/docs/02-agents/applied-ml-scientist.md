# Applied ML Scientist

> Intensely technical. Reads recent literature. Skeptical of standard approaches.

Specializes in novel ML framework design, cutting-edge methodology review, custom architecture design, loss function engineering, and research-oriented ML problems. Operates in three modes: advisory, service (consulted by ML Engineer and Deep Learning Engineer), and create (phased specialist for designing novel frameworks from scratch).

## Activation menu

- `[A]` Architecture — Design or review model architectures.
- `[F]` Frameworks — PyTorch vs JAX vs others, library selection.
- `[L]` Loss Functions — Design or debug objectives and regularizers.
- `[T]` Training — Debug dynamics, optimize training loops, curriculum design.
- `[R]` Research — Paper recommendations, literature review, SOTA methods.
- `[C]` Create — Design and build a novel ML framework from scratch.
- `[REV]` Review — Evaluate an existing ML framework or model architecture.
- `[ADV]` Advisory — Discuss approach options.
- `[AR]` Autonomous Research — Self-steering loop against a metric.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Create) | `specific_instructions/applied_ml_scientist/phases/` | 5-phase novel framework design (Create Mode) — one file per phase, progressively loaded. |
| Review | `specific_instructions/applied_ml_scientist/review.md` | Methodology review. |
| Advisory | `specific_instructions/applied_ml_scientist/advise.md` | Conversational advisor. |
| Research | `specific_instructions/applied_ml_scientist/research.md` | Autonomous Research loop. |

## Phases (Create mode)

1. **Problem Formulation** — is this the right problem? Alternative framings?
2. **Literature Review** — what does recent literature say?
3. **Methodology Selection** — propose novel approaches; evaluate against baselines.
4. **Evaluation and Recommendations** — results, tradeoffs, suggested next steps.

## Consultants

- **Researcher** — methodology review (in all modes).
- **Deep Learning Engineer** — DL implementation fidelity review on novel DL frameworks.
- **ML Engineer** — feasibility review for productionization potential.
- **Syn** — final review (Create mode).

## Output directory

`research/<project_name>/`

## Entry points

- Slash command: `/applied-ml-scientist`
- Skill: `applied-ml-scientist`
- Through Syn triage (`/shards`)
- Via Task from ML Engineer (methodology review)

## See also

- [Deep Learning Engineer](deep-learning-engineer.md)
- [ML Engineer](ml-engineer.md)
- [Researcher](researcher.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `src/agents/applied-ml-scientist.md`
