---
name: auto-verify-mode
description: Shared protocol — bracket bulk read-only verification work in a marker pair so the gate hook auto-approves the curated safe ops without spamming permission prompts
type: reference
---

# Auto-Verify Mode

When a phase requires running many similar read-only verification queries in a row (per-model grain checks, fan-out before/after counts, null-rate scans, freshness checks, dbt show/ls/parse, package metadata, sample inspections), each one normally fires a permission prompt. The user clicks through twenty near-identical "allow" prompts and gradually loses the ability to spot the one prompt that matters.

This protocol bounds those stretches with a marker pair. While the block is open, the gate hook (`gate-hook.js`) auto-approves tool calls that match a hardcoded read-only allowlist. Everything outside the allowlist still prompts. Phase and checkpoint gates always win — when a real `::GATE::` is open, auto-verify is suspended.

This is **not** `--dangerously-skip-permissions`. The allowlist is hardcoded, the budget is bounded, the user can halt with one word, and every approval is logged.

## When to Enter

Enter auto-verify only when **both** of these are true:

1. The next stretch of work is exclusively read-only verification — running queries to check shapes, counts, nulls, fan-out, freshness, sample rows, or invoking read-only CLI subcommands (`dbt show`, `dbt ls`, `dbt parse`, `dbt compile`, `git status`, `git diff`).
2. You expect to issue **3 or more** similar tool calls in sequence. Below that threshold, the prompt friction isn't worth the cognitive overhead of opening a block.

Concrete fits:

| Situation | Why |
|---|---|
| Data Modeller post-build phase running grain + fan-out + null + sample on N models | Repeats N×4 queries; classic prompt-spam pattern |
| Analytics Engineer per-layer checkpoint validation | Identical sweep across staging → intermediate → mart |
| ML Engineer / Data Scientist Phase 6 verifying feature query joins | Tier 2/3 join verification per join |
| Data Modeller service-mode consultation running PK/null/fan-out/freshness on the requested tables | The most common "I just clicked allow on the same thing 8 times" path |
| Join path protocol Tier 2/3 verification (count-before / count-after at every join) | Repeated count comparisons |

## When NOT to Enter

Do not enter auto-verify when **any** of these is true:

- The work writes to disk (`Write`, `Edit`, `NotebookEdit`) — these are never auto-approved regardless of the block, and entering the block signals the wrong intent.
- The work mutates external state — `dbt run`, `dbt build`, `dbt seed`, `dbt snapshot`, INSERT/UPDATE/DELETE/MERGE, `git push`, `git commit`, package installs, deployments, API calls that mutate.
- The work involves a user-facing decision point (a phase gate, a checkpoint gate, a clarification question, a methodology choice).
- A handoff is in progress (Task call to another specialist). The other specialist runs in its own context — your auto-verify state doesn't follow.
- You're in a build phase. Builds are punctuated by `kind=checkpoint` gates, which suspend auto-verify anyway. Don't open auto-verify during a build phase — it won't help.
- The work is exploratory in nature (Data Modeller `[X] Explore` track) and the user is reading along. Auto-verify makes sense for *bulk* verification, not interactive exploration where each query is part of the conversation.

If you're unsure whether the next stretch fits, do not enter auto-verify. The default behavior (per-call prompts) is fine.

## Marker Syntax

Open with a single line at the top of the message that begins the verification stretch:

```
::AUTO-VERIFY:: agent=<your-name> phase=<N> tool_budget=<N> ttl_minutes=<N>
```

| Attribute | Required | Default | Bounds | Meaning |
|---|---|---|---|---|
| `agent` | yes | — | kebab-case agent name | For audit log |
| `phase` | yes | — | phase number | For audit log |
| `tool_budget` | no | 20 | 1–50 | Max auto-approvals before block auto-closes |
| `ttl_minutes` | no | 10 | 1–30 | Wall-clock expiry from open |

Both `tool_budget` and `ttl_minutes` are clamped to their max — requesting `tool_budget=999` gets you 50, not 999.

Close with a bare line at the end of the verification stretch:

```
::ENDAUTO::
```

Example:

```
::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=12 ttl_minutes=5

Running per-model validation for the customers / orders / order_items models.

[runs `dbt show --select customers --limit 5`]
[runs `psql -c "SELECT count(*), count(distinct customer_id) FROM stg.customers"`]
[runs `psql -c "SELECT count(*) FROM int.orders"`]
[runs `psql -c "SELECT count(*) FROM (int.orders JOIN stg.customers USING (customer_id))"`]
... (12 more queries) ...

::ENDAUTO::
```

## What Gets Auto-Approved

While the block is open, the hook auto-approves tool calls that match the hardcoded allowlist:

