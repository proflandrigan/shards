# Bug Hunt Report: PR #69 — Syn Free Form, Decompose-and-Swarm, Real Context HUD

## Summary
- Scope reviewed: all 12 files changed on `feature/free-form-mode` vs `main` — JS changes to
  `src/ui/chat-session.js`, `src/ui/server.js`, `src/ui/js/{chat,events,hud,state,init}.js` (context-usage
  feature + Plain Chat card removal), and the new/edited orchestration docs
  `src/agents/syn.md`, `src/agents/specific_instructions/{shared/swarm_protocol.md, syn/free_form.md,
  syn/pm.md}`, `src/docs/03-protocols/swarm.md`, `src/docs/manifest.json`.
- Confirmed findings: 1 High, 1 Medium, 1 Low, 1 Info.
- Overall assessment: The JS feature-path for context usage is sound — event tracing from the CLI
  `message_start` stream through `chat-session.js` → `server.js` → SSE → `events.js` → `hud.js`
  is unbroken, the usage arithmetic matches the documented Anthropic semantics (a suspected
  cache-token double count was **refuted**), and the Plain Chat removal leaves no dangling
  references. The real problems sit in the new orchestration docs (a swarm-slice template that can
  wedge sessions on gate fences, and a skill-spawn instruction the agent isn't granted the tool to
  perform) plus two self-contained UI logic defects in the new HUD. All confirmed findings were
  fixed; `npm test` (349 tests) still passes and `node --check` is clean on every edited file.

## Findings

### High — SWARM SLICE template omits gate-fence suppression; swamp slices can block the parent session
- **Location:** `src/agents/specific_instructions/shared/swarm_protocol.md:68`
- **Class:** Control-flow / instruction-level contract violation with the gate hook
- **Confidence:** Confirmed
- **Description:** The SWARM SLICE spawn template told spawned specialist subagents only
  "Work autonomously. Do not wait for user gates." Specialist phase files (e.g.
  `src/agents/specific_instructions/data_scientist/phases/phase-1.md:37-38`) mandate emitting a
  `::GATE:: ... ::ENDGATE::` fence and *stopping to wait for user confirmation*. The pre-existing
  PM MODE template (`src/agents/specific_instructions/syn/pm.md:211-217`) carries the two
  load-bearing mitigations the SWARM SLICE template was missing: "Skip your activation menu and
  Phase 0" and "Execute all phases without waiting for user confirmation at gates. When you would
  normally gate, document your decision in project-specs.md and continue." Without them, a
  specialist slice follows its phase file, emits the fence, and stops — whereupon the Stop hook
  (`tools/gate-hook.js`, `::GATE::` matching) opens a gate for the *parent* session, and the
  parent's next tool call is denied with `::GATE-BLOCK::` (PreToolUse, `permissionDecision: 'deny'`)
  until the user confirms a gate they never saw. This is exactly why the fix was applied:
  the fence never being emitted is the only reliable prevention.
- **Evidence / Reproduction:** The gate hook has no subagent exemption (no `subagent` branch in
  `tools/gate-hook/*`, session-scoped `state.js`); a Task subagent shares Syn's session, so its
  fence opens a visible-to-nobody gate. Trace: slice emits `::GATE:: id=<x>` (per its phase file) →
  Stop hook records gate open at session level → parent's next PreToolUse returns
  `::GATE-BLOCK:: Gate '<x>' (phase N, kind phase) is still open.` → user must confirm an invisible
  gate or the session is wedged.
- **Impact:** The new decompose-and-swarm default (the headline feature of the PR) can stall on the
  first slice that reaches a phase gate, blocking the session or forcing the user to confirm gates
  they never saw.
- **Remediation:** Added to the SWARM SLICE template: skip activation menu + Phase 0; when a phase
  file would stop and emit a `::GATE::` fence, do NOT stop and do NOT emit the fence — document the
  decision for the merge step and continue. The PM path (`pm.md` 1b) was already safe because it
  reuses the PM MODE template; the standalone template now matches it.

### Medium — Free Form instructs Syn to invoke the `Skill` tool, but Syn is not granted it
- **Location:** `src/agents/specific_instructions/syn/free_form.md:52-53` and `free_form.md:86-87`
  vs `src/agents/syn.md:14`
- **Class:** API / contract misuse (agent tool grant missing)
- **Confidence:** Confirmed
- **Description:** Free Form mode two places instructs Syn to load locally-installed skills "via the
  Skill tool" ("These load through the Skill tool, not Task"). Syn's YAML frontmatter
  (`src/agents/syn.md:14`) grants only
  `Read, Write, Edit, Glob, Grep, Bash, NotebookEdit, Task, WebSearch, WebFetch` — `Skill` is absent,
  and no other agent in `src/agents/` grants it. The feature's skill-delegation surface is therefore
  uninvokable as documented.
- **Evidence / Reproduction:** `grep -rn "Skill" src/agents/*.md` → no `tools:` entry grants it;
  `free_form.md` is the only file in `src/agents/` that references the Skill tool. Under the agent
  frontmatter contract, an ungranted tool is not callable.
- **Impact:** The "Enumerate what is summonable" step promises a skills readout and "Skills … are
  invoked via the Skill tool" — neither can be performed, silently degrading the advertised Free
  Form capability.
- **Remediation:** `syn.md:14` → `tools: Read, Write, Edit, Glob, Grep, Bash, NotebookEdit, Task,
  WebSearch, WebFetch, Skill`. Additive grant, no other consumer affected (the UI `AGENTS` map in
  `src/ui/js/agents.js` does not read `tools:`).

