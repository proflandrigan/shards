# core/ inventory (E1.2)

Generated from `git ls-files src/agents src/templates` at commit 11760a3 (HEAD before the move; also tag `v-legacy` + 1 commit). Every legacy file is mapped to its new path. Moves were done with `git mv`, so `git log --follow` keeps history.

Legend: "-> deleted (orphaned v1 monolith...)" marks the per-agent `modes/phases.md` (analytics-engineer: `modes/quick_phases.md`, `modes/deep_phases.md`) files removed after the move, because the `phases*/` directories replace them and nothing referenced them. "-> deleted in E4" marks Knowledge Ledger files that move now and are removed by E4.

## Naming rules

- `src/agents/<id>.md` -> `core/agents/<id>/AGENT.md`
- `src/agents/specific_instructions/<snake>/phases*/` -> `core/agents/<id>/phases*/` (kebab-case id)
- other variant files -> `core/agents/<id>/modes/<name>.md`; `service_mode.md` -> `modes/service.md`
- `specific_instructions/shared/<name>.md` -> `core/protocols/<name>.md`, trailing `_protocol` dropped
- `src/templates/*` -> `core/templates/`
- `src/agents/.DS_Store` (stray tracked file) -> deleted
- Academic inline "Service Mode" + review checklist sections of academic.md were extracted into `core/agents/academic/modes/service.md` (new file; AGENT.md keeps a pointer)
- New in v2 (no legacy source): `core/agents/<id>/agent.yaml`, `persona-summary.md`, `core/schema/agent.schema.json`, and the 4 restored templates (E1.11)

## Mapping (239 files)

