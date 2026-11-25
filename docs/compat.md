# Host compatibility findings (E0.6)

Date: 2026-11-14
Branch: `next` (local only; nothing committed)
Plan reference: `docs/history/shards-agent-suite-plan.md` task E0.6; decisions D2, D4, D6, D8; tasks E11.0, E11.3-E11.6.

## Tool versions checked

| Tool | Version | How checked |
|---|---|---|
| Claude Code | 2.1.325 | `~/.local/bin/claude --version`; `--help`, `agents --help`, `mcp --help`, `plugin --help`; `strings` on the installed binary (`~/.local/share/claude/versions/2.1.325`) |
| Codex CLI | 0.169.0 (live test 2026-11-19) | public docs, then a live test on macOS with a scratch `CODEX_HOME`: `codex plugin marketplace add` / `plugin add`, app-server `hooks/list`, `skills/list`, `mcpServerStatus/list`, `codex exec --strict-config` as a config validator, `codex mcp list`, and a few `codex exec` model runs with recorder hooks. Rows marked "live-verified on Codex 0.169.0, 2026-11-19" come from that test |
| T3 Code | not installed | public GitHub README (github.com/pingdotgg/t3code) and search results only |
| Windows | no Windows host | docs only |

The E0.6 pass (2026-11-14) made no model runs. The Codex rows were later checked live (2026-11-19, Codex 0.169.0); Claude Code rows are as of E0.6 unless they say otherwise.

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
| CX-1 | Codex | MCP config keys and `approval_mode` | live-verified on Codex 0.169.0, 2026-11-19 (values `auto`/`prompt`/`writes`/`approve`; `prompt` refuses under `codex exec`) | D8, E11.4 |
| CX-2 | Codex | MCP elicitation | partly observed (0.169.0): a `gate_request` form was sent and dismissed without a decision under `codex exec`; the interactive TUI was not tested | E11.3, E11.5 |
| CX-3 | Codex | named custom-agent spawn | docs-only, unverified (by `name`; no explicit spawn syntax) | D2, D4 |
| CX-4 | Codex | `max_depth` | keys live-verified on Codex 0.169.0 (accepted by `--strict-config`); defaults not checked | D2 |
| CX-5 | Codex | a skill taking over the main session | docs-only, unverified: NO | D4, E11.0 |
| CX-6 | Codex | hook events and payloads | live-verified on Codex 0.169.0, 2026-11-19 (`ask` ignored; `agent_id` on PreToolUse inside subagents) | D6, D8, E11.4, E11.6 |
| CX-7 | Codex | plugin packaging (marketplace, hooks, MCP, trust, profiles) | live-verified on Codex 0.169.0, 2026-11-19 | E8.1-E8.3, E8.7 |
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

- Note 2026-11-16: `claude plugin validate --strict` on a `--default-agent` release build passes, with this warning on `settings.json` (verbatim): "A plugin's `agent` setting is deprecated and will stop applying in a future release. Tell people to set `agent` in their own settings or pass --agent." Docs recommend `claude --agent shards:syn` or project settings; the plugin setting stays opt-in.

### CC-4 Hook fields `session_id`, `agent_id`, `permission_mode`

- Question: which hook events carry these, especially PreToolUse, and is `permission_mode` reported at call time?
- Finding:
  - `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` are listed as common input fields. The docs add "Not all events receive this field" for `permission_mode` and defer to each event's example; the per-event list was not in the fetched text. Values: `default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions` (Manual arrives as `default`).
  - `agent_id` is "Unique identifier for the subagent or in-process teammate the hook fires in". Tool events fired inside a subagent carry `agent_id` and `agent_type`. `agent_type` also appears when the session uses `--agent`. Settings, managed and plugin hooks all run inside subagents.
  - PreToolUse gets `tool_name`, `tool_input`, `tool_use_id` plus the common fields. A full PreToolUse example showing `permission_mode` was not in the fetched text, so "reported at call time" is inferred from the common-field table, not seen in a payload.
