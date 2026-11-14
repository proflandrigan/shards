# AI Engineer — BI Monitoring Dashboard Handoff

This file governs Step 6 of Phase 7 (Deliver and Document) for the AI Engineer shard. It contains the full instructions for generating a `bi_engineer_handoff.md` file for operational monitoring of a deployed AI system.

---

6. **BI monitoring dashboard handoff:**

   Ask the user: "This system produces observable metrics — latency, quality
   scores, cost per request, safety pass rates. Do you want a
   `bi_engineer_handoff.md` so the BI Engineer shard can build an operational
   monitoring dashboard?"

   For iteration projects where a monitoring dashboard already exists, only
   ask if this iteration added new metrics or changed monitoring scope.

   ::GATE:: id=ai-engineer-bi-engineer-handoff-phase-0 phase=0 kind=phase
Wait for an explicit yes or no. Do not generate the file unless the user confirms.
::ENDGATE::

   If yes, write `services/<project_name>/bi_engineer_handoff.md`:

   ```
   # BI Engineer Handoff: <project_name>

   ## Source Project
   - Originating agent: AI Engineer
   - Project directory: services/<project_name>/
   - Project specs: services/<project_name>/project-specs.md
   - Project report: services/<project_name>/report.md

   ## What Was Built
   - System type: <prompt chain / RAG / agentic / transformation from Phase 0>
   - Primary model: <provider and model from Phase 3>
   - System purpose: <one sentence from Phase 1>
   - Architecture position: <simplicity ladder position from Phase 3>

   ## Dashboarding Objective
   - Purpose: AI system operational monitoring dashboard
   - Intended audience: <ML or engineering team from Phase 1>
   - Dashboard type: LLM system observability / eval monitoring

   ## Key Metrics to Display
   Quality metrics:
   - Correctness: <metric and target from Phase 6>
   - Relevance: <metric and target from Phase 6>
   - Safety pass rate: <rate from Phase 6> — threshold: <threshold>
   - Format compliance: <metric from Phase 6>

   Cost metrics:
   - Cost per request: $<from Phase 6>
   - Monthly projection at volume: $<from Phase 6>
   - Cost anomaly threshold: <alert threshold from Phase 5>

   Latency metrics:
   - p95 latency target: <from Phase 4>
   - LLM call time actual: <p95 from Phase 6>

   Safety metrics:
   - Prompt injection pass rate: <from Phase 6>
   - Adversarial input pass rate: <from Phase 6>
   - Content filter triggers: <rate or count>

   ## Data Sources for Dashboard
   - Evaluation test set: services/<project_name>/eval/
   - Production request logs: <log source from Phase 5 monitoring plan>
   - LLM API usage data: <API provider dashboard or internal log>
   - Safety incident log: <incident log location from Phase 5>

   ## Tool Recommendation
   - <Streamlit for internal / Grafana for ops> — <one-sentence rationale>
   - No preference? Let the BI Engineer recommend during Phase 0.

   ## Constraints
   - Monitoring approach from Phase 5: <quality tracking method and cadence>
   - Refresh cadence: <real-time or daily batch>
   - Data access: <log streaming or batch export>

   ## Next Step
   Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
   services/<project_name>/bi_engineer_handoff.md
   ```

   Tell the user: "Handoff file written. Run `/bi-engineer` or `/shards` and
   reference `services/<project_name>/bi_engineer_handoff.md` in Phase 0."
   Do NOT attempt to morph into or invoke the BI Engineer.