- **Always-safe tools**: `Read`, `Glob`, `Grep`, `WebSearch`
- **Read-only Bash prefixes**: `git status/log/diff/show/branch/rev-parse/remote -v/remote show`, `ls`, `cat`, `head`, `tail`, `wc`, `file`, `stat`, `pip list/show/freeze`, `npm ls/list/outdated/view`
- **Read-only dbt subcommands**: `dbt show`, `dbt ls`, `dbt list`, `dbt parse`, `dbt compile`, `dbt deps`, `dbt debug`, `dbt source freshness`
- **Read-only BigQuery CLI**: `bq show`, `bq ls`, `bq head`, `bq query --dry_run …`
- **SELECT-only warehouse-CLI SQL**: `bq query "SELECT …"`, `psql -c "SELECT …"`, `snowsql -q "SELECT …"`, `clickhouse-client --query "SELECT …"`, `duckdb -c "SELECT …"`, `mysql -e "SELECT …"`. The hook parses the SQL string, strips comments, splits on `;`, and approves only if every statement starts with `SELECT` or `WITH` and contains no DDL/DML keyword.

## What Never Gets Auto-Approved

These always fall through to the normal prompt, even inside auto-verify:

- `Write`, `Edit`, `NotebookEdit`
- `Bash(rm:*)`, `Bash(mv:*)`, `Bash(sudo …)`, anything with shell redirects (`>`, `>>`), pipe-to-shell, command substitution (`$(...)` or backticks)
- Compound commands joined with `&&`, `||`, `;`, `|` at the shell level (a single `dbt show` is fine; `dbt show && rm -rf` is not)
- `dbt run`, `dbt build`, `dbt seed`, `dbt snapshot` — even with `--select`, these write
- `git push`, `git commit`, `git merge`, `git rebase`
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `COPY` via warehouse CLI
- Anything matching the user's `permissions.deny[]` list (Claude Code enforces this; the hook cannot override it)
- MCP tools (auto-verify only matches built-in tools)

If a tool call falls outside the allowlist, the prompt fires normally — **do not interpret a single prompt as a signal to abandon the block**. Answer the prompt and continue. The block stays open.

## How the Block Closes

The block closes — and auto-approval ends — when any of these happens:

1. You emit `::ENDAUTO::` in a later message
2. The tool budget hits zero (every auto-approval decrements it)
3. The TTL elapses (wall-clock from open)
4. The user submits a prompt containing "stop", "halt", "pause", "cancel", "abort", "wait", "hold on", "no thanks", "nope", or "don't" — these halt immediately
5. A real `::GATE::` opens (auto-verify is *suspended* during gate, not closed; it resumes when the gate confirms — but in practice phase boundaries are where you `::ENDAUTO::` anyway)

After close, the next non-allowlisted tool call prompts as normal.

## Discipline

- **Open exactly when the bulk work starts.** Don't open at the top of the phase and let it run for the whole phase — the budget runs out, the TTL expires, and you've signaled to the user that you intend to do bulk read-only work when actually you're going to write code.
- **Close exactly when the bulk work ends.** A trailing `::ENDAUTO::` before any prose, decision, or write makes the boundary visible.
- **Don't re-open within the same message.** If you need a second block, finish the message, get user input, and open a new block in a later turn.
- **Don't use auto-verify to skip a checkpoint or phase gate.** Gates always win. If you find yourself wanting auto-verify to "make this gate go away," you are misusing it.

## What the User Sees

Auto-verify is visible to the user — every approval is logged to `.shards/auto/history.jsonl` with timestamp, agent, phase, tool, and command. The user can `tail` it to see exactly what got approved. The audit trail is non-negotiable; if a future change tries to remove it, that change is wrong.

## Composition with Other Protocols

- **Gate pattern** — gates always win. A `kind=phase` or `kind=checkpoint` gate suspends auto-verify; the gate's allow-list (Read/Glob/Grep) takes over until the gate confirms.
- **Validation protocol** — auto-verify does not satisfy validation evidence. The validation `## Evidence` table still requires real measured facts, recorded in `project-specs.md`, before the phase gate.
- **Incremental testing** — checkpoint gates fire *between* components in a build phase. Don't try to span a build phase with auto-verify; the checkpoint will suspend it anyway.
- **Join path protocol** — Tier 2/3 verification queries are exactly the use case auto-verify is for. Open the block, run the count-before / count-after queries, close the block, then write the join.

## Escape Hatch

`SHARDS_AUTO_VERIFY=0` disables the auto-verify branch entirely. Markers are still parsed (so they don't appear as raw text in transcripts) but no state is written and no tool calls are auto-approved. Use this if a downstream tool integration is misbehaving — not as a default. Without auto-verify, the prompt-spam problem returns.
