# Auto-Verify Mode

A scope-bounded auto-approval for the bulk read-only verification work that specialists do at predictable points in their phases. A specialist brackets a stretch of safe, repetitive tool calls in an auto-verify block. While the block is open, the runtime auto-approves calls that match a hardcoded read-only allowlist. Gates, deny rules and your ability to halt are unchanged.

Used by the Data Modeller, Analytics Engineer, Data Engineer, Data Analyst and Data Scientist in their bulk-validation phases, and by the join-path protocol.

## The problem it solves

Specialists run the same shape of read-only query over and over during validation: per-model grain checks, join fan-out counts before and after, null checks, sample inspections, freshness checks, and read-only dbt subcommands. Each one fires its own permission prompt. A sweep across five models can issue 15 to 25 near-identical prompts. You either click "always allow" and lose the ability to spot the one that matters, or you tire and disengage.

## Opening and closing a block

In phase and mode files the agent writes macros, which render to runtime tool calls:

```
{{auto_verify start tool_budget=30 ttl=900}}
... bulk read-only verification ...
{{auto_verify end}}
```

These are the tools `auto_verify_start(agent, phase, tool_budget, ttl_s)` and `auto_verify_end()`. The macro's `ttl` is passed as the tool's `ttl_s`.

| Parameter | Bounds |
|---|---|
| `agent` | must be the active agent |
| `phase` | phase number |
| `tool_budget` | 1 to 200 auto-approvals |
| `ttl_s` (seconds; `ttl` in the macro) | 30 to 3600 |

Out-of-range values are rejected. Only one block can be live per session. Starting a block while a gate is open on the active frame is refused.

## What gets auto-approved

| Category | Examples |
|---|---|
| Always-safe tools | `Read`, `Glob`, `Grep`, `WebSearch` |
| Read-only Bash | `git status/log/diff/show/rev-parse` and read-only `git branch`/`tag`/`remote` forms, `ls`, `cat`, `head`, `tail`, `wc`, `file`, `stat`, `pip list/show/freeze`, `npm ls/list/outdated/view` |
| Read-only dbt | `dbt show`, `dbt debug` (subcommands that parse the project write `target/`, so `ls`, `list`, `parse`, `compile`, `deps` and `source freshness` still prompt) |
| Read-only BigQuery | `bq show`, `bq ls`, `bq head`, `bq query --dry_run` |
| SELECT-only warehouse SQL | `bq query`, `psql -c`, `snowsql -q`, `clickhouse-client --query`, `duckdb -c`, `mysql -e` |

The SQL guard strips comments, splits on `;`, and approves only if every statement starts with `SELECT` or `WITH` and contains no DDL or DML keyword. The allowlist is hardcoded and not configurable.

## What never gets auto-approved

`Write`, `Edit`, `NotebookEdit`. `dbt run`, `build`, `seed` and `snapshot`, even with `--select`. `git push`, `commit`, `merge` and `rebase`. `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE` and `COPY` via a warehouse CLI. Compound shell commands, redirects, command substitution and pipe-to-shell. MCP tools. Anything on your `permissions.deny` list.

A call outside the allowlist prompts normally. The block stays open, since one prompt is not a signal to abandon it, and calls that are not approved do not use budget.

## How a block ends

1. The agent calls `auto_verify_end`.
2. The tool budget is used up.
3. The TTL elapses.
4. A gate opens (pending or suspended) on the active frame. Gates always win, and the block does not resume afterwards.
5. You run `shards gates force-close`, which also resets an open block.

## When to use it

Enter a block only when the next stretch is exclusively read-only verification and you expect 3 or more similar calls in a row. Do not use it in build phases (checkpoint gates end blocks anyway), around writes or external mutations, around decision points, or to make a gate go away. Open it when the bulk work starts and close it before any prose, decision or write.

## How it works

The PreToolUse hook consults the block's session state (`auto-verify.json`), checks the call against the allowlist, and returns an `allow` decision for matching calls while the block is live. `shards gates status` shows an active block and its budget use. Like all hook behaviour it is a Claude Code guardrail. Auto-verify does not replace validation evidence, which still needs real measured results before the phase gate (see [Validation](validation.md)).

## What this is not

- Not `--dangerously-skip-permissions`: the allowlist is hardcoded, the budget and lifetime are bounded, and you can halt at any time.
- Not a replacement for gates. Gates always win.
- Not Claude Code's native auto mode. Auto-verify is hook-driven and works alongside your chosen permission mode.

## See also

- [Gate Pattern](gate-pattern.md)
- [Join-Path Protocol](join-path.md)
- Source: `core/protocols/auto_verify_mode.md`, `runtime/auto-verify/`, `runtime/lib/auto-allowlist.js`