- Evidence: https://code.claude.com/docs/en/hooks (common input fields, subagent identity). Repo: `tools/gate-hook.js` (removed in E11.9) reads only `payload.session_id` (lines 133, 270, 398); it never reads `agent_id` or `permission_mode`. `.claude/settings.json` wires `Stop`, `PreToolUse`, `UserPromptSubmit` only. Local binary strings: `permission_mode` (187 hits), `agent_id` (168 hits), string presence only.
- Status: `session_id`: VERIFIED locally (repo code consumes it). `agent_id`, `permission_mode`: documented (docs), not exercised locally.
- Impact: D8 and E11.4 need `permission_mode` at PreToolUse to decide enforcement; D2 needs `agent_id` to tell a main-thread call from a consult. Capture one real PreToolUse payload (log `JSON.stringify(payload)` from a throwaway hook in a free local session) before E11.4 starts.
- SubagentStop (S5F): `hooks/subagent-stop.js` releases the exiting worker's lease binding via `agent_id`. Wired in both `claude-code.hooks.json` and `codex.hooks.json`. Codex 0.169 sends `agent_id`/`agent_type` on SubagentStop and on PreToolUse inside a subagent (CX-6, live payloads), so Codex workers bound by `fanout_claim` are released too. The release path is unit-tested with a real-shaped Codex payload (`test/codex-host.test.js`), not exercised live on either host.
- Fan-out (E5.9): `hooks/lib/enforce.js` binds subagents by `agent_id` on `fanout_claim` (`mcp__plugin_shards_shards__fanout_claim` on Claude, `mcp__shards__fanout_claim` on Codex) and applies slice write rules to them. Both hosts: Codex 0.169 PreToolUse inside a subagent carries `agent_id` and `agent_type` (CX-6, live payload). Codex reports its built-in role (`default` observed) as `agent_type`; that is not compared with the lease `worker_type` (custom agents keep their name and are compared). The Codex binding is unit-tested with real-shaped payloads only; no live fan-out run on either host (`docs/delegation.md` section 3.1).

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
- Syn to lead to worker (PM mode, `{{lead}}`) is depth 2, also within the default. Setting `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` removes the lead's `Agent` tool, which forces the lead onto the sequential/inline `{{delegate}}` fallback (reported with a `Fallback:` evidence row). Builders keep `Task` in their subagent tools (`build/host-tools.js`).
- Evidence: https://code.claude.com/docs/en/sub-agents. Binary contains `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (string presence only).
- Status: documented (docs), not exercised locally.
- Impact: D2 fan-out and consult chains fit Claude Code defaults. Managed settings could lower the env var.

## Codex

Sources: https://learn.chatgpt.com/docs/hooks.md, https://learn.chatgpt.com/docs/agent-configuration/subagents.md, https://learn.chatgpt.com/docs/extend/mcp.md (these are the redirect targets of developers.openai.com/codex/*), then a live test of Codex CLI 0.169.0 on macOS (2026-11-19) with a scratch `CODEX_HOME`. Items marked "live-verified on Codex 0.169.0, 2026-11-19" were observed there; the rest is still docs-only.

### CX-1 MCP config keys and `approval_mode`

- Finding (live-verified on Codex 0.169.0, 2026-11-19): a server entry (config.toml `[mcp_servers.<n>]` or a plugin `.mcp.json`) accepts `command`, `args`, `cwd`, `env`, `env_vars`, `enabled`, `default_tools_approval_mode`, `tools.<tool>.approval_mode`, `startup_timeout_sec`, `tool_timeout_sec`. `approval_mode` values: `auto`, `prompt`, `writes`, `approve`. The Shards tools carry no `readOnlyHint`, so with no default every Shards tool needs approval and all of them fail under `codex exec` (approval policy never). `default_tools_approval_mode = "approve"` made `gates_open` work. `tools.gate_advance.approval_mode = "prompt"` was refused under `codex exec` and fired a PermissionRequest hook, which is the intended behaviour.
- Shards setting (`shards install --codex`, `build/package.js codexMcpToml`): `default_tools_approval_mode = "approve"`, and `approval_mode = "prompt"` for `gate_advance`, `gate_force_close`, `gate_confirm`, `gate_suspend` (the set `shards doctor` checks; doctor also fails a non-prompt server default that leaves any of them without a prompt table).
- Status: live-verified on Codex 0.169.0, 2026-11-19. The interactive TUI prompt for a `prompt` tool was not seen (exec only).

### CX-2 Elicitation

