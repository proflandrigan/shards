# Auto-Verify Mode

A scope-bounded auto-approval mechanism for the bulk read-only verification work that specialists do at predictable points in their phases. Brackets a stretch of safe, repetitive tool calls inside a marker pair so the gate hook auto-approves them — without weakening gates, deny rules, or the user's ability to halt.

Referenced by Data Modeller, Analytics Engineer, Data Engineer, Data Analyst, ML Engineer (consultation side), Data Scientist (consultation side), and the join-path protocol.

## The problem it solves

Specialists run the same shape of read-only query over and over during validation:

- Per-model grain checks (`count(*) vs count(distinct pk)`)
- Join fan-out (count before / count after) at every join
- PK/FK null checks per column
- Sample inspections (`dbt show --select <model> --limit 5`)
- Freshness checks per upstream table
- Read-only dbt subcommands (`dbt show`, `dbt ls`, `dbt parse`, `dbt compile`)

Each one fires its own permission prompt. A typical Data Modeller post-build sweep across five models with joins issues 15–25 prompts, all near-identical SELECTs. Users click "always allow" on the first one and lose the ability to spot the one prompt that actually matters; or they get tired of clicking and disengage.

Auto-verify gives specialists a way to bracket those stretches with a marker pair. While the block is open, the gate hook auto-approves tool calls that match a hardcoded read-only allowlist. Everything outside the allowlist still prompts. Phase and checkpoint gates always win.

## The marker pair

Open at the start of the verification stretch:

```
::AUTO-VERIFY:: agent=<your-name> phase=<N> tool_budget=<N> ttl_minutes=<N>
```

Close at the end:

```
::ENDAUTO::
```

`agent` and `phase` are required (used in the audit log). `tool_budget` defaults to 20 and is clamped to 50; `ttl_minutes` defaults to 10 and is clamped to 30. Both bound how much can happen inside one block.

## What gets auto-approved

| Category | Examples |
|---|---|
| Always-safe tools | `Read`, `Glob`, `Grep`, `WebSearch` |
| Read-only Bash prefixes | `git status`, `git log`, `git diff`, `ls`, `cat`, `head`, `tail`, `wc`, `pip list`, `npm ls` |
| Read-only dbt subcommands | `dbt show`, `dbt ls`, `dbt list`, `dbt parse`, `dbt compile`, `dbt deps`, `dbt debug`, `dbt source freshness` |
| Read-only BigQuery CLI | `bq show`, `bq ls`, `bq head`, `bq query --dry_run` |
| SELECT-only warehouse-CLI SQL | `bq query "SELECT …"`, `psql -c "SELECT …"`, `snowsql -q "SELECT …"`, `clickhouse-client --query "SELECT …"`, `duckdb -c "SELECT …"`, `mysql -e "SELECT …"` |

The SQL guard parses the SQL string, strips comments, splits on `;`, and approves only if every statement starts with `SELECT` or `WITH` and contains no DDL/DML keyword (INSERT, UPDATE, DELETE, MERGE, CREATE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, COPY, etc.). Comment-smuggled DDL is rejected.

## What never gets auto-approved

`Write`, `Edit`, `NotebookEdit`. `dbt run`, `dbt build`, `dbt seed`, `dbt snapshot` (writes — even with `--select`). `git push`, `git commit`. `INSERT`/`UPDATE`/`DELETE`/`MERGE` via warehouse CLI. Compound shell commands joined with `&&`/`||`/`;`/`|`. Commands with shell redirects (`>`, `>>`), command substitution (`$(...)`, backticks), or pipe-to-shell (`| sh`). MCP tools. Anything matching the user's `permissions.deny[]` list (Claude Code enforces that ahead of the hook).

If a tool call falls outside the allowlist, the prompt fires normally. The block stays open — a single prompt is not a signal to abandon it.

## How a block closes

1. The agent emits `::ENDAUTO::` in a later message
2. The tool budget hits zero (every auto-approval decrements it)
3. The TTL elapses
4. The user submits a prompt containing "stop", "halt", "pause", "cancel", "abort", "wait", "hold on", "no thanks", "nope", or "don't"
5. A real `::GATE::` opens — gates always win and suspend auto-verify

## How it composes with gates

Gates are unaffected by auto-verify. When a `kind=phase` or `kind=checkpoint` gate is open, the gate's allowlist (`Read`/`Glob`/`Grep`) takes over. Auto-verify state may still exist but it is suspended — no auto-approvals fire while a gate is open. After the gate closes, auto-verify resumes if its own budget/TTL haven't been exhausted (in practice, agents tend to `::ENDAUTO::` before emitting a phase gate).

## Audit trail

Every auto-approval is logged to `.shards/auto/history.jsonl` with timestamp, agent, phase, tool, command, and remaining budget. `tail -f` it during a session to see exactly what's being approved. The log is append-only and never auto-rotated by shards.

## Escape hatch

`SHARDS_AUTO_VERIFY=0` disables the auto-verify branch entirely. Markers are still parsed (so they don't appear as raw text) but no state is written and no tool calls are auto-approved.

`SHARDS_GATE_ENFORCE=0` continues to disable all gate enforcement, which also disables auto-verify (auto-verify lives inside the same hook).

## What this is not

- Not `--dangerously-skip-permissions`. The allowlist is hardcoded; the budget is bounded; the user can halt with one word.
- Not a replacement for the gate pattern. Gates always win.
- Not Claude Code's native `auto` mode (which is a separate Anthropic-side feature with its own gating and falls back to manual after classifier blocks). Auto-verify is hook-driven and works orthogonally to the user's selected permission mode.
