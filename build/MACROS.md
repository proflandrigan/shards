# Shards template macros (spec v1)

Authoritative spec for the macros the compiler (`build/compile.js`, `shards build`) expands in every `.md` file under `core/`. Implemented in `build/macros.js` (parse), `build/resolve.js` (validate), `build/render.js` (per target).

## 1. Syntax

```
{{name arg arg key=value key="quoted value"}}
```

- `name` starts with a lowercase letter and may contain `a-z 0-9 _` and dots (`record.write`, `tasks.create`). The name must be followed by whitespace or `}}`.
- Arguments are whitespace separated. A positional argument is a bare token. A named argument is `key=value`; `value` is a bare token or a double-quoted string (`\"` escapes a quote). Duplicate keys, unterminated quotes and an empty key are errors (`malformed args`).
- A macro sits on one line. A `{{` with no `}}` on the same line is literal text.
- `{{UPPER_SNAKE}}` and anything not starting with a lowercase letter (`{{PROJECT_NAME}}`, `{{ spaced }}`) are template placeholders or foreign templating: passed through untouched, never validated.
- A lowercase word directly followed by a comma or hyphen (`{{specific, actionable}}`) is not a macro name (the name must be followed by whitespace or `}}`), so it passes through. Prose placeholders in `core/` use `{{UPPER_SNAKE}}` instead; non-ASCII text is no longer special-cased, so `{{path — note}}` is an `unknown macro 'path'` error.
- Any other lowercase-named candidate whose name is not in section 3 is an error: `unknown macro 'x'`.
- Escape: `\{{` renders a literal `{{` (the backslash is dropped, the rest of the text is not parsed as a macro).
- Macros are expanded everywhere in a file, including fenced code blocks. Use `\{{` to show one literally.
- Legacy text (`Task(subagent_type=...)`, `.claude/...`, `::GATE::` fences, `/compact`) passes through untouched outside `--strict`.

## 2. Errors and `--strict`

Every error is one line, all errors are collected and printed, exit code 1, nothing is emitted:

```
core/agents/ml-engineer/phases/phase-3.md:41: unknown agent 'ml-enginer' in {{consult ...}}
```

Format `<path>:<line>: <message>`; `<path>` is relative to the cwd (absolute if outside it); `line` is 1-based, for the line holding the `{{`. Errors with no line (agent.yaml, missing files) use line 1.

Always-on checks:

| Check | Error |
|---|---|
| agent.yaml fails `core/schema/agent.schema.json`, id mismatch, unknown reviewer | schema message |
| `consult_entries` file missing | `consult entry 'review' file 'modes/review.md' does not exist` (allowlist below) |
| unknown agent / entry / protocol / template / phase | `unknown <kind> '<x>'` plus what exists |
| unknown lowercase macro name, missing or unexpected argument, bad enum | `unknown macro` / `missing required argument` / `unknown argument` / `invalid value` |
| markdown link `[t](rel/path)` (not `http:`, `mailto:`, `#`, absolute, or containing `{{`) whose file does not exist relative to the source file; links in fenced code are ignored | `broken link 'rel/path'` |
| duplicate gate id within one file | `duplicate gate id` |

Allowlist (single, in `build/resolve.js` `KNOWN_MISSING`): `worker: modes/worker.md` is allowed to be missing until E12.2 creates it. A `{{consult X entry=worker}}` is then accepted and renders normally.

`--strict` (later stages) additionally fails, per occurrence, on: `subagent_type`, `.claude/`, `/compact`, `::GATE::`, `::ENDGATE::`, `::AUTO-VERIFY::`, `::ENDAUTO::` anywhere in a source file, and on a `model:` line inside frontmatter of any AGENT.md or a `model` key in agent.yaml (D7). Without `--strict` none of these are checked.

## 3. Macros

Common rules. `<agent>` is a directory name under `core/agents/`. Tool names below are runtime tools; each target prefixes them (section 5). "Enclosing" means derived from the source file's path: `core/agents/<agent>/phases[_quick|_deep]/phase-<N>.md` gives agent, phase N and track; any other file under `core/agents/<agent>/` gives only the agent; protocols and templates give nothing.

### 3.1 `{{switch <agent>}}`

Example: `{{switch data-modeller}}`
Args: `agent` (positional, required). Validation: agent exists and `activation` contains `switch`.
Compiles to runtime `activate(agent, mode="switch")`. The agent takes over the main session as a new frame; leave with `return`.

### 3.2 `{{consult <agent> entry=<entry> [task="..."]}}`

