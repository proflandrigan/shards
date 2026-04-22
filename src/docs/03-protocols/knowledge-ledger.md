# Knowledge Ledger

Persistent workspace-wide memory at `.shards/knowledge/`. Survives across projects, installs, and uninstalls. Shards uses it to remember non-obvious facts about your data, your infrastructure, and patterns that work.

## Layout

```
.shards/knowledge/
├── INDEX.md              # one-line-per-entry index (scanned for keyword matches)
├── entities/             # data table quirks, column semantics, grain surprises
├── infrastructure/       # warehouse/API/system behaviors
├── patterns/             # reusable SQL/Python snippets
└── features/             # verified ML features (Data Scientist + ML Engineer)
```

## Entry format

Knowledge entries are markdown files with YAML frontmatter:

```yaml
---
title: teacher_activity grain surprise
domain: education
type: entity
confidence: high
contributed_by: data-analyst
date: 2025-09-12
tags: [teacher_activity, grain, daily]
---
The teacher_activity table has one row per teacher per day per activity_type
— NOT one row per teacher per day as the name suggests. Joins to teacher_day
will explode rows if you don't aggregate first.
```

Type values: `entity`, `infrastructure`, `pattern`, `feature`.

## Three protocols

Three shared protocols govern the Knowledge Ledger:

### 1. Retrieval

Before Phase 1, specialists scan `INDEX.md` for entries relevant to the current project. Matching entries are documented in `project-specs.md` as context. See `knowledge_retrieval.md`.

### 2. Checkpoint

Mid-phase, specialists re-check the ledger against new findings. If a new finding contradicts an existing entry, the specialist flags the contradiction and asks the user to reconcile. See `knowledge_checkpoint.md`.

### 3. Harvest

After Syn's final review, specialists extract candidate knowledge from the just-completed project. Candidates are presented to the user for confirmation before writing to the ledger. See `knowledge_harvest.md`.

## Browsing the ledger

Three ways:

1. **`/knowledge` slash command** — Syn's Knowledge mode. Seed, browse, and manage entries.
2. **UI Knowledge Map panel** — click the brain icon in the activity bar. Card view, graph view, filters, inline edit. See [Knowledge Map](../04-ui/knowledge-map.md).
3. **Plain files** — open the `.md` files directly in your editor.

## Preservation

`.shards/knowledge/` is explicitly preserved on uninstall. Re-installing does not overwrite it.

## See also

- [Knowledge Map panel](../04-ui/knowledge-map.md)
- Source: `src/agents/specific_instructions/shared/knowledge_harvest.md`
- Source: `src/agents/specific_instructions/shared/knowledge_retrieval.md`
- Source: `src/agents/specific_instructions/shared/knowledge_checkpoint.md`
