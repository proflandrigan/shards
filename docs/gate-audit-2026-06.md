# Gate mechanism audit — June 2026

Branch: `deep-phase-gate-audit`. Audit of the Shards gate enforcement system
(`tools/gate-hook*`, `.shards/gates/state.json`, UI gate rendering) prompted by
reports of (a) gates from one agent interfering with another when two agents run
at once, and (b) the gate confirmation appearing squished at the bottom-right of
the chat instead of as a pill in the chat flow.

## Findings

### Bug 1 — Cross-session gate interference / bypass (correctness, HIGH)

`tools/gate-hook/state.js` stores gate state as a **single global slot**
(`{ open, id, phase, kind, agent, opened_at, history }`) in
`.shards/gates/state.json`, shared by every Claude Code session running in the
same project directory (e.g. two UI chat tabs).

- `handlePreToolUse` (gate-hook.js) blocks on `s.open` with **no check of which
  session owns the gate**. Session B's tool call is blocked by session A's open
  gate.
- `handleUserPromptSubmit` closes whatever gate is open on **any** confirmation,
  so session B confirming closes session A's gate.
- `handleStop` overwrites the single slot, so session B opening a gate **silently
  discards** session A's still-open gate → A then proceeds **without
  confirmation** (a gate *bypass*, not just a nuisance).

**Fix:** key gate state by `session_id`. New v2 format
`{ version: 2, sessions: { <sessionId>: {open,...} }, history: [] }` with a
backward-compatible `read()` that upgrades legacy single-slot files in memory.
All three handlers operate on the current `payload.session_id`'s slot. History
stays shared/append-only.

### Bug 2 — Gate pill squishes the chat (UI layout, MEDIUM)

`#gate-pill` lives inside `#chat-input-area`, which is
`display:flex; flex-wrap:wrap; align-items:flex-end`. Unlike `#mode-indicator-row`
(`width:100%; order:-1`), the pill has **no full-width / order rule**, so it
becomes an inline flex item sharing the row with the textarea + Send/End buttons
→ squished to the bottom-right.

### Bug 3 — Two competing confirmation affordances (UX, MEDIUM)

When a gate opens, **both** render at once: the in-chat `.gate-actions` buttons
(injected into the agent message by `injectGateButtons`) **and** the bottom
`#gate-pill` (`renderGatePill`). Redundant and confusing.

**Resolution (Bugs 2+3):** remove the bottom `#gate-pill` entirely; keep the
in-chat `.gate-actions` affordance. The `gateState` plumbing (SSE channel,
`gateState` var, `/gate-state` endpoint) stays because `isGateMessage()` depends
on it to decide whether to inject the in-chat buttons.

## Plan

### Workstream A — Hook backend session-keying (correctness)

Files: `tools/gate-hook/state.js`, `tools/gate-hook.js`,
`tools/gate-hook/sweep.js`, `tools/shards-gates.js`, `src/ui/server.js`
(read side only), `test/gate-hook.test.js`.

1. `state.js`: v2 format + helpers `getGate(state, sessionId)`,
   `setGate(state, sessionId, gate)`, `clearGate(state, sessionId)`,
   `anyOpen(state)`. `read()` upgrades legacy single-slot in memory.
2. `gate-hook.js`: handlers scope to `payload.session_id`. PreToolUse blocks
   only when the *current session's* slot is open. UserPromptSubmit closes only
   the current session's gate.
3. `sweep.js`: per-session stale sweep (sweep only the current session's slot,
   or all expired slots; do not touch other live sessions).
4. `shards-gates.js`: `status`/`history` iterate sessions; `force-close` clears
   all session slots (operator override).
5. `server.js`: `readGateSnapshot`, `GET /gate-state`, `emitGateState` reduce the
   v2 `sessions` map to a single `{open,...}` (first/most-recent open gate) so the
   browser's single-gateState model keeps working. Handle legacy + v2.
6. Tests: update existing shape-based tests; add cross-session isolation tests
   (session A gate does not block session B; B confirm does not close A; B open
   does not discard A).

### Workstream B — Remove bottom gate pill (UI)

Files: `src/ui/js/chat.js`, `src/ui/js/state.js`, `src/ui/index.html`,
`src/ui/css/chat.css`.

1. Remove `#gate-pill` div from `index.html`.
2. Remove `renderGatePill` + `_gatePillDismissed`/`_lastGateId` from chat.js and
   the `#gate-pill`/`.gate-pill-*` CSS from chat.css.
3. In `state.js` `_onGateStateUpdate`, drop the `renderGatePill` call but KEEP
   `gateState` assignment (isGateMessage depends on it).
4. Leave the in-chat `.gate-actions` path untouched and working.

## Validation

- `npm test` green (updated + new cross-session tests).
- Manual: simulate two sessions writing state.json; verify isolation.
- `node tools/install.js` from repo root to refresh the live `.shards` install.