Example: `{{consult researcher entry=service task="review the split strategy"}}`
Args: `agent` (positional, required), `entry` (required; one of `review|advise|service|final_review|arbiter|code_review|worker`), `task` (optional free text appended to the instruction).
Validation: agent exists; `activation` contains `consult` (or `fanout_worker` for `entry=worker`); `entry` is a key of the agent's `consult_entries`; the mapped file `core/agents/<agent>/<file>` exists (except the allowlisted `worker`). Resolution: entry key -> `consult_entries[entry]` -> content path `content/agents/<agent>/<file>`.
Rendered instruction (all targets): run `<agent>` as an isolated consultant in entry `<entry>`, give it only the task and the referenced record sections, tell it to read the entry file first and answer with a verdict per the reviewer-verdict protocol, then continue with the result. Consultants never hold gates and never consult further (D2). Per-target mechanics in section 5.

### 3.3 `{{fanout <agent> slices=<n|a,b,c> [entry=worker]}}`

Example: `{{fanout ml-engineer slices=model_a,model_b,model_c}}`
Args: `agent` (positional, required), `slices` (required; positive integer, or comma list of `[a-z0-9_-]+`), `entry` (optional, default `worker`; same enum as consult).
Validation: agent exists and `activation` contains `fanout_worker`. The entry file is checked like consult.
Compiles to runtime `fanout_start(agent, slices)` (E5.9; leases). The runtime takes `slices` as an array of `{id, paths[], acceptance}`; the rendered text tells the lead to build that array from the slice names (`id`), give each worker its card, and call `fanout_collect` afterwards. Precondition (ADR 0011): `fanout_start` is refused while a gate is pending or suspended; the rendered text says to confirm or close the open gate first and retry if refused. It returns one card per slice and opens a lease. Launch one parallel worker per card. Each worker calls `fanout_claim(lease_id, slice_id)` first, writes only inside its owned paths, and returns verdict JSON. The lead then calls `fanout_collect(lease_id, results)` with one result per slice; it merges worst-wins and closes the lease. Workers never hold gates, change the plan or delegate. See `docs/delegation.md` section 3.1.

### 3.4 `{{return [to=<agent>]}}`

Example: `{{return to=syn}}`
Args: `to` (optional; agent id, must exist). Compiles to runtime `return(to?)`: pops one frame, or pops to the frame of `to`. A pending gate in the frame being left must be resolved first.

### 3.5 `{{phase N [track=quick|deep] [agent=<agent>]}}`

Example: `{{phase 6-5}}` or `{{phase 2 track=deep}}`
Args: `N` (positional, required; `\d+(-\d+)*`), `track` (optional), `agent` (optional; default enclosing agent, else required).
Validation: file exists as `phases/phase-N.md`; for dual-track agents (`phases_quick/`+`phases_deep/`) the track is `track=` or the enclosing file's track and is required; `track=` on a single-track agent is an error.
Compiles to runtime `load_phase(agent, n, track?)`, which refuses until the previous gate is confirmed (D2). The rendered text instructs a `load_phase` tool call (per-target tool name) and does not name a phase file: phase content is served by the runtime tool for the host target, rendered by the same build modules.

### 3.6 `{{protocol <name>}}`

Example: `{{protocol validation}}`
Args: `name` (positional; file stem under `core/protocols/`). Validation: `core/protocols/<name>.md` exists.
Renders as an instruction to read `content/protocols/<name>.md` now and follow it.

### 3.7 `{{template <name>}}`

Example: `{{template project-specs}}`
Args: `name` (positional; a file in `core/templates/` with or without extension; extensionless resolves to `.md`). Validation: file exists.
Renders as a reference to `content/templates/<file>` to copy and fill in.

### 3.8 `{{gate kind=<kind> [phase=N] [track=quick|deep] [validates=<agent>] [name=<s>] [agent=<agent>] [id=<id>] [requires_human=true]}}`

