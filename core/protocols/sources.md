---
name: sources-protocol
description: Shared protocol for consulting and updating the knowledge sources bound to the knowledge job — all specialists
type: reference
---

# Sources Protocol

Prior knowledge (data quirks, patterns, infrastructure behavior) lives in whatever source the `knowledge` job is bound to in `shards.config.yaml` (default git binding: `docs/` and the git log). Shards keeps no store of its own. Everything retrieved is a **hint to verify**, never a fact to rely on.

**Scope:** Build mode (Phase 0 through final) and Autonomous Research (`[AR]`) setup. Skip in Review, Advise, Service, Explain, Experiment, Prompt Lab, and Notebook Walkthrough modes. Syn handoff sessions still run it.

## 1. Before Phase 1 (non-blocking)

After Phase 0 is confirmed, extract 3-5 domain keywords from the Phase 0 answers (business area, entities, systems, technique). For `[AR]` also add the primary metric, the dataset or domain, and the approach family (gradient boosting, transformer, prompt chain, ...), because prior runs may have found saturation points, leaky features or dead ends.

Run one search per keyword set. {{knowledge.search query="<keywords>"}}

Read the results that look relevant and discard coincidental matches. Treat anything older than about six months as possibly stale. If no knowledge source is reachable, record that and proceed.

## 2. Cite what was used

Append to the Phase 0 section of `project-specs.md` and read it back with the Phase 0 confirmation (or as an addendum):

```markdown
### Sources
- **Checked:** <sources and queries>
- **Relevant:** <item> - <one-line relevance>
- **Or:** none found / no knowledge source reachable
```

## 3. Re-check mid-phase

Before building anything that touches specific tables, joins, grain or infrastructure claims, search again for those names. If a source contradicts what you observe in the data or system, say so to the user plainly, with both claims. Do not silently pick one. Note the contradiction in `project-specs.md` so the write-back step can propose a correction.

## 4. Propose write-backs at close

Before marking the project complete, list candidate reusable facts: a data quirk (types, nullability, grain surprise), a pattern that solved a non-obvious problem, an infrastructure behavior, or a validation finding worth remembering. Include corrections from step 3. For each give a title, 2-4 domain keywords, confidence (high, medium, low) and 3-10 specific lines naming tables, columns and systems.

Present the list to the user. Write nothing until a gate or explicit user confirmation. Then write each confirmed item through the knowledge job's write verb (the bound tool; for the git default, a `docs/knowledge/<slug>.md` file). Rules:

- Summaries only. Never raw query results, data samples or file dumps.
- Where the binding supports it, tag each write with the idempotent marker `[shards-gate:<id>]` so a retry does not duplicate it.
- If no write verb is bound or reachable, say so and leave the candidates in `project-specs.md`.
- For Autonomous Research fan-out, only the parent specialist proposes write-backs after promotion, using the winning branch plus cross-branch patterns.

Minimum is an explicit assessment: one or more candidates, or "none - trivial project".