| # | Legacy path | New path | Note |
|---|---|---|---|
| 1 | `src/agents/academic.md` | `core/agents/academic/AGENT.md` |  |
| 2 | `src/agents/ai-engineer.md` | `core/agents/ai-engineer/AGENT.md` |  |
| 3 | `src/agents/analytics-engineer.md` | `core/agents/analytics-engineer/AGENT.md` |  |
| 4 | `src/agents/applied-ml-scientist.md` | `core/agents/applied-ml-scientist/AGENT.md` |  |
| 5 | `src/agents/backend-engineer.md` | `core/agents/backend-engineer/AGENT.md` |  |
| 6 | `src/agents/bi-engineer.md` | `core/agents/bi-engineer/AGENT.md` |  |
| 7 | `src/agents/data-analyst.md` | `core/agents/data-analyst/AGENT.md` |  |
| 8 | `src/agents/data-engineer.md` | `core/agents/data-engineer/AGENT.md` |  |
| 9 | `src/agents/data-modeller.md` | `core/agents/data-modeller/AGENT.md` |  |
| 10 | `src/agents/data-scientist.md` | `core/agents/data-scientist/AGENT.md` |  |
| 11 | `src/agents/deep-learning-engineer.md` | `core/agents/deep-learning-engineer/AGENT.md` |  |
| 12 | `src/agents/ml-engineer.md` | `core/agents/ml-engineer/AGENT.md` |  |
| 13 | `src/agents/mlops-engineer.md` | `core/agents/mlops-engineer/AGENT.md` |  |
| 14 | `src/agents/researcher.md` | `core/agents/researcher/AGENT.md` |  |
| 15 | `src/agents/specific_instructions/academic/critical_review.md` | `core/agents/academic/modes/critical_review.md` |  |
| 16 | `src/agents/specific_instructions/academic/report.md` | `core/agents/academic/modes/report.md` |  |
| 17 | `src/agents/specific_instructions/ai_engineer/advise.md` | `core/agents/ai-engineer/modes/advise.md` |  |
| 18 | `src/agents/specific_instructions/ai_engineer/bi_engineer_handoff.md` | `core/agents/ai-engineer/modes/bi_engineer_handoff.md` |  |
| 19 | `src/agents/specific_instructions/ai_engineer/experiment.md` | `core/agents/ai-engineer/modes/experiment.md` |  |
| 20 | `src/agents/specific_instructions/ai_engineer/experiment_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 21 | `src/agents/specific_instructions/ai_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 22 | `src/agents/specific_instructions/ai_engineer/phases/index.md` | `core/agents/ai-engineer/phases/index.md` |  |
| 23 | `src/agents/specific_instructions/ai_engineer/phases/phase-1.md` | `core/agents/ai-engineer/phases/phase-1.md` |  |
| 24 | `src/agents/specific_instructions/ai_engineer/phases/phase-2.md` | `core/agents/ai-engineer/phases/phase-2.md` |  |
| 25 | `src/agents/specific_instructions/ai_engineer/phases/phase-3.md` | `core/agents/ai-engineer/phases/phase-3.md` |  |
| 26 | `src/agents/specific_instructions/ai_engineer/phases/phase-4.md` | `core/agents/ai-engineer/phases/phase-4.md` |  |
| 27 | `src/agents/specific_instructions/ai_engineer/phases/phase-5.md` | `core/agents/ai-engineer/phases/phase-5.md` |  |
| 28 | `src/agents/specific_instructions/ai_engineer/phases/phase-6.md` | `core/agents/ai-engineer/phases/phase-6.md` |  |
| 29 | `src/agents/specific_instructions/ai_engineer/phases/phase-7.md` | `core/agents/ai-engineer/phases/phase-7.md` |  |
| 30 | `src/agents/specific_instructions/ai_engineer/prompt_lab.md` | `core/agents/ai-engineer/modes/prompt_lab.md` |  |
| 31 | `src/agents/specific_instructions/ai_engineer/prompt_lab_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 32 | `src/agents/specific_instructions/ai_engineer/research.md` | `core/agents/ai-engineer/modes/research.md` |  |
| 33 | `src/agents/specific_instructions/ai_engineer/research_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 34 | `src/agents/specific_instructions/ai_engineer/review.md` | `core/agents/ai-engineer/modes/review.md` |  |
| 35 | `src/agents/specific_instructions/ai_engineer/validation_checklist.md` | `core/agents/ai-engineer/modes/validation_checklist.md` |  |
| 36 | `src/agents/specific_instructions/analytics_engineer/advise.md` | `core/agents/analytics-engineer/modes/advise.md` |  |
| 37 | `src/agents/specific_instructions/analytics_engineer/bi_engineer_handoff.md` | `core/agents/analytics-engineer/modes/bi_engineer_handoff.md` |  |
| 38 | `src/agents/specific_instructions/analytics_engineer/data_analyst_handoff.md` | `core/agents/analytics-engineer/modes/data_analyst_handoff.md` |  |
| 39 | `src/agents/specific_instructions/analytics_engineer/deep_phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 40 | `src/agents/specific_instructions/analytics_engineer/phases_deep/index.md` | `core/agents/analytics-engineer/phases_deep/index.md` |  |
| 41 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-1.md` | `core/agents/analytics-engineer/phases_deep/phase-1.md` |  |
| 42 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-2.md` | `core/agents/analytics-engineer/phases_deep/phase-2.md` |  |
| 43 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-3.md` | `core/agents/analytics-engineer/phases_deep/phase-3.md` |  |
| 44 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-4.md` | `core/agents/analytics-engineer/phases_deep/phase-4.md` |  |
| 45 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-5.md` | `core/agents/analytics-engineer/phases_deep/phase-5.md` |  |
| 46 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-6.md` | `core/agents/analytics-engineer/phases_deep/phase-6.md` |  |
| 47 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-7.md` | `core/agents/analytics-engineer/phases_deep/phase-7.md` |  |
| 48 | `src/agents/specific_instructions/analytics_engineer/phases_deep/phase-8.md` | `core/agents/analytics-engineer/phases_deep/phase-8.md` |  |
| 49 | `src/agents/specific_instructions/analytics_engineer/phases_quick/index.md` | `core/agents/analytics-engineer/phases_quick/index.md` |  |
| 50 | `src/agents/specific_instructions/analytics_engineer/phases_quick/phase-1.md` | `core/agents/analytics-engineer/phases_quick/phase-1.md` |  |
| 51 | `src/agents/specific_instructions/analytics_engineer/phases_quick/phase-2.md` | `core/agents/analytics-engineer/phases_quick/phase-2.md` |  |
| 52 | `src/agents/specific_instructions/analytics_engineer/quick_phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 53 | `src/agents/specific_instructions/analytics_engineer/review.md` | `core/agents/analytics-engineer/modes/review.md` |  |
| 54 | `src/agents/specific_instructions/analytics_engineer/service_mode.md` | `core/agents/analytics-engineer/modes/service.md` |  |
| 55 | `src/agents/specific_instructions/analytics_engineer/ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 56 | `src/agents/specific_instructions/analytics_engineer/update.md` | `core/agents/analytics-engineer/modes/update.md` |  |
| 57 | `src/agents/specific_instructions/analytics_engineer/validation_checklist.md` | `core/agents/analytics-engineer/modes/validation_checklist.md` |  |
| 58 | `src/agents/specific_instructions/applied_ml_scientist/advise.md` | `core/agents/applied-ml-scientist/modes/advise.md` |  |
| 59 | `src/agents/specific_instructions/applied_ml_scientist/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 60 | `src/agents/specific_instructions/applied_ml_scientist/phases/index.md` | `core/agents/applied-ml-scientist/phases/index.md` |  |
| 61 | `src/agents/specific_instructions/applied_ml_scientist/phases/phase-1.md` | `core/agents/applied-ml-scientist/phases/phase-1.md` |  |
| 62 | `src/agents/specific_instructions/applied_ml_scientist/phases/phase-2.md` | `core/agents/applied-ml-scientist/phases/phase-2.md` |  |
| 63 | `src/agents/specific_instructions/applied_ml_scientist/phases/phase-3.md` | `core/agents/applied-ml-scientist/phases/phase-3.md` |  |
| 64 | `src/agents/specific_instructions/applied_ml_scientist/phases/phase-4.md` | `core/agents/applied-ml-scientist/phases/phase-4.md` |  |
| 65 | `src/agents/specific_instructions/applied_ml_scientist/phases/phase-5.md` | `core/agents/applied-ml-scientist/phases/phase-5.md` |  |
| 66 | `src/agents/specific_instructions/applied_ml_scientist/research.md` | `core/agents/applied-ml-scientist/modes/research.md` |  |
| 67 | `src/agents/specific_instructions/applied_ml_scientist/review.md` | `core/agents/applied-ml-scientist/modes/review.md` |  |
| 68 | `src/agents/specific_instructions/applied_ml_scientist/validation_checklist.md` | `core/agents/applied-ml-scientist/modes/validation_checklist.md` |  |
| 69 | `src/agents/specific_instructions/backend_engineer/clean.md` | `core/agents/backend-engineer/modes/clean.md` |  |
| 70 | `src/agents/specific_instructions/backend_engineer/review.md` | `core/agents/backend-engineer/modes/review.md` |  |
| 71 | `src/agents/specific_instructions/backend_engineer/review_checklist.md` | `core/agents/backend-engineer/modes/review_checklist.md` |  |
| 72 | `src/agents/specific_instructions/backend_engineer/service_mode.md` | `core/agents/backend-engineer/modes/service.md` |  |
| 73 | `src/agents/specific_instructions/bi_engineer/advise.md` | `core/agents/bi-engineer/modes/advise.md` |  |
| 74 | `src/agents/specific_instructions/bi_engineer/data_analyst_handoff.md` | `core/agents/bi-engineer/modes/data_analyst_handoff.md` |  |
| 75 | `src/agents/specific_instructions/bi_engineer/incoming_handoff.md` | `core/agents/bi-engineer/modes/incoming_handoff.md` |  |
| 76 | `src/agents/specific_instructions/bi_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 77 | `src/agents/specific_instructions/bi_engineer/phases/index.md` | `core/agents/bi-engineer/phases/index.md` |  |
| 78 | `src/agents/specific_instructions/bi_engineer/phases/phase-1.md` | `core/agents/bi-engineer/phases/phase-1.md` |  |
| 79 | `src/agents/specific_instructions/bi_engineer/phases/phase-2.md` | `core/agents/bi-engineer/phases/phase-2.md` |  |
| 80 | `src/agents/specific_instructions/bi_engineer/phases/phase-3.md` | `core/agents/bi-engineer/phases/phase-3.md` |  |
| 81 | `src/agents/specific_instructions/bi_engineer/phases/phase-4.md` | `core/agents/bi-engineer/phases/phase-4.md` |  |
| 82 | `src/agents/specific_instructions/bi_engineer/review.md` | `core/agents/bi-engineer/modes/review.md` |  |
| 83 | `src/agents/specific_instructions/bi_engineer/update.md` | `core/agents/bi-engineer/modes/update.md` |  |
| 84 | `src/agents/specific_instructions/bi_engineer/validation_checklist.md` | `core/agents/bi-engineer/modes/validation_checklist.md` |  |
| 85 | `src/agents/specific_instructions/data_analyst/advise.md` | `core/agents/data-analyst/modes/advise.md` |  |
| 86 | `src/agents/specific_instructions/data_analyst/explain.md` | `core/agents/data-analyst/modes/explain.md` |  |
| 87 | `src/agents/specific_instructions/data_analyst/incoming_handoff.md` | `core/agents/data-analyst/modes/incoming_handoff.md` |  |
| 88 | `src/agents/specific_instructions/data_analyst/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 89 | `src/agents/specific_instructions/data_analyst/phases/index.md` | `core/agents/data-analyst/phases/index.md` |  |
| 90 | `src/agents/specific_instructions/data_analyst/phases/phase-1.md` | `core/agents/data-analyst/phases/phase-1.md` |  |
| 91 | `src/agents/specific_instructions/data_analyst/phases/phase-2.md` | `core/agents/data-analyst/phases/phase-2.md` |  |
| 92 | `src/agents/specific_instructions/data_analyst/phases/phase-3.md` | `core/agents/data-analyst/phases/phase-3.md` |  |
| 93 | `src/agents/specific_instructions/data_analyst/phases/phase-4.md` | `core/agents/data-analyst/phases/phase-4.md` |  |
| 94 | `src/agents/specific_instructions/data_analyst/review.md` | `core/agents/data-analyst/modes/review.md` |  |
| 95 | `src/agents/specific_instructions/data_analyst/ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 96 | `src/agents/specific_instructions/data_analyst/update.md` | `core/agents/data-analyst/modes/update.md` |  |
| 97 | `src/agents/specific_instructions/data_analyst/validation_checklist.md` | `core/agents/data-analyst/modes/validation_checklist.md` |  |
| 98 | `src/agents/specific_instructions/data_engineer/advise.md` | `core/agents/data-engineer/modes/advise.md` |  |
| 99 | `src/agents/specific_instructions/data_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 100 | `src/agents/specific_instructions/data_engineer/phases_deep/index.md` | `core/agents/data-engineer/phases_deep/index.md` |  |
| 101 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-1.md` | `core/agents/data-engineer/phases_deep/phase-1.md` |  |
| 102 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-2.md` | `core/agents/data-engineer/phases_deep/phase-2.md` |  |
| 103 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-3.md` | `core/agents/data-engineer/phases_deep/phase-3.md` |  |
| 104 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-4.md` | `core/agents/data-engineer/phases_deep/phase-4.md` |  |
| 105 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-5.md` | `core/agents/data-engineer/phases_deep/phase-5.md` |  |
| 106 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-6.md` | `core/agents/data-engineer/phases_deep/phase-6.md` |  |
| 107 | `src/agents/specific_instructions/data_engineer/phases_deep/phase-7.md` | `core/agents/data-engineer/phases_deep/phase-7.md` |  |
| 108 | `src/agents/specific_instructions/data_engineer/phases_quick/index.md` | `core/agents/data-engineer/phases_quick/index.md` |  |
| 109 | `src/agents/specific_instructions/data_engineer/phases_quick/phase-1.md` | `core/agents/data-engineer/phases_quick/phase-1.md` |  |
| 110 | `src/agents/specific_instructions/data_engineer/phases_quick/phase-2.md` | `core/agents/data-engineer/phases_quick/phase-2.md` |  |
| 111 | `src/agents/specific_instructions/data_engineer/review.md` | `core/agents/data-engineer/modes/review.md` |  |
| 112 | `src/agents/specific_instructions/data_engineer/validation_checklist.md` | `core/agents/data-engineer/modes/validation_checklist.md` |  |
| 113 | `src/agents/specific_instructions/data_modeller/advise.md` | `core/agents/data-modeller/modes/advise.md` |  |
| 114 | `src/agents/specific_instructions/data_modeller/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 115 | `src/agents/specific_instructions/data_modeller/phases_deep/index.md` | `core/agents/data-modeller/phases_deep/index.md` |  |
| 116 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-1.md` | `core/agents/data-modeller/phases_deep/phase-1.md` |  |
| 117 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-2.md` | `core/agents/data-modeller/phases_deep/phase-2.md` |  |
| 118 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-3.md` | `core/agents/data-modeller/phases_deep/phase-3.md` |  |
| 119 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-4.md` | `core/agents/data-modeller/phases_deep/phase-4.md` |  |
| 120 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-5.md` | `core/agents/data-modeller/phases_deep/phase-5.md` |  |
| 121 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-6.md` | `core/agents/data-modeller/phases_deep/phase-6.md` |  |
| 122 | `src/agents/specific_instructions/data_modeller/phases_deep/phase-7.md` | `core/agents/data-modeller/phases_deep/phase-7.md` |  |
| 123 | `src/agents/specific_instructions/data_modeller/phases_quick/index.md` | `core/agents/data-modeller/phases_quick/index.md` |  |
| 124 | `src/agents/specific_instructions/data_modeller/phases_quick/phase-1.md` | `core/agents/data-modeller/phases_quick/phase-1.md` |  |
| 125 | `src/agents/specific_instructions/data_modeller/phases_quick/phase-2.md` | `core/agents/data-modeller/phases_quick/phase-2.md` |  |
| 126 | `src/agents/specific_instructions/data_modeller/review.md` | `core/agents/data-modeller/modes/review.md` |  |
| 127 | `src/agents/specific_instructions/data_modeller/service_mode.md` | `core/agents/data-modeller/modes/service.md` |  |
| 128 | `src/agents/specific_instructions/data_modeller/validation_checklist.md` | `core/agents/data-modeller/modes/validation_checklist.md` |  |
| 129 | `src/agents/specific_instructions/data_scientist/advise.md` | `core/agents/data-scientist/modes/advise.md` |  |
| 130 | `src/agents/specific_instructions/data_scientist/bi_engineer_handoff.md` | `core/agents/data-scientist/modes/bi_engineer_handoff.md` |  |
| 131 | `src/agents/specific_instructions/data_scientist/experiment.md` | `core/agents/data-scientist/modes/experiment.md` |  |
| 132 | `src/agents/specific_instructions/data_scientist/experiment_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 133 | `src/agents/specific_instructions/data_scientist/explain.md` | `core/agents/data-scientist/modes/explain.md` |  |
| 134 | `src/agents/specific_instructions/data_scientist/greenfield_data.md` | `core/agents/data-scientist/modes/greenfield_data.md` |  |
| 135 | `src/agents/specific_instructions/data_scientist/ml_engineer_handoff.md` | `core/agents/data-scientist/modes/ml_engineer_handoff.md` |  |
| 136 | `src/agents/specific_instructions/data_scientist/notebook_walkthrough.md` | `core/agents/data-scientist/modes/notebook_walkthrough.md` |  |
| 137 | `src/agents/specific_instructions/data_scientist/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 138 | `src/agents/specific_instructions/data_scientist/phases/index.md` | `core/agents/data-scientist/phases/index.md` |  |
| 139 | `src/agents/specific_instructions/data_scientist/phases/phase-1.md` | `core/agents/data-scientist/phases/phase-1.md` |  |
| 140 | `src/agents/specific_instructions/data_scientist/phases/phase-2.md` | `core/agents/data-scientist/phases/phase-2.md` |  |
| 141 | `src/agents/specific_instructions/data_scientist/phases/phase-3.md` | `core/agents/data-scientist/phases/phase-3.md` |  |
| 142 | `src/agents/specific_instructions/data_scientist/phases/phase-4.md` | `core/agents/data-scientist/phases/phase-4.md` |  |
| 143 | `src/agents/specific_instructions/data_scientist/phases/phase-5.md` | `core/agents/data-scientist/phases/phase-5.md` |  |
| 144 | `src/agents/specific_instructions/data_scientist/phases/phase-6.md` | `core/agents/data-scientist/phases/phase-6.md` |  |
| 145 | `src/agents/specific_instructions/data_scientist/phases/phase-7.md` | `core/agents/data-scientist/phases/phase-7.md` |  |
| 146 | `src/agents/specific_instructions/data_scientist/research.md` | `core/agents/data-scientist/modes/research.md` |  |
| 147 | `src/agents/specific_instructions/data_scientist/research_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 148 | `src/agents/specific_instructions/data_scientist/review.md` | `core/agents/data-scientist/modes/review.md` |  |
| 149 | `src/agents/specific_instructions/data_scientist/service_mode.md` | `core/agents/data-scientist/modes/service.md` |  |
| 150 | `src/agents/specific_instructions/data_scientist/validation_checklist.md` | `core/agents/data-scientist/modes/validation_checklist.md` |  |
| 151 | `src/agents/specific_instructions/deep_learning_engineer/advise.md` | `core/agents/deep-learning-engineer/modes/advise.md` |  |
| 152 | `src/agents/specific_instructions/deep_learning_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 153 | `src/agents/specific_instructions/deep_learning_engineer/phases/index.md` | `core/agents/deep-learning-engineer/phases/index.md` |  |
| 154 | `src/agents/specific_instructions/deep_learning_engineer/phases/phase-1.md` | `core/agents/deep-learning-engineer/phases/phase-1.md` |  |
| 155 | `src/agents/specific_instructions/deep_learning_engineer/phases/phase-2.md` | `core/agents/deep-learning-engineer/phases/phase-2.md` |  |
| 156 | `src/agents/specific_instructions/deep_learning_engineer/phases/phase-3.md` | `core/agents/deep-learning-engineer/phases/phase-3.md` |  |
| 157 | `src/agents/specific_instructions/deep_learning_engineer/phases/phase-4.md` | `core/agents/deep-learning-engineer/phases/phase-4.md` |  |
| 158 | `src/agents/specific_instructions/deep_learning_engineer/phases/phase-5.md` | `core/agents/deep-learning-engineer/phases/phase-5.md` |  |
| 159 | `src/agents/specific_instructions/deep_learning_engineer/research.md` | `core/agents/deep-learning-engineer/modes/research.md` |  |
| 160 | `src/agents/specific_instructions/deep_learning_engineer/review.md` | `core/agents/deep-learning-engineer/modes/review.md` |  |
| 161 | `src/agents/specific_instructions/deep_learning_engineer/validation_checklist.md` | `core/agents/deep-learning-engineer/modes/validation_checklist.md` |  |
| 162 | `src/agents/specific_instructions/ml_engineer/advise.md` | `core/agents/ml-engineer/modes/advise.md` |  |
| 163 | `src/agents/specific_instructions/ml_engineer/bi_engineer_handoff.md` | `core/agents/ml-engineer/modes/bi_engineer_handoff.md` |  |
| 164 | `src/agents/specific_instructions/ml_engineer/experiment.md` | `core/agents/ml-engineer/modes/experiment.md` |  |
| 165 | `src/agents/specific_instructions/ml_engineer/experiment_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 166 | `src/agents/specific_instructions/ml_engineer/notebook_walkthrough.md` | `core/agents/ml-engineer/modes/notebook_walkthrough.md` |  |
| 167 | `src/agents/specific_instructions/ml_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 168 | `src/agents/specific_instructions/ml_engineer/phases/index.md` | `core/agents/ml-engineer/phases/index.md` |  |
| 169 | `src/agents/specific_instructions/ml_engineer/phases/phase-1.md` | `core/agents/ml-engineer/phases/phase-1.md` |  |
| 170 | `src/agents/specific_instructions/ml_engineer/phases/phase-2.md` | `core/agents/ml-engineer/phases/phase-2.md` |  |
| 171 | `src/agents/specific_instructions/ml_engineer/phases/phase-3.md` | `core/agents/ml-engineer/phases/phase-3.md` |  |
| 172 | `src/agents/specific_instructions/ml_engineer/phases/phase-4.md` | `core/agents/ml-engineer/phases/phase-4.md` |  |
| 173 | `src/agents/specific_instructions/ml_engineer/phases/phase-5.md` | `core/agents/ml-engineer/phases/phase-5.md` |  |
| 174 | `src/agents/specific_instructions/ml_engineer/phases/phase-6-5.md` | `core/agents/ml-engineer/phases/phase-6-5.md` |  |
| 175 | `src/agents/specific_instructions/ml_engineer/phases/phase-6.md` | `core/agents/ml-engineer/phases/phase-6.md` |  |
| 176 | `src/agents/specific_instructions/ml_engineer/phases/phase-7.md` | `core/agents/ml-engineer/phases/phase-7.md` |  |
| 177 | `src/agents/specific_instructions/ml_engineer/research.md` | `core/agents/ml-engineer/modes/research.md` |  |
| 178 | `src/agents/specific_instructions/ml_engineer/research_ui_mode.md` | (dropped) | UI mode folded into `artifact_emit` (E-ui fold); UI hook removed |
| 179 | `src/agents/specific_instructions/ml_engineer/review.md` | `core/agents/ml-engineer/modes/review.md` |  |
| 180 | `src/agents/specific_instructions/ml_engineer/service_mode.md` | `core/agents/ml-engineer/modes/service.md` |  |
| 181 | `src/agents/specific_instructions/ml_engineer/validation_checklist.md` | `core/agents/ml-engineer/modes/validation_checklist.md` |  |
| 182 | `src/agents/specific_instructions/mlops_engineer/advise.md` | `core/agents/mlops-engineer/modes/advise.md` |  |
| 183 | `src/agents/specific_instructions/mlops_engineer/phases.md` | -> deleted (orphaned v1 monolith; phases live in `phases*/`) |  |
| 184 | `src/agents/specific_instructions/mlops_engineer/phases/index.md` | `core/agents/mlops-engineer/phases/index.md` |  |
| 185 | `src/agents/specific_instructions/mlops_engineer/phases/phase-1.md` | `core/agents/mlops-engineer/phases/phase-1.md` |  |
| 186 | `src/agents/specific_instructions/mlops_engineer/phases/phase-2.md` | `core/agents/mlops-engineer/phases/phase-2.md` |  |
| 187 | `src/agents/specific_instructions/mlops_engineer/phases/phase-3.md` | `core/agents/mlops-engineer/phases/phase-3.md` |  |
| 188 | `src/agents/specific_instructions/mlops_engineer/phases/phase-4.md` | `core/agents/mlops-engineer/phases/phase-4.md` |  |
| 189 | `src/agents/specific_instructions/mlops_engineer/phases/phase-5.md` | `core/agents/mlops-engineer/phases/phase-5.md` |  |
| 190 | `src/agents/specific_instructions/mlops_engineer/phases/phase-6.md` | `core/agents/mlops-engineer/phases/phase-6.md` |  |
| 191 | `src/agents/specific_instructions/mlops_engineer/phases/phase-7.md` | `core/agents/mlops-engineer/phases/phase-7.md` |  |
| 192 | `src/agents/specific_instructions/mlops_engineer/review.md` | `core/agents/mlops-engineer/modes/review.md` |  |
| 193 | `src/agents/specific_instructions/mlops_engineer/service_mode.md` | `core/agents/mlops-engineer/modes/service.md` |  |
| 194 | `src/agents/specific_instructions/mlops_engineer/validation_checklist.md` | `core/agents/mlops-engineer/modes/validation_checklist.md` |  |
| 195 | `src/agents/specific_instructions/researcher/critical_review.md` | `core/agents/researcher/modes/critical_review.md` |  |
| 196 | `src/agents/specific_instructions/researcher/review_checklist.md` | `core/agents/researcher/modes/review_checklist.md` |  |
| 197 | `src/agents/specific_instructions/researcher/service_mode.md` | `core/agents/researcher/modes/service.md` |  |
| 198 | `src/agents/specific_instructions/shared/auto_verify_mode.md` | `core/protocols/auto_verify_mode.md` |  |
| 199 | `src/agents/specific_instructions/shared/autonomous_research.md` | `core/protocols/autonomous_research.md` |  |
| 200 | `src/agents/specific_instructions/shared/behavioral_rules.md` | `core/protocols/behavioral_rules.md` |  |
| 201 | `src/agents/specific_instructions/shared/diverge_protocol.md` | `core/protocols/diverge.md` |  |
| 202 | `src/agents/specific_instructions/shared/engineering_guidelines.md` | `core/protocols/engineering_guidelines.md` |  |
| 203 | `src/agents/specific_instructions/shared/experiment_versioning.md` | `core/protocols/experiment_versioning.md` |  |
| 204 | `src/agents/specific_instructions/shared/goal_mode.md` | `core/protocols/goal_mode.md` |  |
| 205 | `src/agents/specific_instructions/shared/incremental_testing.md` | `core/protocols/incremental_testing.md` |  |
| 206 | `src/agents/specific_instructions/shared/intent_discovery.md` | `core/protocols/intent_discovery.md` |  |
| 207 | `src/agents/specific_instructions/shared/join_path_protocol.md` | `core/protocols/join_path.md` |  |
| 208 | `src/agents/specific_instructions/shared/knowledge_checkpoint.md` | (dropped) | deleted in E4 (Knowledge Ledger removed) |
| 209 | `src/agents/specific_instructions/shared/knowledge_harvest.md` | (dropped) | deleted in E4 (Knowledge Ledger removed) |
| 210 | `src/agents/specific_instructions/shared/knowledge_retrieval.md` | (dropped) | deleted in E4 (Knowledge Ledger removed) |
| 211 | `src/agents/specific_instructions/shared/notebook_walkthrough_protocol.md` | `core/protocols/notebook_walkthrough.md` |  |
| 212 | `src/agents/specific_instructions/shared/reviewer_verdict_protocol.md` | `core/protocols/reviewer_verdict.md` |  |
| 213 | `src/agents/specific_instructions/shared/swarm_protocol.md` | `core/protocols/swarm.md` |  |
| 214 | `src/agents/specific_instructions/shared/validation_protocol.md` | `core/protocols/validation.md` |  |
| 215 | `src/agents/specific_instructions/syn/arbiter.md` | `core/agents/syn/modes/arbiter.md` |  |
| 216 | `src/agents/specific_instructions/syn/brainstorm.md` | `core/agents/syn/modes/brainstorm.md` |  |
| 217 | `src/agents/specific_instructions/syn/code_review.md` | `core/agents/syn/modes/code_review.md` |  |
| 218 | `src/agents/specific_instructions/syn/diff.md` | `core/agents/syn/modes/diff.md` |  |
| 219 | `src/agents/specific_instructions/syn/final_review.md` | `core/agents/syn/modes/final_review.md` |  |
| 220 | `src/agents/specific_instructions/syn/fixer.md` | `core/agents/syn/modes/fixer.md` |  |
| 221 | `src/agents/specific_instructions/syn/free_form.md` | `core/agents/syn/modes/free_form.md` |  |
| 222 | `src/agents/specific_instructions/syn/knowledge.md` | (dropped) | deleted in E4 (Knowledge Ledger removed) |
| 223 | `src/agents/specific_instructions/syn/notebook_walkthrough.md` | `core/agents/syn/modes/notebook_walkthrough.md` |  |
| 224 | `src/agents/specific_instructions/syn/panel_review.md` | `core/agents/syn/modes/panel_review.md` |  |
| 225 | `src/agents/specific_instructions/syn/pm.md` | `core/agents/syn/modes/pm.md` |  |
| 226 | `src/agents/specific_instructions/syn/pr_review.md` | `core/agents/syn/modes/pr_review.md` |  |
| 227 | `src/agents/specific_instructions/syn/slides.md` | `core/agents/syn/modes/slides.md` |  |
| 228 | `src/agents/syn.md` | `core/agents/syn/AGENT.md` |  |
| 229 | `src/templates/analysis-template.md` | `core/templates/analysis-template.md` |  |
| 230 | `src/templates/branch-report.md` | `core/templates/branch-report.md` |  |
| 231 | `src/templates/diff-report.md` | `core/templates/diff-report.md` |  |
| 232 | `src/templates/knowledge-index.md` | (dropped) | deleted in E4 (Knowledge Ledger removed) |
| 233 | `src/templates/model-card-schema.json` | `core/templates/model-card-schema.json` |  |
| 234 | `src/templates/model-card-schema.md` | `core/templates/model-card-schema.md` |  |
| 235 | `src/templates/model-card.md` | `core/templates/model-card.md` |  |
| 236 | `src/templates/project-plan.md` | `core/templates/project-plan.md` |  |
| 237 | `src/templates/project-specs.md` | `core/templates/project-specs.md` |  |
| 238 | `src/templates/report-template.md` | `core/templates/report-template.md` |  |
| 239 | `src/templates/study-template.md` | `core/templates/study-template.md` |  |
| 240 | `src/agents/.DS_Store` | (dropped) | junk file |