Example: `{{gate kind=phase validates=data-modeller}}` inside `phases_deep/phase-3.md` of `data-modeller`.
Args: `kind` required, enum `phase|final|execute|handoff|checkpoint|confirm`. `phase` and `track` default to the enclosing file's (required outside a phase file; mismatch with the file is an error). `agent` defaults to the enclosing agent. `validates=<agent>` must exist; not allowed on `checkpoint|confirm` (E11). `name` is required for `checkpoint|confirm` (they repeat within a phase), optional otherwise; `[a-z0-9-]+`. `id` overrides the derived id (rarely needed). `requires_human=true` (the only accepted value) passes `requires_human: true` to `gate_request`: the gate always needs a human confirmation, under every gate policy (`plan` never turns it into a notice, `phase` never auto-records it); the rendered text says so. Used for the AR Phase 3 adoption gate.
Gate ids (explicit `id=` too) must match `<agent>[-<mode>]-phase-<N>[.<name>]` (enforced by the compiler); the default id is `<agent>-phase-<N>`, or `<agent>-<track>-phase-<N>` for dual-track agents, with `.<name>` appended when `name` is given (e.g. `ml-engineer-phase-3.after-features`). Advancing kinds: `phase final execute handoff`; non-advancing: `checkpoint confirm`.
Compiles to runtime `gate_request(id, kind, phase, summary, record_ref, validates?, requires_human?)`. It is NOT a text fence. Rendered text tells the agent to: write the decisions to the record first, call the tool with a short `summary` and `record_ref` (the section written), stop and wait for the response, treat `already confirmed` as "continue", never approve or confirm its own gate, then follow the phase pointer returned. No `::GATE::` text is produced.

### 3.9 `{{auto_verify start tool_budget=<int> ttl=<seconds>}}` / `{{auto_verify end}}`

Example: `{{auto_verify start tool_budget=40 ttl=900}}`
Args: first positional `start|end`; `start` requires `tool_budget` (1-200) and `ttl` (seconds, 30-3600), the bounds of the runtime tool; `end` takes none.
Compiles to runtime `auto_verify_start(agent, phase, tool_budget, ttl_s)`: the macro's `ttl` is passed as the tool's `ttl_s` (agent and phase are the enclosing ones when known) and `auto_verify_end()`. Only read-only operations on the runtime allowlist are auto-approved. Gates always win.

### 3.10 `{{record.write section=<name> [file=<path>]}}`

Example: `{{record.write section="Phase 2 decisions"}}`
Args: `section` required; `file` optional (default `project-specs.md`). Binding job `record` from `shards.config.yaml` (default: a git file in the project output dir). Renders as "write the section to the project record through the record job, keep the reference as `record_ref`". No runtime tool; the agent uses the bound tool.

### 3.11 `{{tasks.create|update|list|get ...}}`

Example: `{{tasks.create title="Build staging models" owns="models/staging/" accept="dbt build passes"}}`
Args by verb: `create`: `title` required, `owns`, `accept` optional. `update`: `id` and `status` (`todo|doing|done|blocked`) required. `list`: `status` optional. `get`: `id` required. Any other verb is an error. Binding job `tasks`; renders as an instruction to use the task tracker bound in `shards.config.yaml`.

### 3.12 `{{knowledge.search query="..." [scope=<s>]}}`

Example: `{{knowledge.search query="grain of orders table"}}`
Args: `query` required; `scope` optional. Binding job `knowledge` (any bound MCP, never a Shards store). Renders as "search the knowledge source bound to the knowledge job; treat results as hints to verify".

### 3.13 `{{artifact.emit type=<type> path=<path> [meta="<k>=<v> ..."]}}`

Example: `{{artifact.emit type=report path=shards/churn/report.md}}`, `{{artifact.emit type=pr-review path=.shards/pr-review-<number>.json meta="title=PR #<number> pr=<number>"}}`
Args: `type` required (`[a-z][a-z0-9_-]*`), `path` required, `meta` optional: space-separated `key=value` pairs. An unquoted value runs up to the next ` key=`, so it may contain spaces; single-quote it (`note='a b=c'`) if it contains ` key=` text. When `core/schema/artifacts/<type>.schema.json` exists, `meta` is typed by it at build time: `integer`/`number`/`boolean` fields become JSON values (a `<placeholder>` renders unquoted for the agent to fill in), other values stay strings, and a missing `required` key or a non-numeric integer field is a build error.
Compiles to runtime `artifact_emit(type, path, meta)` with `meta` rendered as a JSON object (e.g. `meta={"title": "PR #<number>", "pr": <number>}`), which appends to `.shards/events.jsonl`.

### 3.14 `{{delegate [tasks=<path>] [max_parallel=<n>] [mode=parallel|sequential|inline]}}`

