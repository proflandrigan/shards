> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — AI Architecture Design

Goal: Design the AI/LLM workflow architecture, always starting from the simplest
possible approach and climbing only when forced to.

**The Simplicity Ladder** — try in order, justify each step up:

1. **Single prompt** — one LLM call, well-crafted prompt, structured output.
   If this solves the problem, stop here. Most problems are simpler than people think.
2. **Prompt chain** — sequential LLM calls where output feeds the next input.
   Only when a single prompt can't handle the complexity.
3. **RAG (Retrieval-Augmented Generation)** — retrieval step + generation step.
   Only when the LLM needs access to knowledge it doesn't have.
4. **Agent with tools** — LLM with tool use, loops, branching.
   Only when the task requires dynamic decision-making the prompt chain can't handle.
5. **Multi-agent orchestration** — multiple specialized agents coordinating.
   Only when a single agent's context or capability is genuinely insufficient.
6. **Fine-tuning** — custom model training.
   Last resort. Only when prompt engineering has hit a demonstrable ceiling.

For each rung, explain why the simpler option is insufficient before moving up.
Document this reasoning explicitly. "We need RAG because..." is required. "RAG seems
cool" is not.

Design decisions to make:
- **Prompt design:** System prompt, few-shot examples, output format (JSON, markdown,
  etc.), prompt versioning strategy
- **Model selection:** Which model for which step? Always start with the cheapest model
  that could work. Upgrade only when evaluation proves it's insufficient.
- **If RAG:** Embedding model, vector store, chunking strategy, retrieval method
  (semantic, hybrid, keyword), top-k, reranking strategy
- **If agentic:** Tool definitions, loop limits, safety bounds, maximum iterations,
  cost caps per execution
- **If fine-tuning:** Training data requirements, evaluation holdout, base model
  selection, when to stop training
- **Structured output:** How to enforce output format? (JSON mode, function calling,
  schema validation, parsing + retry)
- **Caching strategy:** Which LLM calls can be cached? Cache key design, TTL,
  invalidation rules
- **Error handling:** What happens on malformed LLM output? Retry with same prompt?
  Retry with modified prompt? Fallback to deterministic logic?

### Document Phase 3

```markdown
---

## Phase 3: AI Architecture Design (AI Engineer)
- **Simplicity ladder position:** <single prompt | chain | RAG | agent | multi-agent | fine-tune>
- **Justification for complexity level:**
  - Why <simpler option> is insufficient: <reason>
- **Architecture overview:** <1-3 sentence description of the workflow>
- **Prompt design:**
  - System prompt strategy: <description>
  - Few-shot examples: Yes (<N> examples) | No
  - Output format: <JSON | markdown | plain text | structured>
  - Versioning: <strategy>
- **Model selection:**
  - Primary model: <provider/model> — rationale: <why this model>
  - Secondary model (if applicable): <provider/model> — used for: <what>
  - Cost per call: ~$<X> per 1K tokens
- **If RAG:**
  - Embedding model: <model>
  - Vector store: <store>
  - Chunking: <strategy, chunk size, overlap>
  - Retrieval: <semantic | hybrid | keyword> — top-k: <N>
  - Reranking: <method or "none">
- **If agentic:**
  - Tools: <list of tools>
  - Loop limit: <max iterations>
  - Cost cap: <max $ per execution>
  - Safety bounds: <what the agent cannot do>
- **If fine-tuning:**
  - Base model: <model>
  - Training data: <size, source, quality>
  - Evaluation holdout: <% or method>
- **Caching strategy:** <what's cached, TTL, key design>
- **Error handling:** <retry strategy, fallback logic>
```

**DIVERGE check:** If you identified 2-3 mutually exclusive architectural approaches (e.g., different positions on the Simplicity Ladder, fundamentally different system designs) that are genuinely equally viable, you MAY propose a DIVERGE fork. Read `.claude/agents/specific_instructions/shared/diverge_protocol.md` and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

::GATE:: id=ai-engineer-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
