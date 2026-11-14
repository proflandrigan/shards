# 0005. Git is the source of truth, without taking over the user's branches

Status: Accepted (2026-11-14)

## Context

Gate outcomes and project outputs need a durable, reviewable record. Git already provides history and review. However, Shards must not switch branches, rewrite history or disturb a user's work in progress.

## Decision

- A gate confirmation stages and commits **only the project's output paths**, on the **current** branch, with `Shards-Gate:` trailers.
- The commit outcome is either `committed` or `commit_pending(reason)`. **The gate is confirmed in the runtime either way**, and a pending commit is retried.
- With `git.commit: false`, on a detached HEAD, or with no repository, the gate is recorded under `refs/shards/*` or git notes, or in `.shards/state`.
- Copies to Confluence, Jira and Drive go one way only.

## Consequences

- Gate history is visible in `git log` through the trailers, and it stays on the branch the user is working on.
- A commit failure does not block the workflow, but pending commits must be retried and monitored.
- Shards never changes branches or history, which protects in-progress user work.
- Projects without git still get a record, in a different place.
- Staging is limited to output paths, so unrelated changes in the working tree are not committed.
