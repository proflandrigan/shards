# Host compatibility findings (E0.6)

Date: 2026-11-14
Branch: `next` (local only; nothing committed)
Plan reference: `shards-agent-suite-plan.md` task E0.6; decisions D2, D4, D6, D8; tasks E11.0, E11.3-E11.6.

## Tool versions checked

| Tool | Version | How checked |
|---|---|---|
| Claude Code | 2.1.325 | `~/.local/bin/claude --version`; `--help`, `agents --help`, `mcp --help`, `plugin --help`; `strings` on the installed binary (`~/.local/share/claude/versions/2.1.325`) |
| Codex CLI | not installed | public docs only (developers.openai.com redirects to learn.chatgpt.com/docs/...) |
| T3 Code | not installed | public GitHub README (github.com/pingdotgg/t3code) and search results only |
| Windows | no Windows host | docs only |

No model runs were made (no spend). Nothing below was exercised by running a hook, agent or MCP server end to end.

## Status legend

| Status | Meaning |
|---|---|
| VERIFIED locally | Confirmed from the local CLI output, the installed binary, or existing repo code. Binary string evidence is marked "(string presence only)": it shows the feature exists in 2.1.325, not how it behaves. |
| documented (docs), not exercised locally | Claude Code docs (code.claude.com) state it; not run here. Counts as unverified for the follow-up table. |
| docs-only, unverified | Public docs or third-party writing for a tool not installed here. |
| FAILS/UNKNOWN | Docs say it is unsupported, docs conflict, or no public information was found. |

## Summary matrix

| ID | Host | Item | Status | Plan impact |
|---|---|---|---|---|
| CC-1 | Claude Code | MCP elicitation | documented (docs), not exercised locally (binary: `Elicitation`, `ElicitationResult` strings present) | E11.3, E11.5 |
| CC-2 | Claude Code | `--agent` flag | VERIFIED locally (in `--help`) | D4, E11.0 |
| CC-3 | Claude Code | plugin `settings.agent` | VERIFIED live (E5.7): works, but Claude Code warns it will stop working in a future release; use `--agent` or own settings | D4, E11.0 |
| CC-4 | Claude Code | hook fields `session_id`, `agent_id`, `permission_mode` | partly VERIFIED (`session_id` used in repo code); `agent_id`/`permission_mode` documented, strings present in binary | D8, E11.4, D2 |
| CC-5 | Claude Code | SessionStart sources incl. `compact` | documented (docs), not exercised locally | D6, E11.6 |
| CC-6 | Claude Code | PreToolUse `permissionDecision: "ask"` vs allow rules | documented (docs), not exercised; allow-rule interaction NOT stated | E11.4 |
| CC-7 | Claude Code | subagent nesting depth (extra, relevant to D2) | documented (docs), not exercised locally | D2 |
| CX-1 | Codex | per-tool `approval_mode` | docs-only, unverified (key exists; values for per-tool key not listed) | D8, E11.4 |
| CX-2 | Codex | MCP elicitation | FAILS/UNKNOWN (not mentioned in MCP docs) | E11.3, E11.5 |
| CX-3 | Codex | named custom-agent spawn | docs-only, unverified (by `name`; no explicit spawn syntax) | D2, D4 |
| CX-4 | Codex | `max_depth` | docs-only, unverified; sources conflict | D2 |
| CX-5 | Codex | a skill taking over the main session | docs-only, unverified: NO | D4, E11.0 |
| CX-6 | Codex | hook events and payloads | docs-only, unverified (rich; `ask` unsupported) | D6, D8, E11.4, E11.6 |
| T3-1 | T3 Code | host hooks fire | UNKNOWN | D8, E11.4, E11.6 |
| T3-2 | T3 Code | elicitation and approval prompt display | UNKNOWN (approval shown for Codex per README caption only) | E11.3, E11.5 |
| T3-3 | T3 Code | plugin and project skill discovery | UNKNOWN | D4, E11.0 |
| T3-4 | T3 Code | one MCP process per thread | UNKNOWN | E11.3 |
| WIN-1 | Windows | hook shells | docs-only, unverified | D8, CI |
| WIN-2 | Windows | paths | docs-only, unverified | CI |
| WIN-3 | Windows | Node/Python presence | docs-only, unverified | CI |

