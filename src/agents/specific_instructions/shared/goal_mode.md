---
name: goal-mode-protocol
description: Shared protocol — opt-in /goal activation for gate-free autonomous loops (AR Phase 2 and Experiment Phase 2)
type: reference
---

# `/goal` Mode Protocol

`/goal <condition>` (Claude Code v2.1.139+) is a session-scoped, prompt-based
Stop hook. After every turn, a small fast model (Haiku by default) reads the
condition + the conversation transcript and decides yes/no. "No" feeds the
reason back as next-turn guidance; "yes" clears the goal and logs the
achievement.

This protocol governs how Shards specialists *propose* a `/goal` to drive their
**gate-free autonomous loops**:

- AR Phase 2 (per `shared/autonomous_research.md` Section B)
- Experiment Phase 2 (per each agent's `experiment.md`)

The agent never runs `/goal` itself — slash commands are user-typed. The agent
composes a sound condition, prints it as a copy-paste block at the pre-loop
gate, and the user decides whether to activate it.

Outside the two phases listed above, gates fire on every turn anyway, so
`/goal` would have no effect.

## Eligibility

Before proposing a goal, confirm all of:

1. **Mode.** AR Phase 2 or Experiment Phase 2. Not Phase 0/1/3 — those are gated.
2. **Versioning.** AR requires git/DVC for auto-revert (already enforced at Phase 0). `/goal` does not change this.
3. **Hooks enabled.** `/goal` is unavailable when `disableAllHooks` or `allowManagedHooksOnly` is set anywhere in settings. If the user reports the command is rejected, accept that and proceed — §E convergence and §G safety rails still terminate the loop.
4. **Claude Code version.** v2.1.139 or later. If the user's Code is older, skip the proposal silently.

If any condition fails, the loop runs exactly as designed without `/goal` —
this is a quality-of-life layer, not a hard dependency.

## Activation flow

The agent **cannot** issue `/goal` itself. The flow is:

1. At the pre-loop gate (AR Phase 1 or Experiment Phase 1), compose the goal
   condition from the Phase 0 parameters: primary/outcome metric, target,
   iteration/experiment budget, metric floor, cost ceiling.
2. Print the candidate condition in a copy-paste block **before** emitting
   the Phase 1 gate fence.
3. Tell the user the activation is optional — autonomy quality-of-life on top
   of the existing stop logic.
4. The user either pastes the `/goal …` command (autonomous mode) or skips
   (the existing in-loop convergence/stop logic alone drives the loop).
5. After the Phase 1 gate confirms, proceed to Phase 2 normally.

`/goal` clears itself when the condition holds — the agent's Phase 3 summary
turn is the natural "yes" boundary. If the user wants to abort early, they run
`/goal clear`. Steering Notes "STOP" (AR §B.1) still works regardless.

## Writing a sound condition

The evaluator has **no tools** — it only reads the conversation transcript. A
condition that depends on a file the agent never echoes will never resolve.
Three rules:

1. **Anchor every clause to evidence surfaced inline.** Phrase clauses as
   "the most recent inline iteration summary shows …", not "the file
   contains …". The transcript-discipline echoes (see below) are the substrate.
2. **Always include a turn bound as a backstop.** `Or stop after <budget+5>
   turns` prevents a malformed condition from looping forever.
3. **Keep it under 4,000 characters.** Concise conditions evaluate faster
   and more reliably.

### Template — AR (autonomous research)

```text
/goal The AR loop is complete when ANY of the following is true:
  (a) the most recent inline iteration summary shows <primary_metric_name>
      has <crossed target value X in the maximize direction |
      dropped below target value X in the minimize direction>;
  (b) the most recent iteration summary or status line contains
      "Convergence detected" with reason in {plateau, diminishing-returns,
      budget-exhausted, cost-ceiling, consecutive-failures,
      metric-floor-breach, user-interrupt, reviewer-pause,
      scope-violation, error-limit, timeout-limit};
  (c) the agent has begun writing the Phase 3 research summary (look for
      "Phase 3" or "research_summary.md").
Or stop after <budget+5> turns.
```

### Template — Experiment

```text
/goal The experiment run is complete when ANY of the following is true:
  (a) the most recent inline experiment summary shows <outcome_metric>
      has <reached or exceeded <success_threshold> if the metric is being
       maximized | dropped to or below <success_threshold> if the metric is
       being minimized>;
  (b) the agent has printed "Experiment <N> complete" with N == <planned_count>;
  (c) the agent has begun writing the Phase 3 summary (look for
      "experiment_summary.md" or "Phase 3").
Or stop after <planned_count+3> turns.
```

If no success threshold was set, drop clause (a) and rely on (b) and (c).

## Transcript discipline (required when `/goal` is active)

The evaluator only reads the conversation. Each iteration the agent already
announces and writes a per-iteration file. With `/goal` active, the agent
**must** also print an inline iteration summary in the same assistant turn
that closes the iteration. The required shape:

For AR iterations:

```text
[AR] Iteration N complete.
  Primary metric: <metric_name> <before> → <after> (delta: <+/->)
  Auto-decision: <GREEN | RED | YELLOW> — <one-sentence reason>
  Action: <Kept | Reverted | Kept with next-steps>
```

For Experiment iterations:

```text
Experiment N complete.
  Outcome metric: <metric_name> <before> → <after> (<+/->)
  Outcome: <Improvement | Regression | Neutral>
  Recommendation: <Adopt | Revert | Refine>
```

When a §E stop condition fires (AR) or a Phase 2 stop condition fires
(Experiment), additionally print on the same turn:

```text
Convergence detected: <reason>
```

These echoes are on top of `results.json` and the per-iteration markdown, not
instead of them. Files remain the system of record; the inline copy makes the
run readable in the transcript and lets the goal evaluator decide.

## Interaction with the gate hook

`/goal` and Shards' gate hook (`.shards/hooks/gate-hook.js`) both register on
Stop. Behavior:

- **Gates always win.** When a `::GATE::` fence is open (`kind=phase`,
  `kind=execute`, `kind=final`, or `kind=checkpoint`), the gate hook blocks
  the next turn. The `/goal` evaluator does not bypass that.
- **Phase 2 is gate-free.** That's where `/goal` does real work — turn-by-turn
  evaluation without per-iteration prompts.
- **`/goal` does not suppress the Phase 3 gate.** When the loop exits and
  Phase 3 starts, the gate fires, the user is asked the standard
  "what do you want to adopt" question, and `/goal` clears on the summary turn.

If the gate hook and `/goal` evaluator misbehave together in practice, the
escape hatch is `/goal clear` — the loop still has its own convergence and
stop logic.

## Failure modes to avoid

- **File-only conditions.** "`results.json` shows `status=complete`" will
  never fire — the evaluator can't read files. Anchor to inline transcript
  phrases.
- **Unbounded conditions.** A condition without "or stop after N turns" can
  loop until the user intervenes. Always include the bound.
- **Goal bound tighter than §E.** If the goal says "stop at 20" but the
  iteration budget is 100, `/goal` stops the run before §E does — and you
  may miss real signal. Set the goal bound to `budget + small buffer`, so
  §E does the real stopping and the goal bound is just a backstop.
- **Setting `/goal` outside Phase 2.** The proposal happens at the Phase 1
  gate. Setting it during Phase 0 means the evaluator runs during setup
  turns and may stop the session before the loop starts.
- **Forgetting transcript discipline.** Writing the iteration to file but
  not echoing inline means the evaluator never sees the metric move, so the
  goal never resolves except by hitting the turn bound.

## Escape hatch

If `/goal` is unavailable for any reason, the existing stop logic still
terminates the loop:

- AR: `autonomous_research.md` §E (convergence) and §G (safety rails)
- Experiment: each `experiment.md` Phase 2 stop conditions

`/goal` is an autonomy quality-of-life layer on top of those — it removes
the per-turn prompts, not the underlying stop logic.