Example: `{{delegate tasks=shards/foo/tasks.yaml max_parallel=3}}`
Args: `tasks` (optional non-empty path hint, default `<output_dir>/tasks.yaml`), `max_parallel` (optional positive integer cap on concurrent workers), `mode` (optional `parallel|sequential|inline`; anything else is a validation error). No required args. Without `mode` the text follows the target's capability: claude and codex parallel (background subagents bounded by the host thread cap / Codex `max_threads`), skills sequential. `sequential` dispatches ONE ready task at a time; `inline` dispatches cards but does them in this session with no worker handoff. Every rendering carries the sequential and inline fallback sentences (see `docs/compat.md`, E12.8). A fallback is used ONLY when worker subagents genuinely cannot be spawned on the host: the agent names the reason in its report to its caller and adds a `Fallback: <sequential|inline> — <reason>` row to the `## Validation` Evidence table of project-specs.md; it never falls back silently, and cards, acceptance checks, `task_verify` calls and evidence rows stay identical. The text also says: if you are a workstream lead, pass the `scope` your lead contract gives you on every task tool call (see 3.15).
Validation: args only (the `protocols/plan_drift.md` path is referenced, not checked).
Compiles to the delegated build loop: `tasks_set` (rejects cycles, overlapping owned paths, missing acceptance checks), `task_dispatch` (ready tasks only, capped), hand each task card to a worker, `task_report` with each result, verify acceptance yourself and record it with `task_verify` (a task is done only through it; max 2 retries, then escalate), dispatch unblocked tasks. Workers hold no gates, never change the plan or delegate; deviations stop dependents and follow plan_drift. The phase gate is raised only when all tasks are done.

### 3.15 `{{lead <agent> [task="..."]}}`

Example: `{{lead data-scientist task="Own the churn_model workstream"}}`
Args: `agent` required, `task` optional text. Used by Syn PM mode to start a workstream's specialist as a *lead*: an isolated subagent that runs its own delegated build loop and its own same-specialist workers (Syn -> lead at depth 1 -> workers at depth 2). Workers never delegate.
Validation: the agent exists; its `activation` includes `consult` and `fanout_worker`; it has a `consult_entries.worker` entry. Anything else is a build error. The `protocols/lead_contract.md` path is referenced, not checked.
Compiles to text only (no runtime tool of its own): launch the agent as an isolated subagent whose prompt starts "Entry lead: read <content path>/protocols/lead_contract.md first, then follow your own phases as the lead", plus the task and the brief. The lead holds no gates and does not talk to the user; it runs its build phases through the delegated build loop passing `scope=<workstream dir>` on every `task_*` call, dispatches `<agent>` workers (entry worker) itself and returns the structured report the brief asks for. Independent leads are launched in parallel. Per target: claude runs subagent `<agent>` by name (single message for parallel leads); codex uses `spawn_agent` and states that this needs `agents.max_depth = 2`; skills uses an isolated skill invocation and states that, if the host cannot give the lead its own isolated workers, the lead uses the sequential/inline fallback and says so in its report and evidence table.

### 3.16 `{{jira_context}}`

Takes no arguments. Calls the target's `jira_context` tool for the Jira binding instructions, project settings and writeback flag used by issue intake and Epic Captain.

## 4. Runtime tools and bindings

Runtime tools referenced: `jira_context`, `activate`, `return`, `load_phase`, `gate_request`, `gate_advance`, `gate_confirm` (the last two are never emitted into agent text: the user side confirms), `auto_verify_start`, `auto_verify_end`, `artifact_emit`, `copy_report` (E6.8, used by bindings after an external write), `fanout_start` (E5.9), `tasks_set`, `task_dispatch`, `task_report`, `task_status`, `task_verify` (E12, via `delegate`). Binding jobs (from `shards.config.yaml`): `record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`; macros render the job name, not a concrete tool.

## 5. Rendering table