## Claude Code

### CC-1 Elicitation (MCP)

- Question: does Claude Code support MCP elicitation, so a server can ask the user for input mid-tool-call?
- Finding: yes. Claude Code serves `elicitation/create` in interactive terminal sessions only. In non-interactive runs it asks the server to cancel and does not run `Elicitation` hooks. An `Elicitation` hook event (matcher is the MCP server name) can accept, decline or cancel with `action`/`content`. `ElicitationResult` runs after the user answers. Answering later needs v2.1.324 or later (installed: 2.1.325).
- Evidence: https://code.claude.com/docs/en/mcp (text quoted: "`elicitation/create` is served only in interactive terminal sessions"); https://code.claude.com/docs/en/hooks (Elicitation section). Local: `strings` on the binary shows `"Elicitation"` (21 hits) and `ElicitationResult` (44 hits). The "Respond to MCP elicitation requests" section of the MCP page was beyond the fetched text, so form versus URL mode is not confirmed.
- Status: documented (docs), not exercised locally.
- Impact: elicitation is interactive-only, so any E11.3/E11.5 flow that depends on it fails under `claude -p`, CI and nightly runs. Those need a non-elicitation fallback.

### CC-2 `--agent`

- Question: can a session start with a named agent as the main thread?
- Finding: yes. `claude --help` lists `--agent <agent>  Agent for the current session. Overrides the 'agent' setting.` `claude agents --help` also has `--agent` for dispatched sessions. Docs: the main thread takes on that agent's system prompt, tool restrictions and model; `Agent(agent_type)` in `tools` limits spawnable types only in this main-thread case. `agent_type` appears in SessionStart and hook payloads when `--agent` is used.
- Evidence: local `~/.local/bin/claude --help` (2.1.325); https://code.claude.com/docs/en/sub-agents.
- Status: VERIFIED locally (flag exists). Behavior (prompt replacement, tool limits) is documented, not exercised.
- Impact: confirms D4/E11.0 can launch Syn as the main thread on Claude Code. Behavior still needs a test run.

### CC-3 Plugin `settings.agent`

- Question: can a plugin ship a settings file whose `agent` key makes one of its agents the main thread?
- Finding: not confirmed. The installed binary contains the strings "Loaded settings from settings.json for plugin" and "Failed to parse settings.json for plugin", so a plugin-level `settings.json` is read (string presence only). The plugin manifest reference and components pages fetched on 2026-11-14 do not mention a plugin `settings.json` or an `agent` key. The key set a plugin `settings.json` accepts was not found. The plugin agent frontmatter docs say `permissionMode`, `hooks`, `mcpServers` and `initialPrompt` are ignored in plugin agents.
- Evidence: `strings` on the binary; https://code.claude.com/docs/en/plugins/manifest-reference, /plugins/components, /plugins/create (all silent).
- Status: FAILS/UNKNOWN.
- Impact: until proven, E11.0 must not assume a plugin can set the main agent. Fallback is `claude --agent <plugin>:<name>` or a project `.claude/settings.json` `"agent"` key (documented in sub-agents page). Needs a no-cost local spike: `claude plugin validate` plus a `--plugin-dir` plugin with `settings.json`, checking `/status` or the debug log.

### CC-4 Hook fields `session_id`, `agent_id`, `permission_mode`

- Question: which hook events carry these, especially PreToolUse, and is `permission_mode` reported at call time?
- Finding:
  - `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` are listed as common input fields. The docs add "Not all events receive this field" for `permission_mode` and defer to each event's example; the per-event list was not in the fetched text. Values: `default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions` (Manual arrives as `default`).
  - `agent_id` is "Unique identifier for the subagent or in-process teammate the hook fires in". Tool events fired inside a subagent carry `agent_id` and `agent_type`. `agent_type` also appears when the session uses `--agent`. Settings, managed and plugin hooks all run inside subagents.
  - PreToolUse gets `tool_name`, `tool_input`, `tool_use_id` plus the common fields. A full PreToolUse example showing `permission_mode` was not in the fetched text, so "reported at call time" is inferred from the common-field table, not seen in a payload.
