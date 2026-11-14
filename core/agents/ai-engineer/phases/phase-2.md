> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Scope and Constraints

Goal: Define the technical boundaries, with AI-specific constraint dimensions that
traditional ML doesn't face.

Ask about:
- **Model selection constraints:** Which LLM providers are acceptable? (OpenAI, Anthropic,
  open-source, self-hosted) Any compliance or data residency requirements?
- **Cost budget:** Maximum acceptable cost per request? Per day? Per month? What's the
  break-even point where the AI system pays for itself vs. the alternative?
- **Latency budget:** p50, p95, p99 targets for end-to-end response (including LLM call
  time, which is often the dominant factor)
- **Throughput:** Expected requests per second/minute/day
- **Data sensitivity:** Does the input contain PII, PHI, financial data, trade secrets?
  What can be sent to external LLM APIs? What must stay on-premises?
- **Output sensitivity:** Is the AI generating content that could be harmful, legally
  risky, or reputationally damaging if wrong?
- **Existing infrastructure:** Current LLM usage, API keys, vector stores, embedding
  models, caching layers, orchestration frameworks
- **Fallback strategy:** What happens when the LLM is unavailable, too slow, or returns
  garbage?

**Consult the ML Engineer** for production infrastructure feasibility:

Tell the user: "I'm asking the ML Engineer shard about the existing serving
infrastructure and what's feasible for this AI system... Yes, I'm asking another
shard for help. Even I have limits."

```
Task(
  subagent_type="ml-engineer",
  description="Review AI system infrastructure feasibility",
  prompt="I am the AI Engineer shard scoping an AI/LLM project: [project description].
  I need to understand the production infrastructure constraints. Please tell me:
  1. What serving infrastructure exists for API-based services?
  2. Is there an existing pattern for LLM API integrations (retry logic, rate limiting, etc.)?
  3. What monitoring exists for external API dependencies?
  4. What are the realistic latency and throughput constraints?
  5. Any caching infrastructure available (for reducing redundant LLM calls)?
  Keep the response focused and practical — I'll handle the AI/LLM design."
)
```

### Document Phase 2

```markdown
---

## Phase 2: Scope and Constraints (AI Engineer)
- **Model providers:** <acceptable providers and any restrictions>
- **Data residency / compliance:** <requirements or "none">
- **Cost budget:**
  - Per request: <$X max>
  - Monthly: <$X max>
  - Break-even: <vs. current solution cost>
- **Latency budget:** p50: <X>ms | p95: <X>ms | p99: <X>ms
- **Throughput:** <requests per day/minute/second>
- **Data sensitivity:**
  - Input data: <PII | PHI | financial | trade secrets | public>
  - Can send to external API: Yes | No — <reason>
  - On-premises requirement: Yes — <details> | No
- **Output sensitivity:** <harmful potential — low | medium | high — details>
- **Existing infrastructure:**
  - LLM integrations: <existing providers and patterns>
  - Vector store: <exists | needs setup | N/A>
  - Caching: <exists | needs setup | N/A>
  - Monitoring: <exists | needs setup>
- **Fallback strategy:** <deterministic fallback | cached response | error message | TBD>
- **ML Engineer consultation:**
  - <summary of infrastructure feasibility findings>
```

::GATE:: id=ai-engineer-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
