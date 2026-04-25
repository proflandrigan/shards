# The Gate Pattern

The single most important idea in Shards: **documentation is the gate**. Every specialist must write its decision to `project-specs.md` and get your confirmation before advancing to the next phase.

## Why

It's easy for an agent to rush ahead and produce code that was never aligned with what you actually wanted. The gate pattern forces alignment at every step — you see the decision in writing *before* the work is done, and you can redirect cheaply.

## How it works

Every phase ends with the same three-step sequence:

1. The specialist writes its decisions to the phase section of `project-specs.md`, wrapped in a `::GATE:: ... ::ENDGATE::` fence.
2. The specialist reads the section back to you.
3. The specialist waits for your confirmation before continuing.

Gates are **machine-enforced** by three Claude Code hooks installed at `.shards/hooks/gate-hook.js`:

| Hook | Trigger | Effect |
|---|---|---|
| `Stop` | When the model stops generating | Checks for open gate fences; blocks closure until gate is resolved. |
| `PreToolUse` | Before any tool call | Rejects tool calls that would bypass the current gate. |
| `UserPromptSubmit` | When you submit a new prompt | Validates gate state transitions. |

State is tracked in `.shards/gates/state.json`.

## Gate fence syntax

Inside `project-specs.md`:

```
## Phase 3: Analysis Methodology

::GATE::
**Method:** Propensity score matching.
**Reason:** Observational data, need to control for confounders.
**Reviewer verdict (Researcher):** SOUND.
::ENDGATE::
```

Everything between the fences is the gate decision. The hooks parse these fences, identify which are open (no confirmation yet) vs. closed (confirmed), and enforce the flow.

## Diagnostics

```bash
shards-gates status       # show current gate state
shards-gates force-close  # unstick a session if enforcement is wedged
```

## Opting out

Set `SHARDS_GATE_ENFORCE=0` in the environment to disable enforcement entirely. Use sparingly — the gate pattern is what keeps projects honest.

## Exceptions

Two modes suspend the gate pattern:

- **Syn Fixer mode** (`[F]`) — direct fixes don't need phased gates.
- **Explore mode** (Data Modeller `[X]`) — pure exploration produces no files, no gates.

## See also

- [Behavioral Rules](behavioral-rules.md)
- [Reviewer Verdicts](reviewer-verdicts.md)
- Source: `src/agents/specific_instructions/shared/behavioral_rules.md`