- Evidence: https://code.claude.com/docs/en/hooks (common input fields, subagent identity). Repo: `tools/gate-hook.js` (removed in E11.9) reads only `payload.session_id` (lines 133, 270, 398); it never reads `agent_id` or `permission_mode`. `.claude/settings.json` wires `Stop`, `PreToolUse`, `UserPromptSubmit` only. Local binary strings: `permission_mode` (187 hits), `agent_id` (168 hits), string presence only.
- Status: `session_id`: VERIFIED locally (repo code consumes it). `agent_id`, `permission_mode`: documented (docs), not exercised locally.
- Impact: D8 and E11.4 need `permission_mode` at PreToolUse to decide enforcement; D2 needs `agent_id` to tell a main-thread call from a consult. Capture one real PreToolUse payload (log `JSON.stringify(payload)` from a throwaway hook in a free local session) before E11.4 starts.
- Fan-out (E5.9): `hooks/lib/enforce.js` binds subagents by `agent_id` on `fanout_claim` and applies slice write rules to them. This is Claude Code only: Codex PreToolUse has no `agent_id` (CX-6), so Codex calls are unbound. Neither the binding nor the slice rules have been checked against a real payload (`docs/delegation.md` section 3.1).

### CC-5 SessionStart `compact` (and `startup`/`resume`)

- Question: does SessionStart fire with `source: "compact"` so the plan can re-inject state after compaction?
- Finding: yes per docs. `source` is one of `startup`, `resume`, `clear`, `compact` ("after compaction"), `fork`. The matcher accepts the same values. Plain stdout and `additionalContext` are added as context. Optional fields: `model`, `agent_type` (when `--agent`), `session_title`. The fetched docs show a `resume` JSON example only, not a `compact` one. The repo does not currently use SessionStart.
- Evidence: https://code.claude.com/docs/en/hooks (SessionStart). Binary `SessionStart` string present (200 hits), PreCompact also present (45 hits).
- Status: documented (docs), not exercised locally.
- Impact: D6/E11.6 can rely on it, but need one observed `compact` payload and proof that injected context survives (`/compact` in a throwaway session).

### CC-6 PreToolUse `permissionDecision: "ask"`

