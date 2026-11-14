# 0003. Shards owns no storage

Status: Accepted (2026-11-14)

## Context

Shards has a built-in Knowledge Ledger (`.shards/knowledge/`), with retrieval, checkpoint and harvest protocols, a `/knowledge` command and a knowledge-map UI panel. The audit counted 89 files and about 870 lines of protocol tied to it. Decisions, tasks, knowledge and artifacts can already live in git, Atlassian (Jira and Confluence), Google Drive and Slides, or other MCP-connected tools.

## Decision

Agents work with **jobs** rather than storage: `record`, `tasks`, `knowledge`, `review`, `artifacts` and `presentation`. Each project maps these jobs to real tools in `shards.config.yaml`. The file is created automatically with git-only defaults and is the single source of truth. Plugin `userConfig` only pre-fills it.

## Consequences

- Shards does not store project knowledge itself, and the built-in Knowledge Ledger is removed.
- Teams choose where records go (git, Jira, Confluence, Drive, and so on) per project.
- A project without other tools still works, because git is the default.
- Agents need a mapping for each job before writing outputs, so a missing mapping must be reported rather than silently dropped.
- `shards.config.yaml` becomes the one file to review when storage changes.