Tool-name prefix by target (`CLAUDE_TOOL_PREFIX` / `CODEX_TOOL_PREFIX` in `build/render.js`): **claude** `mcp__plugin_shards_shards__<tool>` (the real name inside a Claude Code plugin: `mcp__plugin_<plugin>_<server>__<tool>`); **codex** `mcp__shards__<tool>` (the name Codex 0.169 exposes for the `shards` MCP server's tools); **skills** bare `<tool>`.

| Macro | claude | codex | skills |
|---|---|---|---|
| switch | call `mcp__plugin_shards_shards__activate(agent="a", mode="switch")`, adopt the persona it returns | same with `shards.activate` | same with `activate` |
| consult | run subagent `a` (plugin agent `agents/a.md`, via the Agent tool, by name); the prompt starts with "Entry `e`: read `${CLAUDE_PLUGIN_ROOT}/content/agents/a/<file>` first" | spawn the Codex agent `a` (`.codex/agents/a.toml`) with a spawn_agent-style call; the message starts with "Entry `e`: read `content/agents/a/<file>` first" | invoke skill `a` in an isolated context if the host has one, else call `activate(agent="a", mode="consult")` and follow `content/agents/a/<file>`, then `return` |
| fanout | call `mcp__plugin_shards_shards__fanout_start`, then launch one subagent `a` per slice in a single message | `shards.fanout_start`, then one `spawn_agent` per slice in parallel | `fanout_start`, then one isolated skill invocation per slice |
| delegate | `tasks_set`, `task_dispatch`, `task_report`, `task_status` with the claude prefix; workers are the specialist's own subagents by name, prompt starts "Entry worker: read ..." | same with `shards.` prefix; workers via `spawn_agent` | bare tool names; workers via isolated skill invocation, else inline under the same owned-path rule |
| lead | run subagent `a` by name as the workstream lead; prompt starts "Entry lead: read `${CLAUDE_PLUGIN_ROOT}/content/protocols/lead_contract.md` first, ..."; leads launched in a single message; `scope=<workstream dir>` on every `task_*` call | `spawn_agent` the Codex agent `a`; needs `agents.max_depth = 2` | isolated skill invocation of `a`; lead falls back to sequential/inline workers if none can be isolated, and says so |
| return | `mcp__plugin_shards_shards__return(to?)` | `shards.return(to?)` | `return(to?)` |
| phase | `mcp__plugin_shards_shards__load_phase(agent, n, track?)` + path | `shards.load_phase(...)` | `load_phase(...)` |
| protocol / template | read `${CLAUDE_PLUGIN_ROOT}/content/protocols/<name>.md` (templates likewise) | read `content/protocols/<name>.md` | read `content/protocols/<name>.md` |
| gate | `mcp__plugin_shards_shards__gate_request(id, kind, phase, summary, record_ref, validates?, requires_human?)` | `shards.gate_request(...)` | `gate_request(...)` |
| auto_verify | `mcp__plugin_shards_shards__auto_verify_start/_end` | `shards.auto_verify_start/_end` | `auto_verify_start/_end` |
| artifact.emit | `mcp__plugin_shards_shards__artifact_emit(type, path, meta)` | `shards.artifact_emit(...)` | `artifact_emit(...)` |
| record / tasks / knowledge | binding job instruction (identical text on every target) | same | same |

Design choice, consult on Claude Code: a named subagent invocation ("run subagent `a`") is used rather than a skill invocation or a `Task(subagent_type=...)` literal. Subagents give an isolated context and cannot hold gates (D2), and no deprecated call syntax is baked into text. The instruction deliberately names the tool role, not the literal API, so it survives host renames.

## 6. Output layout (per target, deterministic, no timestamps)

```
<out>/content/agents/<id>/**   rendered AGENT.md, phases*, modes, other .md (agent.yaml not copied)
<out>/content/protocols/*.md   rendered
<out>/content/templates/*      rendered (.md) or verbatim (.json)
<out>/size-report.json
claude : agents/<id>.md  skills/<id>/SKILL.md  skills/agents/SKILL.md
         (--dev: .shards-dev, .claude-plugin/plugin.json, .mcp.json, hooks/hooks.json)
codex  : .codex/agents/<id>.toml  .codex/shards-<id>.config.toml  .codex/config.toml  skills/<id>/SKILL.md  skills/agents/SKILL.md
         .codex-plugin/plugin.json  hooks/hooks.json  (--dev: .shards-dev; .codex/config.toml also gets the [mcp_servers.shards] block)
skills : skills/<id>/SKILL.md  skills/agents/SKILL.md
```

All content paths in rendered text are relative to the package root (`<out>`); claude prefixes `${CLAUDE_PLUGIN_ROOT}/`. No `model` key is ever emitted (D7). Agent frontmatter keeps `name`, `description` (from agent.yaml) and, for claude, `tools`, mapped by `build/host-tools.js` from the host-neutral `capabilities` list in agent.yaml (`read`, `write`, `edit`, `search`, `shell`, `notebook`, `delegate`, `web`, `skill`; absent means read-only), minus `delegate`/`Task` (consults cannot nest; TODO(E5.3)). AGENT.md frontmatter must not carry a `tools:` line (`--strict` and `npm run validate:agents` reject it).

`skills/agents/SKILL.md` is a plain skill (`/shards:agents` on Claude, `$agents` on Codex) that calls the runtime `list_agents` tool and prints a table; emitted in every build, and `agents` is not a valid agent id. `--dev` writes absolute paths to this repo's `runtime/server.js` and `hooks/` (edits apply without a rebuild) and a `.shards-dev` marker that `shards uninstall-dev` requires before removing a directory.