- Finding: the MCP docs do not mention elicitation. In the 0.169.0 live run, `gate_request` reported "A confirmation form was shown but dismissed without a decision" under `codex exec`, so Codex accepts the elicitation request and exec dismisses it. Whether the interactive TUI shows the form was not tested.
- Status: partly observed (exec only).
- Impact: E11.3/E11.5 keep the plain-chat fallback (tier 3, `gate_confirm`) as the Codex path.

### CX-3 Named custom-agent spawns

- Finding: custom agents are TOML files (`~/.codex/agents/`, `.codex/agents/`); "Codex identifies the custom agent by its `name` field"; a custom agent overrides a built-in of the same name. The docs show prompts that name an agent in words ("Have pr_explorer map...") but give no explicit spawn syntax or API, so the user cannot be guaranteed to force a specific agent. Subagents inherit the parent turn's sandbox and approval settings and cannot replace them. Live (0.169.0): a plain spawned subagent reports `agent_type: "default"` in hook payloads.
- Status: docs-only, unverified (named spawn not tested).
- Impact: D2/D4 consult via a named agent is plausible but model-mediated on Codex, so E11.0 needs a Codex test that the right agent runs.

### CX-4 `max_depth`

- Finding: Codex 0.169.0 accepts `agents.max_depth`, `agents.max_threads`, `agents.max_concurrent_threads_per_session` (must be >= 1) and `features.multi_agent_v2.max_concurrent_threads_per_session` (`codex exec --strict-config`). Defaults were not checked; one docs snippet says `max_depth` defaults to 1 and `max_threads` to 6.
- Status: keys live-verified on Codex 0.169.0, 2026-11-19; defaults docs-only.
- E8.6: recommended values and the emitted (commented) config are in `docs/delegation.md` section 8.1.
- Impact: D2 risk. If depth 1 is the default, a specialist that consults Syn or a reviewer (depth 2) is blocked on Codex unless config raises it.

### CX-5 Skill taking over the main session

- Finding: no. Docs describe subagents as delegated work; custom agents cannot override sandbox, approval policy, provider or MCP servers; skills inherit from the parent. No mechanism for a skill or agent to become the main session (no `--agent` equivalent found). Profiles (CX-7) are the whole-session route: `codex -p shards-<agent>`.
- Status: docs-only, unverified: NO.
- Impact: D4/E11.0 persona transfer (Syn becoming a specialist in-session) is done by skill instructions plus the `agent=<id>` tool header on Codex, not by agent switch.

### CX-6 Hook events and payloads

