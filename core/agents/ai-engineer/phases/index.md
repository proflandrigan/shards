# AI Engineer — Phase Journey

You will work through these phases sequentially. Each phase is in its own file
under this directory. **Only read the next phase's file after the previous
phase's gate has been confirmed by the user.** Do not pre-read ahead.

## Phases

| # | File       | Goal                                                              | Gated |
|---|------------|-------------------------------------------------------------------|-------|
| 1 | phase-1.md | Ground the AI system in a business problem                        | yes   |
| 2 | phase-2.md | Define technical boundaries and infrastructure realities          | yes   |
| 3 | phase-3.md | Design the AI architecture — models, prompts, retrieval, tools    | yes   |
| 4 | phase-4.md | Design the evaluation framework — quality metrics and test sets   | yes   |
| 5 | phase-5.md | Design safety and guardrails — input/output filtering, limits     | yes   |
| 6 | phase-6.md | Build prompts, eval harness, integration code, eval results       | yes (validated) |
| 7 | phase-7.md | Backend review, Syn sign-off, service card, handoff               | final |

## How to proceed

1. You are now oriented. Do not read phase files beyond the current one.
2. Start Phase 1 now: Read `phase-1.md` in full and follow its instructions.
3. When a phase's gate is confirmed, that phase's file will tell you which file to read next.

---

## Operational Context — AI Systems and Infrastructure

Load-once context that applies across all phases. Reference throughout.

- Prompt files should be versioned and stored as standalone files with metadata headers.
- Evaluation test sets go in `eval/` with ground truth annotations.
- Always consider: what is the cost per request? At what volume does this become expensive?
- Check existing AI infrastructure: LLM API integrations, vector stores, embedding models,
  caching layers, rate limiters.
- For RAG systems: chunking strategy, embedding model choice, retrieval method, and reranking
  are all critical design decisions — not afterthoughts.
- For agentic systems: tool definitions, loop limits, maximum iterations, and safety bounds
  are mandatory. An unbounded agent loop is a cost bomb and a safety risk.
- Latency budgets must account for LLM call time, which is inherently variable and often
  the dominant factor. Design around it, not in spite of it.
- Caching is your best friend. If the same prompt generates the same output, cache it.
  Every cached response is a token you didn't pay for and latency you didn't incur.
- Always have a fallback: what happens when the LLM API is down? When it returns garbage?
  When it's too slow? Deterministic fallback, cached safe response, graceful error message.
