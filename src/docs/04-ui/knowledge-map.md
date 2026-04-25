# Knowledge Map

Browser for the [Knowledge Ledger](../03-protocols/knowledge-ledger.md). Card and graph views over `.shards/knowledge/`.

## Opening

- Click the brain icon in the activity bar.
- Or command palette: "Open Knowledge Map".

## Views

### Card view

One card per ledger entry. Shows:

- Title.
- Type badge (entity / infrastructure / pattern / feature).
- Confidence indicator (high / medium / low).
- Tags.
- Contributed-by agent + date.

Click a card to open the raw markdown in the editor.

### Graph view

Entries are nodes; edges come from shared tags and cross-references. Tight clusters indicate domains of related knowledge.

- Drag nodes to rearrange.
- Click a node to open its card.
- Double-click a node to open the raw markdown.

## Filtering

Shared across both views:

- By **type**: entity / infrastructure / pattern / feature.
- By **confidence**: high / medium / low.
- By **tag** (multi-select).
- By **contributor** (which agent harvested it).
- Full-text search across title + body.

## Editing

- Click the pencil icon on a card → inline edit of frontmatter + body.
- Saves directly to the underlying `.md` file.
- `INDEX.md` is regenerated after any save.

## Adding entries

Two paths:

1. **From the UI**: "New Entry" button on the Knowledge Map toolbar. Opens a templated form.
2. **Via Syn**: `/knowledge` slash command → Syn's Knowledge mode. Syn can seed, browse, and manage entries conversationally.

## Frontmatter format

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
```

## How entries get harvested

After a specialist completes a project, the knowledge-harvest protocol runs: the specialist proposes candidate entries, the user confirms, and confirmed entries are written to the ledger. See [Knowledge Ledger](../03-protocols/knowledge-ledger.md).

## See also

- [Knowledge Ledger protocol](../03-protocols/knowledge-ledger.md)
- [Activity Bar](activity-bar.md)