### Low — HUD context %: `'M tok'` label branch is unreachable and display flips at 99.5%
- **Location:** `src/ui/js/hud.js:51-58`
- **Class:** Logic / dead code (unreachable branch)
- **Confidence:** Confirmed
- **Description:** `pct = Math.min(100, Math.round((totalInput / 200000) * 100))` caps at 100, so
  any `totalInput ≥ 199,500` renders `'100%'`. The `'M tok'` branch (`totalInput ≥ 1,000,000`) can
  never be selected — by the time tokens reach 1M the meter is long past "full" — and the `'k tok'`
  branch silently disappears above ~199.5k, so the meter jumps from `'199k tok'` to `'100%'`.
  The displayed value is inconsistent with the color coders and the tooltip's "Context: ~N% of the
  model window used" framing.
- **Evidence / Reproduction:** For `totalInput ∈ {0, 50k, 150k, 199k, 200k, 250k, 1M, 1.5M}` the
  old logic rendered `0%, 50k tok, 150k tok, 100%, 100%, 100%, 100%, 100%` — the `1.5M tok` label
  was impossible; `100%`/`1M tok` never displayed. New logic renders the plain percentage for every
  input (0%, 25%, 75%, 100%, 100%, 100%, 100%, 100%).
- **Impact:** Cosmetic but misleading — a user at 95% real fill sees a token count instead of the
  reported metric, and the dead branch indicates the label/cap interaction was misdesigned, not
  intended.
- **Remediation:** Removed the `ctxLabel`/`'M tok'`/`'k tok'` branches; `ctxEl.textContent = pct + '%'`
  always. Token breakdown remains in the tooltip (`Input: N + cache-read N + cache-create N tokens`),
  consistent with the displayed `~pct%`.

### Info — `contextUsage` is persisted server-side but never restored to the browser on reload
- **Location:** `src/ui/server.js:207-210` (persist), `:2554-2558` (`/chat/status` payload),
  `src/ui/js/init.js:263-271` (restore loop)
- **Class:** State & consistency (dead persistence / stale UI)
- **Confidence:** Confirmed
- **Description:** The server writes `store.contextUsage` to the session JSON and reloads it into
  the store, but `/chat/status` did not include it and the client restore loop never applied it —
  so after a page reload the HUD showed "—" ("waiting for the first turn") until the next
  `message_start`, and the persisted field was never served to anyone. Noted in the PR body as a
  known follow-up.
- **Evidence / Reproduction:** Grep all REST payloads — `/chat/status`, `/sessions`,
  `/sessions/index`, `/transcript` — none return `contextUsage`; `createSessionState` defaults it to
  `null`. Reload a live session's page: HUD shows "—" despite stored usage data.
- **Impact:** Cosmetic; self-corrects on the next turn. Low user impact but made the server-side
  persistence dead weight.
- **Remediation:** Added `contextUsage: store.contextUsage` to the `/chat/status` session payload
  and `sess.contextUsage = s.contextUsage || null;` to the `loadInitial()` restore loop, so a
  reloaded page renders the last-known usage immediately.

## Notes & unverified leads
Leads that looked suspicious but could NOT be confirmed against real CLI output — none reported as
findings:

- **Cache-token double count (REFUTED).** The lead `totalInput = inputTokens + cacheReadTokens +
  cacheCreationTokens` double-counts was checked against the Anthropic Messages API spec: "Total
  input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and
  `cache_read_input_tokens`" (with a worked example `cache_creation=2051, cache_read=2051,
  input_tokens=2095`). The HUD sum is therefore **correct**. Residual risk: if a particular CLI
  version reports `input_tokens` inclusive of cache tokens, the meter would over-report — requires a
  real CLI trace to confirm or refute.
- **`message_start` without `usage` for thinking/extended-thinking requests.** Anthropic streaming
  examples show `message_start` without a `usage` field for thinking sessions. If the CLI mirrors
  that, the HUD would silently never render (fails safe, no crash). Unverified without
  instrumentation.
- **Under-reporting within multi-request turns.** The meter captures the first `message_start`
  per turn; a tool-heavy turn makes several API requests whose later context growth
  (`message_delta.usage` is cumulative, per docs) is not captured until the next turn's
  `message_start`. Whether the CLI emits `message_start` per request or per turn decides severity.
- **Startup race dropping early events.** SSE connects before `/chat/status` restore completes, so
  an early `chat-usage` can be dropped (`events.js:107-109`). Pre-existing pattern shared by all
  chat events; self-heals next turn.

## Coverage & limitations
- Covered: full event-path trace of `chat-usage` (CLI → transcript parser → server → SSE → browser →
  HUD), persistence/restore semantics, HUD arithmetic and display edge cases, Plain Chat removal
  fallout, menu-token collisions for `[FF]`, install-path correctness for all new files, the full
  `workstreams.json` `slices` schema extension, cross-file references in the three new/changed
  protocol docs, gate-hook interactions with swarm spawns, the Anthropic usage-field semantics.
- Not covered: no live Claude Code CLI run (no real stream-json trace, so the thinking-mode and
  per-request `usage` leads above remain unverified); no end-to-end UI click-through in a browser;
  behavioral quality of the swarm/Free Form prompts (unprovable without model sessions).
- Verification after fixes: `node --check` clean on all edited JS; `npm test` — 349/349 pass;
  `node tools/install.js` re-run and live `.claude/` copies confirmed to contain every fix.
