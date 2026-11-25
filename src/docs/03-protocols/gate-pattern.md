# The Gate Pattern

The single most important idea in Shards: **documentation is the gate**. Every specialist writes its decision to `project-specs.md` and gets your confirmation before advancing to the next phase.

## Why

It is easy for an agent to rush ahead and produce code that was never aligned with what you wanted. A gate forces alignment at every step. You see the decision in writing before the work is done, and you can redirect cheaply.

## Gates are tool calls

In v2 a gate is a tool call, not text in a document (ADR 0008). Every phase ends the same way:

1. The specialist writes its decisions to the phase section of `project-specs.md`.
2. It reads the section back to you.
3. It calls `gate_request` (`id`, `kind`, `phase`, `summary`, `record_ref`, optional `validates` and `evidence`) and stops.
4. It waits. The agent has no tool that confirms its own gate. Only a human confirms.

`load_phase` refuses to serve phase N until the gate for phase N-1 is confirmed, so the chain holds on every host, including hosts without hooks. A gate belongs to the switched-in agent frame that opened it (see [Activation Modes](activation-modes.md)). Consult and fan-out workers never hold gates. A frame cannot `return` while it has a pending gate, unless the gate is suspended.

## Kinds

| Kind | Advances the phase | On confirm |
|---|---|---|
| `phase` | yes | commits the output directory |
| `final` | yes | commits |
| `execute` | yes | commits (an experiment or Autonomous Research iteration finished) |
| `handoff` | yes | commits (specialist-to-specialist transition) |
| `checkpoint` | no | no commit (mid-build component seam, see [Incremental Testing](incremental-testing.md)) |
| `confirm` | no | no commit (micro-confirmation) |

Unknown kinds are rejected. A gate that sets `validates=<agent>` makes the runtime check the `## Validation` section of the record before the gate opens (see [Validation](validation.md)).

## Who confirms: tiers

Confirmation needs proof that a human acted. There are three tiers, and the runtime uses whichever the host supports.

| Tier | How | Notes |
|---|---|---|
| 1 | `gate_request` elicits an Approve / Request changes form | Interactive Claude Code only. Otherwise the gate stays pending. |
| 2 | The agent calls `gate_advance` and you approve the host permission prompt | The PreToolUse hook must have forced an `ask` in a supervised permission mode. Off on Codex. |
| 3 | The agent calls `gate_confirm` with your reply | Your reply must be the first, whole, unused user message after the gate was requested. |

A refused confirmation leaves the gate pending. If you request changes, the agent revises and calls `gate_request` again with the same id.

## Policies

`gates.policy` in `shards.config.yaml` sets how much human confirmation is needed (see [Config](../08-bindings/config.md)):

- `strict`: a human confirms every gate, including checkpoint and confirm.
- `phase` (default): `phase`, `final`, `execute` and `handoff` need a human. `checkpoint` and `confirm` gates are recorded automatically when the agent passes `evidence: { status: "pass" }`. A fail, an anomaly or missing evidence leaves them pending.
- `plan`: you approve a plan approval gate (plan plus budget) once per run. After that every gate in that project is a notice until a failure, anomaly or budget limit puts a human back in the loop. A new run needs a fresh approval. Goal mode (unattended Autonomous Research and experiment loops) is this policy; there the agent's Phase 1 gate is the plan approval, and the Phase 3 adoption gate still waits for you.

## What a confirmed gate does

Confirming an advancing gate commits the agent's output directory to git (ADR 0005). Active fan-out slice paths are excluded. Checkpoint and confirm gates do not commit. If a commit cannot run, the record is kept and `shards doctor --fix` can replay it (see [Doctor](../05-commands/doctor.md)).

## Enforcement

- **PreToolUse hook** (Claude Code plugin hooks): while the top frame has a pending gate, write and exec calls from callers without a fan-out lease are denied. This includes subagents without a lease binding (ADR 0011). A worker holding a lease may write inside its slice. Reads are never blocked. Suspended gates do not block writes.
- **`fanout_start`** refuses while a gate is pending or suspended.
- **`return`, `final_review` and `sessions_end`**: `return` refuses on a pending gate. A suspended gate (`gate_suspend`, which needs the same human proof as a confirmation) lets the frame leave, but `final_review` and `sessions_end` refuse while any gate is suspended. `gates_open` lists open gates.
- The hook is a guardrail on Claude Code. Codex calls carry no `agent_id`, so every Codex caller is treated as unbound.
- `SHARDS_GATE_ENFORCE=0` turns off the hook's deny paths. Use it sparingly.

## Operator CLI

You run these out of band. No agent can.

```bash
shards gates status            # gates per session, plus auto-verify and pending commits
shards gates history           # status transitions per gate
shards gates checkpoints       # checkpoint/confirm gates and their evidence
shards gates violations        # refused confirmations and violations
shards gates confirm <gate-id> [--changes "<note>"]
shards gates force-close <gate-id> | --all [--reason "<text>"]
```

Without a global `shards` install (plugin users have no `cli/`), run the same commands as `npx @proflandrigan/shards@next gates ...` from the project directory; that is the form the runtime prints when a gate is waiting. From a repo checkout, `node cli/shards.js gates ...` also works.

`force-close` ends a stuck gate as `force_closed`. It is never counted as confirmed, and the agent can request a fresh gate afterwards. It also resets any open auto-verify block. The `gate_force_close` tool does the same for one gate but follows the tier 2 rule (you must approve the host prompt). See [CLI](../05-commands/cli.md).

## Exceptions

Two modes do not use the phase gate chain:

- **Syn Fixer mode** (`[F]`): a single confirm gate before the fix is applied, not the phase chain.
- **Explore mode** (Data Modeller `[X]`): pure exploration produces no files and no gates.

## Legacy

Earlier versions used `::GATE:: ... ::ENDGATE::` text fences and a transcript-parsing gate hook. Both are gone. `shards migrate` imports old gate history as confirmed entries (see [Migrate](../05-commands/migrate.md)).

## See also

- [Behavioral Rules](behavioral-rules.md)
- [Reviewer Verdicts](reviewer-verdicts.md)
- [Auto-Verify](auto-verify.md)
- Source: `core/protocols/behavioral_rules.md`, `docs/gates.md`