- Finding (live-verified on Codex 0.169.0, 2026-11-19, from recorder hooks; fixtures in `test/fixtures/codex/payloads-0.169.0.json`):
  - SessionStart: `{session_id, transcript_path, cwd, hook_event_name, model, permission_mode, source}`. No `turn_id`.
  - UserPromptSubmit: the same plus `turn_id` and `prompt`.
  - PreToolUse: `{session_id, turn_id, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id}`, plus `agent_id` and `agent_type` when the call runs inside a subagent (the subagent keeps the parent's `session_id`).
  - SubagentStart/SubagentStop carry `agent_id` and `agent_type`; SubagentStop also `last_assistant_message` and `agent_transcript_path`.
  - `apply_patch` `tool_input` is `{"command": "*** Begin Patch\n*** Add File: x\n..."}` (patch text as a string under `command`); `hooks/lib/writes.js` reads it and checks the `*** Add/Update/Delete File:` and `*** Move to:` paths. MCP tool names are `mcp__shards__<tool>`.
  - `permissionDecision: "ask"` is ignored: the tool runs anyway. `deny` blocks the call ("Command blocked by PreToolUse hook: ...").
  - `permission_mode` was `bypassPermissions` under `codex exec -s workspace-write`. Tier 2 (`gate_advance` via a host prompt) is off on Codex anyway; this also means a tier-2 check would refuse there.
  - Hook commands run with cwd = the project. Plugin hook commands get `PLUGIN_ROOT`, `PLUGIN_DATA` and also `CLAUDE_PLUGIN_ROOT` in their env, and `${PLUGIN_ROOT}` in the command string is expanded by Codex (hooks/list shows the absolute path).
- Host detection (`hooks/lib/host.js`): because Codex sets `CLAUDE_PLUGIN_ROOT` (and a Codex started from a Claude Code terminal inherits `CLAUDECODE`), env-based detection called Codex `claude-code`, so the `ask` paths (gate tools, external writes, unknown-target writes during fan-out) failed open. Order now: the `--host codex` argv flag that every emitted Codex hook command carries, then `SHARDS_HOST`, then the payload (`turn_id` means Codex), then `PLUGIN_ROOT`/`PLUGIN_DATA` without `CLAUDE_PROJECT_DIR` (Codex), then the Claude env vars. The MCP server (`runtime/session/correlate.js`) gets `--host codex` in its args and `SHARDS_HOST=codex` in its env from `shards install --codex`.
- Still docs-only: the full event list (`PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `PreModelRequest`, `PostModelRequest`, `Interrupt`, `SessionEnd`), SessionStart `compact`, `allow` with `updatedInput`.
- Status: live-verified on Codex 0.169.0, 2026-11-19 (the fields and behaviours listed above).
- Impact: E11.4 cannot use `ask` on Codex; it uses `deny` and `approval_mode = "prompt"`. Fan-out binding by `agent_id` works on Codex (unit-tested, not live-verified).

### CX-7 Plugin packaging, hooks trust, MCP registration and profiles

- Finding (live-verified on Codex 0.169.0, 2026-11-19):
  - Install: `codex plugin marketplace add <dir>` where `<dir>/.agents/plugins/marketplace.json` is `{"name":"shards-local","plugins":[{"name":"shards","source":{"source":"local","path":"./plugins/shards"},"policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"},"category":"Developer Tools"}]}`, then `codex plugin add shards@shards-local`. `codex plugin add <path>` alone fails. The plugin is copied to `$CODEX_HOME/plugins/cache/<marketplace>/shards/<version>/`.
  - Hooks: Codex discovers plugin hooks at `<plugin>/hooks/hooks.json` (not `.codex/hooks.json`). `node "${PLUGIN_ROOT}/hooks/<shim>.js" --host codex` works.
  - Hooks trust: untrusted hooks are skipped silently in exec. Trust is `[hooks.state."<key>"]` in config.toml with `trusted_hash` and `trusted_content_hash`, the two halves of the `currentHash` (`sha256:<a>/sha256:<b>`) that app-server `hooks/list` reports with the key; `--dangerously-bypass-hook-trust` skips the check.
  - Plugin `.mcp.json`: with `args ["./runtime/server.js"]` and no `cwd` the handshake fails; `${PLUGIN_ROOT}` is not expanded in `.mcp.json` args; with `cwd "."` the server runs in the plugin cache dir with an env of only HOME, LANG, LOGNAME, PATH, SHELL, TERM, TMPDIR, USER. The runtime then keeps its state in `<plugin cache>/.shards` while the hooks write `<project>/.shards`, so pending gates are invisible to PreToolUse (split brain). So the plugin ships no `.mcp.json`.
  - config.toml route: `[mcp_servers.shards] command = "node", args = ["<abs>/runtime/server.js", "--host", "codex"]` works; started for a thread, the server's cwd is the project and SessionStart handshake correlation matched the Codex session id. A live `codex exec` run (activate, gate_request, then apply_patch) got "Command blocked by PreToolUse hook: shards: gate data-analyst-phase-1 is pending" and the gate was in `<project>/.shards/state/sessions/<codex session id>/gates.json`, none in the plugin cache.
  - Skills: app-server `skills/list` names plugin skills `shards:<id>`. The `$shards:<id>` mention form follows Codex's `$<skill>` syntax; a model run with it was not made.
  - Profiles: `[profiles.<n>] developer_instructions` is rejected ("unknown configuration field"), and a top-level `profile = "..."` is rejected ("legacy `profile` config is no longer supported; use `--profile <n>` with `<n>.config.toml`"). Profiles v2 are files `$CODEX_HOME/<name>.config.toml` with top-level keys such as `developer_instructions`, used with `codex -p <name>`; `--strict-config` validates them.
- Shards packaging: `shards build --target codex [--marketplace]` emits `hooks/hooks.json`, `.codex/shards-<agent>.config.toml` profiles and no `.mcp.json`; `shards install --codex` writes the config.toml MCP block and copies the profiles (`docs/release.md`).
- Status: live-verified on Codex 0.169.0, 2026-11-19 (macOS only; Windows hook commands untested).

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
| CC-4 | `agent_id` and `permission_mode` presence on PreToolUse unseen in a real payload; gate hook (removed in E11.9) reads neither. Update: Codex payloads incl. `permission_mode` were captured live (CX-6); Claude Code `permission_mode` is still unseen | D8, E11.4, D2 | E0.6-F3: log real PreToolUse/SessionStart/Stop payloads from a throwaway hook in a free local session; record fields in this file | proflandrigan |
| CC-5 | `compact` SessionStart payload and context survival unobserved | D6, E11.6 | E0.6-F4: run `/compact` in a throwaway session with a SessionStart hook; confirm source and injected context | proflandrigan |
| CC-6 | `ask` may not override a matching allow rule; repo never emits `ask` | E11.4 | E0.6-F5: local test with allow rule plus hook returning `ask`; if it fails, design E11.4 around `deny` or removing allow rules | proflandrigan |
| CC-7 | Depth default (3) documented only; managed settings can lower it | D2 | E0.6-F6: confirm with a 2-deep Task chain locally; installer should check `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | proflandrigan |
| CX-1 | DONE (0.169.0): values known; `shards install --codex` sets default `approve`, gate tools `prompt`. Open: the interactive TUI prompt | D8, E11.4 | E0.6-F7: see the prompt in the TUI | proflandrigan |
| CX-2 | Elicitation request accepted, dismissed under exec; TUI untested | E11.3, E11.5 | E0.6-F8: test the form in the TUI; plain-chat fallback (tier 3) stays the Codex path | proflandrigan |
| CX-3 | Custom agents selected by model reading `name`, not forced | D2, D4 | E0.6-F9: Codex test that a named agent is reliably chosen; fall back to inline persona text | proflandrigan |
| CX-4 | Keys accepted by 0.169.0; defaults unchecked; consult from a specialist may be blocked at depth 1 | D2 | E0.6-F10: check defaults; add depth-1 degradation path (flatten consults to the main thread) | proflandrigan |
| CX-5 | No skill or agent can take over the main session on Codex | D4, E11.0 | E0.6-F11: design the Codex persona path (skill or AGENTS.md) and test | proflandrigan |
| CX-6 | Payloads DONE (0.169.0). `ask` ignored on Codex; hooks are a guardrail not a boundary; `agent_id` present on PreToolUse inside subagents | D8, E11.4, D2, D6, E11.6 | E0.6-F12: live fan-out run (worker calls `fanout_claim`); SessionStart `compact` payload | proflandrigan |
| CX-7 | DONE (0.169.0): marketplace install, plugin hooks, config.toml MCP route, profiles v2. Open: hooks trust has no Shards installer step (manual or TUI); Windows hook commands untested | E8.1-E8.3 | E0.6-F13: TUI trust flow; Windows run | proflandrigan |
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

1. Codex PreToolUse ignores `ask` (live-verified on 0.169.0: the tool runs anyway). Enforcement on Codex uses `deny` and `approval_mode = "prompt"`, and the docs call hooks a guardrail, not a complete boundary.
2. On Claude Code, `ask` versus an existing allow rule is not documented in the text fetched, and the repo has never emitted `ask`. Test it before building E11.4 on it.
3. Hook firing under T3 Code is UNKNOWN for both providers. `permission_mode`/`agent_id` were seen in real Codex 0.169.0 PreToolUse payloads (CX-6) but not yet in a real Claude Code PreToolUse payload; the hooks read both (`hooks/lib/host.js`).

For D2 (consult / fan-out depth):

1. Codex `max_depth` is reported as default 1 in one source (the key is accepted by 0.169.0; the default was not checked). At depth 1 a specialist cannot consult Syn or a reviewer (depth 2).
2. Codex custom agents are chosen by the model from `name`/`description` with no documented forced spawn. Codex PreToolUse does carry `agent_id` inside subagents (0.169.0), so subagent calls can be told apart from main-thread calls.
3. Claude Code allows three layers by default, so the Syn to specialist to Syn review path (depth 2) fits, but managed settings or `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` would break it.

### E5/E8.7/E5.7 findings (build/emit.js; Codex profile and skill-name facts checked on Codex 0.169.0, the rest docs-only)

- E5.2: switch skills are thin (frontmatter plus an `activate(agent, mode="switch")` instruction and a pointer to `content/agents/<id>/AGENT.md`); only agents with `switch` in `activation` get one. Claude invokes them as `/shards:<id>`, Codex as `$shards:<id>` (Codex 0.169 `skills/list` names plugin skills `shards:<id>`; the `$` mention was not model-tested). The plugin is named `shards`, so a `syn` skill is `/shards:syn`; a bare `/shards` alias is not possible and is not emitted. `scripts/eval/switch-eval.js` scores whether `claude -p "/shards:<id>"` makes the model call `activate` for the right agent. UNVERIFIED: that `-p "/shards:<id>"` expands a plugin skill headless; the first live run decides.
- E5.3: subagents are `agents/<id>.md` (general: persona summary plus entry file list) and `agents/<id>-<entry>.md` (summary, rendered entry file, plus `worker_contract.md` for `worker`), Codex `.codex/agents/<id>[-<entry>].toml`. No `model` key anywhere (D7); `tools` never includes `Task` or `Agent`, default `Read, Glob, Grep, Bash` when the persona has none. Consult and fanout text now names `<id>-<entry>`. Codex still picks agents by model reading `name` (CX-3).
- E8.7: on Codex, the skill takes over instructions after `activate`, and every tool response header carries `agent=<id>` (runtime/header.js), which re-asserts the persona. Fallback outside T3: the codex build writes v2 profile files `.codex/shards-<agent>.config.toml` (top-level `developer_instructions`), which `shards install --codex` copies to `$CODEX_HOME`; use `codex -p shards-<agent>`. `[profiles.*]` tables with `developer_instructions` are rejected by Codex 0.169.0 (CX-7); the v2 files pass `--strict-config`. Whether the model then calls `activate` was not model-tested.
- E5.7: opt-in only (`opts.defaultAgent` to emitTarget, or env `SHARDS_BUILD_DEFAULT_AGENT=1`; the CLI flag is `shards build --default-agent`). Claude: writes plugin-root `settings.json` `{"agent": "shards:syn"}`, and `agents/syn.md` then omits `tools` (full tool set, so the main thread can spawn subagents and call MCP tools) and gains a main-thread instruction to call `activate(agent="syn", mode="switch")` first. Manual route: `claude --agent shards:syn`. CC-3 (verified live in E5.7): a plugin `settings.json` honors `agent`, with a deprecation warning. Codex: no config key exists (0.169.0 rejects a top-level `profile`), so the opt-in only adds a comment naming `codex -p shards-syn`.

## Delegate host fallbacks (E12.8)

`{{delegate}}` renders capability-aware text per host, so the same build phase degrades gracefully. An optional `mode=parallel|sequential|inline` argument forces one rendering; any other value is a build error.

| Host | Default | Parallel limit | Fallbacks (always stated in the text) |
|---|---|---|---|
| Claude Code (claude) | parallel: background subagents, one per ready card | the host background-subagent thread cap, or `max_parallel` if lower | sequential (one ready card at a time through the same dispatch/report/verify steps), then inline |
| Codex (codex) | parallel via `spawn_agent` | bounded by Codex `max_threads`, or `max_parallel` if lower | same sequential and inline fallbacks |
| Skills (skills) | sequential: no parallel guarantee; one card at a time via isolated skill invocation if supported | none assumed | inline in this session under the same owned-path rule |
| T3 | uses the underlying provider's rendering (Claude or Codex) per E0.6 | provider's limit | provider's fallbacks |

Fallbacks are a last resort: sequential or inline is used ONLY when worker subagents genuinely cannot be spawned on the host. The agent names the reason in its report to its caller and adds a `Fallback: <sequential|inline> — <reason>` row to the `## Validation` Evidence table of project-specs.md; it never falls back silently, and cards, acceptance checks, `task_verify` calls and evidence rows stay identical. A workstream lead (`{{lead}}`) passes its `scope` on every task tool call; on Codex, Syn -> lead -> worker needs `agents.max_depth = 2`.

Modes: `sequential` dispatches ONE ready task at a time. `inline` dispatches the cards, then the agent does each itself with no worker handoff: same cards, acceptance checks and evidence rows; only isolation is lost. In every mode step 5 calls `task_verify` (prefixed per target) to record the evidence row; a task is done only through it, with at most 2 retries before escalating to the user.

TODO(owner: proflandrigan) OPEN (external): live verification of the Codex rendering (`spawn_agent` bounded by `max_threads`) on a real Codex install.
