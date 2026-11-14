---
name: auto-verify-mode
description: Shared protocol — bracket bulk read-only verification work in an auto_verify block so the runtime auto-approves the curated safe ops without spamming permission prompts
type: reference
---

# Auto-Verify Mode

When a phase requires running many similar read-only verification queries in a row (per-model grain checks, fan-out before/after counts, null-rate scans, freshness checks, dbt show/ls/parse, package metadata, sample inspections), each one normally fires a permission prompt. The user clicks through twenty near-identical "allow" prompts and gradually loses the ability to spot the one prompt that matters.

This protocol bounds those stretches with an auto-verify block. While the block is open, the runtime auto-approves tool calls that match a hardcoded read-only allowlist. Everything outside the allowlist still prompts. Gates always win: an open gate ends the block.

This is **not** `--dangerously-skip-permissions`. The allowlist is hardcoded, the budget and lifetime are bounded, and the user can halt at any time.

## When to Enter

Enter auto-verify only when **both** of these are true:

1. The next stretch of work is exclusively read-only verification — running queries to check shapes, counts, nulls, fan-out, freshness, sample rows, or invoking read-only CLI subcommands (`dbt show`, `dbt ls`, `dbt parse`, `dbt compile`, `git status`, `git diff`).
2. You expect to issue **3 or more** similar tool calls in sequence. Below that threshold, the prompt friction isn't worth opening a block.

Concrete fits:

| Situation | Why |
|---|---|
| Data Modeller post-build phase running grain + fan-out + null + sample on N models | Repeats N×4 queries; classic prompt-spam pattern |
| Analytics Engineer per-layer checkpoint validation | Identical sweep across staging → intermediate → mart |
| ML Engineer / Data Scientist verifying feature query joins | Tier 2/3 join verification per join |
| Data Modeller service-mode consultation running PK/null/fan-out/freshness on the requested tables | Often 4–12 SELECT calls in a row |
| Join path protocol Tier 2/3 verification (count-before / count-after at every join) | Repeated count comparisons |

## When NOT to Enter

Do not enter auto-verify when **any** of these is true:

- The work writes to disk (`Write`, `Edit`, `NotebookEdit`) — these are never auto-approved regardless of the block.
- The work mutates external state — `dbt run`, `dbt build`, `dbt seed`, `dbt snapshot`, INSERT/UPDATE/DELETE/MERGE, `git push`, `git commit`, package installs, deployments, mutating API calls.
- The work involves a user-facing decision point (a gate, a clarification question, a methodology choice).
- A handoff is in progress (a consultation of another specialist). The other agent runs in its own frame; your block does not follow.
- You are in a build phase. Builds are punctuated by `kind=checkpoint` gates, which end the block anyway.
- The work is exploratory and the user is reading along. Auto-verify is for *bulk* verification, not interactive exploration.

If you are unsure whether the next stretch fits, do not enter auto-verify. Per-call prompts are fine.

## Opening and closing a block

In a phase or mode file, write the macros; they render to runtime tool calls with the agent and phase filled in from context:

```
{{auto_verify start tool_budget=30 ttl=900}}
... bulk read-only verification ...
{{auto_verify end}}
```

These correspond to the runtime tools `auto_verify_start(agent, phase, tool_budget, ttl)` and `auto_verify_end()`. The `agent` must be the currently active agent; the block is scoped to the session.

| Parameter | Required | Bounds | Meaning |
|---|---|---|---|
| `agent` | yes | the active agent | Whose verification stretch this is |
| `phase` | yes | phase number | Which phase the block belongs to |
| `tool_budget` | yes | 1–200 | Max auto-approvals before the block ends |
| `ttl` (seconds) | yes | 30–3600 | Wall-clock lifetime from open |

Out-of-range values are rejected. Only one block can be active per session at a time; starting a second while one is live is refused, and starting one while a gate is open on the active frame is refused. Size the budget to the work: a handful of models needs tens of calls, not the maximum.

## What Gets Auto-Approved

On each tool call, the PreToolUse check consults the block's runtime state and, if the block is live, applies a hardcoded read-only allowlist (plus the SQL guard for warehouse CLIs). Each approval consumes one unit of budget; calls that are not approved do not.

- **Always-safe tools**: `Read`, `Glob`, `Grep`, `WebSearch`
- **Read-only Bash prefixes**: `git status/log/diff/show/branch/rev-parse/remote -v/remote show`, `ls`, `cat`, `head`, `tail`, `wc`, `file`, `stat`, `pip list/show/freeze`, `npm ls/list/outdated/view`
- **Read-only dbt subcommands**: `dbt show`, `dbt ls`, `dbt list`, `dbt parse`, `dbt compile`, `dbt deps`, `dbt debug`, `dbt source freshness`
- **Read-only BigQuery CLI**: `bq show`, `bq ls`, `bq head`, `bq query --dry_run …`
- **SELECT-only warehouse-CLI SQL**: `bq query`, `psql -c`, `snowsql -q`, `clickhouse-client --query`, `duckdb -c`, `mysql -e`. The SQL guard strips comments, splits on `;`, and approves only if every statement starts with `SELECT` or `WITH` and contains no DDL/DML keyword.

## What Never Gets Auto-Approved

These always fall through to the normal prompt, even inside a block:

- `Write`, `Edit`, `NotebookEdit`
- `Bash(rm:*)`, `Bash(mv:*)`, `sudo`, shell redirects (`>`, `>>`), pipe-to-shell, command substitution (`$(...)` or backticks)
- Compound commands joined with `&&`, `||`, `;`, `|` at the shell level
- `dbt run`, `dbt build`, `dbt seed`, `dbt snapshot` — even with `--select`
- `git push`, `git commit`, `git merge`, `git rebase`
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `COPY` via warehouse CLI
- Anything matching the user's `permissions.deny[]` list
- MCP tools (the allowlist matches built-in tools only)

If a call falls outside the allowlist, the prompt fires normally. **Do not read a single prompt as a signal to abandon the block.** Answer it and continue; the block stays open.

## How the Block Ends

The block ends, and auto-approval stops, when any of these happens:

1. You call `auto_verify_end` (the `{{auto_verify end}}` macro).
2. The tool budget is used up.
3. The TTL elapses.
4. A gate opens (pending or suspended) on the active frame. Gates always win, so the block does not carry across a gate; open a new one afterwards if needed.

After the block ends, the next non-allowlisted tool call prompts as normal.

## Discipline

- **Open exactly when the bulk work starts.** Don't open at the top of the phase and let it run: the budget runs out, the TTL expires, and you have signalled bulk read-only work when you are about to write code.
- **Close exactly when the bulk work ends**, before any prose, decision, or write, so the boundary is visible.
- **Don't re-open to extend a block that just ran out** without a fresh reason: ask whether the work still fits the protocol.
- **Don't use auto-verify to skip a checkpoint or phase gate.** If you want it to "make this gate go away," you are misusing it.

## Composition with Other Protocols

- **Gate pattern** — gates always win. A pending or suspended gate ends the block.
- **Validation protocol** — auto-verify does not satisfy validation evidence. The validation evidence still requires real measured facts, recorded before the phase gate.
- **Incremental testing** — checkpoint gates fire *between* components in a build phase. Don't span a build phase with auto-verify.
- **Join path protocol** — Tier 2/3 verification queries are exactly the use case. Open the block, run the count-before / count-after queries, close the block, then write the join.
