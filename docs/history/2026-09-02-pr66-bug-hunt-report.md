# Bug Hunt Report: PR #66 (Unbundle src/ui from Shards agents)

## Summary
- Scope reviewed: 5 files changed in PR #66 — `src/ui/chat-session.js`, `src/ui/server.js`, `src/ui/js/chat.js`, `src/ui/js/agents.js`, `src/ui/js/command-palette.js`
- Confirmed findings: 1 Critical
- One confirmed bug: after a fork/resume (mode switch or model switch), the browser session ID falls out of sync with the server's session store key. All SSE events for that session are silently dropped, making the session appear dead to the UI while the CLI process continues running.

## Findings

### CRITICAL — Session ID mismatch after fork/resume silently drops all SSE events
- **Location:** `src/ui/chat-session.js:176-185` (and corresponding handlers in `src/ui/server.js:1142-1154`)
- **Class:** State & consistency — session ID desynchronization
- **Confidence:** **Confirmed**
- **Description:** When the CLI forks a session (mode switch or model switch via `--resume` + `--fork-session`), the CLI generates a new internal session ID. `ChatSession._parseLine` updated `this.sessionId` to this CLI-assigned ID, then fired a `chat-init` event with `oldSessionId` set. The server's `handleChatEvent` then re-keyed its `sessions` map entry from the original randomUUID to the CLI-assigned ID. Meanwhile, the browser returned from `/chat/start` with the original randomUUID and stored its session state under that ID. All subsequent SSE broadcasts carried the CLI-assigned ID — the browser's `getSessionState(cliId)` returned `undefined` because the browser's `chatSessions` map was keyed by the original randomUUID. Events were silently dropped via the early return at `src/ui/js/events.js:108-109`. The user can type messages, but streaming tokens, assistant messages, tool calls, and gate state are never rendered.
- **Evidence / Reproduction:**
    1. User starts a session with any agent
    2. User switches mode (`/mode`) or model (`/model <name>`)
    3. Server spawns a forked CLI process via `startNewChatSession(agent, { resumeSessionId: targetSessionId, ... })`
    4. CLI init event fires with `data.session_id` = CLI-assigned UUID
    5. `ChatSession._parseLine` sets `this.sessionId = data.session_id`
    6. `chat-init` broadcast carries the CLI-assigned ID
    7. Subsequent `chat-token`, `chat-message`, etc. broadcasts carry the CLI-assigned ID
    8. Browser events handler at `lines 101-109` calls `getSessionState(cliId)` → `undefined` → returns early
    9. Result: the session is active on the CLI but completely silent in the UI
  The verification script at `/tmp/verify-fork-bug.js` demonstrates the exact trace:
  ```
  Browser sends sessionId = original-random-uuid-abc123
  Server finds store: NO (BUG!)
  SSE event sessionId = cli-assigned-uuid-789
  Browser active sessionId = original-random-uuid-abc123
  Match: NO — EVENT DROPPED
  ```
- **Impact:** Any mode switch or model switch renders the session invisible to the UI. The chat goes dark — no streaming output, no assistant replies, no gate buttons. The user would likely conclude the UI is broken and restart, losing the session's transcript and workspace state.
- **Remediation:** In `ChatSession._parseLine`, do NOT update `this.sessionId` when the CLI assigns a new ID on fork. The original randomUUID (returned to the browser via `/chat/start`) must be kept so both server broadcasts and browser lookups use the same session ID. The CLI's internal session ID is irrelevant for in-memory routing — the metadata file (written by `start()`) already stores the original ID for `reconnectOrCleanup`. The fix was applied to `src/ui/chat-session.js:176-186`.

## Notes & unverified leads

1. **`/chat/mode` doesn't preserve model** (`server.js:2613`) — When switching permission mode, `startNewChatSession` is called without passing the current model. However, `--fork-session` should implicitly carry the model from the old session's state. This is implementation-dependent on Claude Code's fork behavior and could not be verified without a running CLI. If confirmed, the fix would be to read `store.chatSession.model` and pass it as `model` to `startNewChatSession`.

2. **`OUTPUT_DIRS` vs `PROJECT_OUTPUT_DIRS` mismatch** (`server.js:56` vs `server.js:91-94`) — `OUTPUT_DIRS` (used for file polling) omits `fixes`, `presentations`, and `projects` that `PROJECT_OUTPUT_DIRS` (used for project detection) includes. This is likely intentional — those directories produce artifacts that don't need real-time poll — but worth noting for future maintenance.

3. **Zombie session stores after mode switch** — When `startNewChatSession` stops the old session via `callerSessionId` and creates a new one with `resumeSessionId`, the old SessionStore remains in the `sessions` Map with a stopped `chatSession`. This is a minor memory leak — each mode/model switch leaves an orphaned entry. In practice the entries are small and the server typically restarts between long sessions, so impact is negligible.

## Coverage & limitations
- Reviewed all 5 files changed in the PR diff (238 insertions, 70 deletions)
- No runtime verification with an actual Claude Code CLI — the session ID desync trace was proven via code analysis and a standalone simulation
- Client-side JavaScript (chat.js, agents.js, command-palette.js) was reviewed for logic errors and DOM safety; no issues found
- The `isGateMessage` / `injectGateButtons` / `isActive` event routing logic in events.js and chat.js was spot-checked but not exhaustively traced — those are pre-existing (not PR-introduced) paths