- Question: does `ask` force a prompt even when an allow rule matches (needed for E11.4)?
- Finding: values are `allow`, `deny`, `ask`, `defer`. `ask` "prompts the user to confirm". `allow` "skips the permission prompt, except for actions no mode auto-approves". Docs: "Deny and ask rules are still evaluated regardless of what the hook returns", and with multiple hooks precedence is `deny` > `defer` > `ask` > `allow`. A hook that stays silent does not approve. The docs fetched do NOT state explicitly that `ask` beats a matching allow rule in settings.
- Evidence: https://code.claude.com/docs/en/hooks (PreToolUse decision control). Repo: `tools/gate-hook.js` (removed in E11.9) already emits `deny` (line 316) and `allow` (line 373) but never `ask`. Binary has `permissionDecision` (189 hits).
- Status: VERIFIED live (Claude Code 2.1.325, `claude -p`, Stage 5): with a settings allow rule `Bash(touch marker:*)` (via `--settings`, and separately via `--allowedTools`) plus a PreToolUse hook returning `ask`, the command did NOT run (headless: nothing can answer the prompt, so it is denied with the hook's reason). Control with the same allow rule and no hook: the command ran. So a hook `ask` overrides an allow rule. Caveats: project `.claude/settings.json` allow entries are ignored in untrusted workspaces; only headless denial was observed, a shown interactive prompt was not. `runtime/gates/tier2.js` keeps `ASK_OVERRIDES_ALLOW = false` anyway (defense in depth: tier 2 also refuses when an allow rule covers the gate tool).
- Impact: E11.4 depends on this. If `ask` does not override a user allow rule, the design must fall back to `deny` with a reason, or require removing the allow rule. Test with a free local session: allow rule for a Bash command plus a hook returning `ask`.

### CC-7 Subagent nesting depth (added, for D2)

- Question: how deep can consult/fan-out go?
- Finding: by default a subagent can spawn subagents up to three layers below the main conversation. At the limit the `Agent` tool is withheld (except for forks). `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes it; `1` turns nesting off. Syn to specialist to Syn review is depth 2, within the default.
- Evidence: https://code.claude.com/docs/en/sub-agents. Binary contains `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (string presence only).
- Status: documented (docs), not exercised locally.
- Impact: D2 fan-out and consult chains fit Claude Code defaults. Managed settings could lower the env var.

## Codex (not installed; all findings docs-only, unverified)

Sources: https://learn.chatgpt.com/docs/hooks.md, https://learn.chatgpt.com/docs/agent-configuration/subagents.md, https://learn.chatgpt.com/docs/extend/mcp.md (these are the redirect targets of developers.openai.com/codex/*). Some details come from search snippets of https://developers.openai.com/codex/subagents and third-party blogs (codex.danielvaughan.com), which are lower confidence.

### CX-1 Per-tool `approval_mode`

- Finding: MCP config has `tools.<tool>.approval_mode` ("Per-tool approval behavior override"), example value `"approve"`. The server-level `default_tools_approval_mode` supports `auto`, `prompt`, `writes`, `approve`; only `writes` is defined (prompts for tools not marked read-only). Allowed values for the per-tool key are not listed. Plugin servers are configured under `plugins.<plugin>.mcp_servers.<server>`.
- Status: docs-only, unverified.
- Impact: gives a Codex lever for D8/E11.4 (gate mutating tools by prompting). Which value forces a prompt per call needs confirming.

### CX-2 Elicitation

- Finding: the MCP docs do not mention elicitation. No source found on how it is routed to subagents.
- Status: FAILS/UNKNOWN.
- Impact: E11.3/E11.5 cannot assume elicitation on Codex. Needs a plain-chat question fallback.

### CX-3 Named custom-agent spawns

- Finding: custom agents are TOML files (`~/.codex/agents/`, `.codex/agents/`); "Codex identifies the custom agent by its `name` field"; a custom agent overrides a built-in of the same name. The docs show prompts that name an agent in words ("Have pr_explorer map...") but give no explicit spawn syntax or API, so the user cannot be guaranteed to force a specific agent. Subagents inherit the parent turn's sandbox and approval settings and cannot replace them.
- Status: docs-only, unverified.
- Impact: D2/D4 consult via a named agent is plausible but model-mediated on Codex, so E11.0 needs a Codex test that the right agent runs.

### CX-4 `max_depth`

- Finding: conflict. A search snippet of the subagents page says `agents.max_depth` defaults to 1 (a direct child may spawn, no deeper nesting) and `agents.max_threads` defaults to 6. The fetched subagents page does not mention `max_depth` and says `agents.max_concurrent_threads_per_session` with `max_threads` as a legacy alias, no default stated.
- Status: docs-only, unverified; sources conflict.
- Impact: D2 risk. If depth 1 is the default, a specialist that consults Syn or a reviewer (depth 2) is blocked on Codex unless config raises it. Plan an installer-written config setting and a depth-1 degradation path.

### CX-5 Skill taking over the main session

- Finding: no. Docs describe subagents as delegated work; custom agents cannot override sandbox, approval policy, provider or MCP servers; skills inherit from the parent. No mechanism for a skill or agent to become the main session (no `--agent` equivalent found).
- Status: docs-only, unverified: NO.
- Impact: D4/E11.0 persona transfer (Syn becoming a specialist in-session) must be done by skill instructions on Codex, not by agent switch. Plan an AGENTS.md or skill-based persona path.

### CX-6 Hook events and payloads

- Finding (from the hooks page):
  - Events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `PreModelRequest`, `PostModelRequest`, `Interrupt`, `SessionStart`, `SubagentStart`, `SessionEnd`.
  - Common fields: `session_id` (subagents use the parent's), `transcript_path`, `cwd`, `hook_event_name`, `model`, `turn_id`; `permission_mode` on SessionStart, PreToolUse, PermissionRequest, PostToolUse, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt (values `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`).
  - SessionStart `source`: `startup`, `resume`, `clear`, `compact`, `fork`; compact hooks run before the next model request.
  - PreToolUse payload: `turn_id`, `tool_name`, `tool_use_id`, `tool_input`; covers Bash, `apply_patch`, MCP tools (`mcp__...`) and local function tools; not hosted tools such as WebSearch. `write_stdin` does not re-run it. The page calls hooks a guardrail, not a complete enforcement boundary.
  - Decisions: PreToolUse supports `deny` and `allow` with `updatedInput`; `ask` is explicitly UNSUPPORTED (marks the hook failed and the tool call continues). PermissionRequest hooks (`allow`/`deny`) run only when Codex is about to ask for approval.
  - `agent_id` only on SubagentStart/SubagentStop/model-request events, not documented on PreToolUse.
- Status: docs-only, unverified.
- Impact: E11.4 cannot use `ask` on Codex; use `deny` or the PermissionRequest hook. D2 cannot tell consult from main on PreToolUse via `agent_id`. D6/E11.6 SessionStart `compact` is available.

## T3 Code (not installed)

Sources: https://github.com/pingdotgg/t3code (README fetched), plus search results (flaviocopes.com, pyshine.com, mintlify.com mirrors). Provider coverage differs by source date (Codex and Claude; later lists add OpenCode and others).

### T3-1 Host hooks fire

- Finding: not stated in the README. One third-party write-up says the Claude adapter uses the Anthropic Agent SDK and Codex runs over JSON-RPC via stdio; if so, whether `.claude/settings.json` hooks load under the SDK depends on its `settingSources`, which is unknown here.
- Status: UNKNOWN.
- Impact: D8/E11.4/E11.6 may not be enforced under T3 Code. Test before claiming T3 support.

### T3-2 Elicitation and approval display

- Finding: the README mentions a phone app asking to approve a Codex command, and a "Permission modes" page exists but was not read. Nothing on elicitation.
- Status: UNKNOWN (approval display for Codex suggested by a README caption only).
- Impact: E11.3/E11.5 fallback should not depend on a T3 dialog.

### T3-3 Plugin and project skill discovery

- Finding: not stated.
- Status: UNKNOWN.
- Impact: D4/E11.0 distribution to T3 users is unproven.

### T3-4 One MCP process per thread

- Finding: not stated; the README links to a page on connecting outside agents over MCP that was not read.
- Status: UNKNOWN.
- Impact: shared state in the Shards MCP server (E11.3) must not assume one process per thread or per session.

## Windows (documentation only; no Windows host here)

### WIN-1 Hook shells

- Claude Code: hook `shell` accepts `bash` or `powershell`; default is `bash`, or `powershell` on Windows when Git Bash is not installed. Shell-form commands run via Git Bash on Windows (or PowerShell without it). Exec form (`args`) needs a real `.exe` on Windows; `.cmd`/`.bat` shims cannot be spawned. Without Git Bash, exit codes other than 0 or 2 count as failure. `CLAUDE_CODE_GIT_BASH_PATH` overrides detection. Source: https://code.claude.com/docs/en/hooks.
- Codex: hooks support a Windows-only override (`commandWindows` / `command_windows`) and a `windows_managed_dir`; the page does not state general Windows support and its examples assume POSIX. Source: https://learn.chatgpt.com/docs/hooks.md.
- Repo today (removed in E11.9): `.claude/settings.json` used `node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js ...`, an unquoted shell-form command that depends on `$VAR` expansion (fails under PowerShell, breaks on paths with spaces).
- Status: docs-only, unverified.

### WIN-2 Paths

- Claude Code plugin paths substituted into hooks use forward slashes (`C:/Users/...`), but keep native backslashes in exec-form hooks and PowerShell hooks. Hook JSON shows `C:\\project\\...` file paths. Source: https://code.claude.com/docs/en/plugins/components, /hooks.
- Status: docs-only, unverified. Impact: path handling in `tools/` and the ledger must be tested on Windows.

### WIN-3 Node/Python presence

- Neither host's docs guarantee Node or Python on a user machine. Claude Code ships as a native binary (the installed file is a single 365 MB executable), so it does not imply a system Node. The Shards hooks need `node` on PATH (Node 18+ per CLAUDE.md); notebook walkthrough needs Python plus `jupyter_client`.
- Status: docs-only, unverified. Impact: bundle hooks as an MCP server or document Node as a prerequisite; add a Windows CI runner.

## Follow-up and risk table

Owner for every row: proflandrigan. Every non-VERIFIED item above appears here. Task IDs are proposed (E0.6-Fn) and need to be added to the plan.

| ID | Risk | Affected tasks | Proposed follow-up task | Owner |
|---|---|---|---|---|
| CC-1 | Elicitation is interactive-only on Claude Code; unexercised; form/URL modes not read | E11.3, E11.5 | E0.6-F1: read the MCP page's elicitation section; test in an interactive session with a stub MCP server; design a non-interactive fallback | proflandrigan |
| CC-3 | Plugin `settings.agent` unconfirmed; main-agent selection may need `--agent` or project settings | D4, E11.0 | E0.6-F2: local `--plugin-dir` spike with plugin `settings.json`; if unsupported, document `--agent` / project `agent` setting as the activation path | proflandrigan |
| CC-4 | `agent_id` and `permission_mode` presence on PreToolUse unseen in a real payload; gate hook (removed in E11.9) reads neither | D8, E11.4, D2 | E0.6-F3: log real PreToolUse/SessionStart/Stop payloads from a throwaway hook in a free local session; record fields in this file | proflandrigan |
| CC-5 | `compact` SessionStart payload and context survival unobserved | D6, E11.6 | E0.6-F4: run `/compact` in a throwaway session with a SessionStart hook; confirm source and injected context | proflandrigan |
| CC-6 | `ask` may not override a matching allow rule; repo never emits `ask` | E11.4 | E0.6-F5: local test with allow rule plus hook returning `ask`; if it fails, design E11.4 around `deny` or removing allow rules | proflandrigan |
| CC-7 | Depth default (3) documented only; managed settings can lower it | D2 | E0.6-F6: confirm with a 2-deep Task chain locally; installer should check `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | proflandrigan |
| CX-1 | Per-tool `approval_mode` value list unknown; docs only | D8, E11.4 | E0.6-F7: install Codex, test each value on one MCP tool | proflandrigan |
| CX-2 | No Codex elicitation documented | E11.3, E11.5 | E0.6-F8: test on installed Codex; design plain-chat fallback | proflandrigan |
| CX-3 | Custom agents selected by model reading `name`, not forced | D2, D4 | E0.6-F9: Codex test that a named agent is reliably chosen; fall back to inline persona text | proflandrigan |
| CX-4 | `max_depth` default 1 (snippet) vs not mentioned (page); consult from a specialist may be blocked | D2 | E0.6-F10: check `codex` config schema and set `agents.max_depth` in installer; add depth-1 degradation path (flatten consults to the main thread) | proflandrigan |
| CX-5 | No skill or agent can take over the main session on Codex | D4, E11.0 | E0.6-F11: design the Codex persona path (skill or AGENTS.md) and test | proflandrigan |
| CX-6 | PreToolUse `ask` unsupported on Codex; hooks are a guardrail not a boundary; `agent_id` absent on PreToolUse | D8, E11.4, D2, D6, E11.6 | E0.6-F12: design E11.4 around `deny`/PermissionRequest on Codex; test hook payloads on installed Codex | proflandrigan |
| T3-1 | Hooks may not fire under T3 Code | D8, E11.4, E11.6 | E0.6-F13: install T3 Code with both providers; test whether Shards hooks fire; otherwise mark enforcement as unsupported there | proflandrigan |
| T3-2 | Elicitation and approval display unknown | E11.3, E11.5 | E0.6-F14: same T3 test session; trigger an MCP elicitation and an approval | proflandrigan |
| T3-3 | Skill/plugin discovery unknown | D4, E11.0 | E0.6-F15: check whether T3 loads plugin and `.claude/skills` or `.agents` skills per provider | proflandrigan |
| T3-4 | MCP process per thread unknown | E11.3 | E0.6-F16: check process count with two threads open; keep server state stateless or keyed by session | proflandrigan |
| WIN-1 | Hook shell differences; current hook command is POSIX-style and unquoted | D8, CI | E0.6-F17: add a Windows CI runner; convert hooks to exec form (`args`) or quote paths; test Git Bash and PowerShell | proflandrigan |
| WIN-2 | Path separator differences | CI | E0.6-F17 (same runner): path tests in `tools/` | proflandrigan |
| WIN-3 | Node/Python not guaranteed on user machines | CI, installer | E0.6-F18: document prerequisites or ship hooks inside an MCP server; add preflight check to the installer | proflandrigan |
| CC-2 | (VERIFIED flag only) prompt replacement and tool restriction behavior is documented, not run | D4, E11.0 | E0.6-F19: one free local `claude --agent <name>` check, using a `--agents` JSON definition | proflandrigan |

## Highest-risk findings

For D8 / E11.4 (gating mutating actions):

1. Codex PreToolUse does not support `ask` (the hook is marked failed and the tool runs anyway). Enforcement on Codex must use `deny`, a PermissionRequest hook, or `approval_mode`, and the docs call hooks a guardrail, not a complete boundary.
2. On Claude Code, `ask` versus an existing allow rule is not documented in the text fetched, and the repo has never emitted `ask`. Test it before building E11.4 on it.
3. Hook firing under T3 Code is UNKNOWN for both providers, and `permission_mode`/`agent_id` have not been seen in a real PreToolUse payload locally (the repo reads only `session_id`).

For D2 (consult / fan-out depth):

1. Codex `max_depth` is reported as default 1 in one source and absent in the fetched page. At depth 1 a specialist cannot consult Syn or a reviewer (depth 2).
2. Codex custom agents are chosen by the model from `name`/`description` with no documented forced spawn, and `agent_id` is not on Codex PreToolUse, so a consult cannot be reliably told apart from main-thread calls.
3. Claude Code allows three layers by default, so the Syn to specialist to Syn review path (depth 2) fits, but managed settings or `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` would break it.

### E5/E8.7/E5.7 findings (build/emit.js; docs-only notes, none verified live)

- E5.2: switch skills are thin (frontmatter plus an `activate(agent, mode="switch")` instruction and a pointer to `content/agents/<id>/AGENT.md`); only agents with `switch` in `activation` get one. Claude invokes them as `/shards:<id>`, Codex as `$<id>`. The plugin is named `shards`, so a `syn` skill is `/shards:syn`; a bare `/shards` alias is not possible and is not emitted. `scripts/eval/switch-eval.js` scores whether `claude -p "/shards:<id>"` makes the model call `activate` for the right agent. UNVERIFIED: that `-p "/shards:<id>"` expands a plugin skill headless; the first live run decides.
- E5.3: subagents are `agents/<id>.md` (general: persona summary plus entry file list) and `agents/<id>-<entry>.md` (summary, rendered entry file, plus `worker_contract.md` for `worker`), Codex `.codex/agents/<id>[-<entry>].toml`. No `model` key anywhere (D7); `tools` never includes `Task` or `Agent`, default `Read, Glob, Grep, Bash` when the persona has none. Consult and fanout text now names `<id>-<entry>`. Codex still picks agents by model reading `name` (CX-3).
- E8.7: on Codex, the skill takes over instructions after `activate`, and every tool response header carries `agent=<id>` (runtime/header.js), which re-asserts the persona. Fallback outside T3: the codex build writes `[profiles.shards-<agent>]` tables (with `developer_instructions`) into `.codex/config.toml`; use `codex --profile shards-<agent>`. UNVERIFIED: the profile table shape and whether a profile accepts `developer_instructions` were not found in fetched docs.
- E5.7: opt-in only (`opts.defaultAgent` to emitTarget, or env `SHARDS_BUILD_DEFAULT_AGENT=1`; the CLI flag `--default-agent` still needs wiring in build/compile.js). Claude: writes plugin-root `settings.json` `{"agent": "shards:syn"}`, and `agents/syn.md` then omits `tools` (full tool set, so the main thread can spawn subagents and call MCP tools) and gains a main-thread instruction to call `activate(agent="syn", mode="switch")` first. Manual route: `claude --agent shards:syn`. UNVERIFIED (CC-3): whether a plugin `settings.json` honors `agent`. Codex: a top-level `profile = "shards-syn"` in `.codex/config.toml`, also UNVERIFIED.
