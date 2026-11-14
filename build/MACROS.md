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
Compiles to runtime `fanout_start(agent, slices)` (E5.9; leases) then one parallel worker per slice, then collect results. Workers never hold gates, change the plan or delegate.

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

### 3.8 `{{gate kind=<kind> [phase=N] [track=quick|deep] [validates=<agent>] [name=<s>] [agent=<agent>] [id=<id>]}}`

Example: `{{gate kind=phase validates=data-modeller}}` inside `phases_deep/phase-3.md` of `data-modeller`.
Args: `kind` required, enum `phase|final|execute|handoff|checkpoint|confirm`. `phase` and `track` default to the enclosing file's (required outside a phase file; mismatch with the file is an error). `agent` defaults to the enclosing agent. `validates=<agent>` must exist; not allowed on `checkpoint|confirm` (E11). `name` is required for `checkpoint|confirm` (they repeat within a phase), optional otherwise; `[a-z0-9-]+`. `id` overrides the derived id (rarely needed).
Gate id: `<agent>-phase-<N>`, or `<agent>-<track>-phase-<N>` for dual-track agents, with `.<name>` appended when `name` is given (e.g. `ml-engineer-phase-3.after-features`). Advancing kinds: `phase final execute handoff`; non-advancing: `checkpoint confirm`.
Compiles to runtime `gate_request(id, kind, phase, summary, record_ref, validates?)`. It is NOT a text fence. Rendered text tells the agent to: write the decisions to the record first, call the tool with a short `summary` and `record_ref` (the section written), stop and wait for the response, treat `already confirmed` as "continue", never approve or confirm its own gate, then follow the phase pointer returned. No `::GATE::` text is produced.

### 3.9 `{{auto_verify start tool_budget=<int> ttl=<seconds>}}` / `{{auto_verify end}}`

Example: `{{auto_verify start tool_budget=40 ttl=900}}`
Args: first positional `start|end`; `start` requires `tool_budget` and `ttl` (positive integers); `end` takes none.
Compiles to runtime `auto_verify_start(agent, phase, tool_budget, ttl)` (agent and phase are the enclosing ones when known) and `auto_verify_end()`. Only read-only operations on the runtime allowlist are auto-approved. Gates always win.

### 3.10 `{{record.write section=<name> [file=<path>]}}`

Example: `{{record.write section="Phase 2 decisions"}}`
Args: `section` required; `file` optional (default `project-specs.md`). Binding job `record` from `shards.config.yaml` (default: a git file in the project output dir). Renders as "write the section to the project record through the record job, keep the reference as `record_ref`". No runtime tool; the agent uses the bound tool.

### 3.11 `{{tasks.create|update|list|get ...}}`

Example: `{{tasks.create title="Build staging models" owns="models/staging/" accept="dbt build passes"}}`
Args by verb: `create`: `title` required, `owns`, `accept` optional. `update`: `id` and `status` (`todo|doing|done|blocked`) required. `list`: `status` optional. `get`: `id` required. Any other verb is an error. Binding job `tasks`; renders as an instruction to use the task tracker bound in `shards.config.yaml`.

### 3.12 `{{knowledge.search query="..." [scope=<s>]}}`

Example: `{{knowledge.search query="grain of orders table"}}`
Args: `query` required; `scope` optional. Binding job `knowledge` (any bound MCP, never a Shards store). Renders as "search the knowledge source bound to the knowledge job; treat results as hints to verify".

### 3.13 `{{artifact.emit type=<type> path=<path> [meta=<text>]}}`

Example: `{{artifact.emit type=report path=analysis/churn/report.md}}`
Args: `type` required (`[a-z][a-z0-9_-]*`), `path` required, `meta` optional.
Compiles to runtime `artifact_emit(type, path, meta)`, which appends to `.shards/events.jsonl`.

## 4. Runtime tools and bindings

Runtime tools referenced: `activate`, `return`, `load_phase`, `gate_request`, `gate_advance`, `gate_confirm` (the last two are never emitted into agent text: the user side confirms), `auto_verify_start`, `auto_verify_end`, `artifact_emit`, `fanout_start` (E5.9). Binding jobs (from `shards.config.yaml`): `record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`; macros render the job name, not a concrete tool.

## 5. Rendering table

Tool-name prefix by target (`CLAUDE_TOOL_PREFIX` / `CODEX_TOOL_PREFIX` in `build/render.js`): **claude** `mcp__plugin_shards_shards__<tool>` (the real name inside a Claude Code plugin: `mcp__plugin_<plugin>_<server>__<tool>`); **codex** `shards.<tool>` (the `shards` MCP server's tool); **skills** bare `<tool>`.

| Macro | claude | codex | skills |
|---|---|---|---|
| switch | call `mcp__plugin_shards_shards__activate(agent="a", mode="switch")`, adopt the persona it returns | same with `shards.activate` | same with `activate` |
| consult | run subagent `a` (plugin agent `agents/a.md`, via the Agent tool, by name); the prompt starts with "Entry `e`: read `${CLAUDE_PLUGIN_ROOT}/content/agents/a/<file>` first" | spawn the Codex agent `a` (`.codex/agents/a.toml`) with a spawn_agent-style call; the message starts with "Entry `e`: read `content/agents/a/<file>` first" | invoke skill `a` in an isolated context if the host has one, else call `activate(agent="a", mode="consult")` and follow `content/agents/a/<file>`, then `return` |
| fanout | call `mcp__plugin_shards_shards__fanout_start`, then launch one subagent `a` per slice in a single message | `shards.fanout_start`, then one `spawn_agent` per slice in parallel | `fanout_start`, then one isolated skill invocation per slice |
| return | `mcp__plugin_shards_shards__return(to?)` | `shards.return(to?)` | `return(to?)` |
| phase | `mcp__plugin_shards_shards__load_phase(agent, n, track?)` + path | `shards.load_phase(...)` | `load_phase(...)` |
| protocol / template | read `${CLAUDE_PLUGIN_ROOT}/content/protocols/<name>.md` (templates likewise) | read `content/protocols/<name>.md` | read `content/protocols/<name>.md` |
| gate | `mcp__plugin_shards_shards__gate_request(id, kind, phase, summary, record_ref, validates?)` | `shards.gate_request(...)` | `gate_request(...)` |
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
codex  : .codex/agents/<id>.toml  skills/<id>/SKILL.md  skills/agents/SKILL.md
         (--dev: .shards-dev, .codex-plugin/plugin.json, .codex/config.toml, .codex/hooks.json)
skills : skills/<id>/SKILL.md  skills/agents/SKILL.md
```

All content paths in rendered text are relative to the package root (`<out>`); claude prefixes `${CLAUDE_PLUGIN_ROOT}/`. No `model` key is ever emitted (D7). Agent frontmatter keeps `name`, `description` (from agent.yaml) and, for claude, `tools` from the original AGENT.md (minus `Task`: consults cannot nest; TODO(E5.3)).

`skills/agents/SKILL.md` is a plain skill (`/shards:agents` on Claude, `$agents` on Codex) that calls the runtime `list_agents` tool and prints a table; emitted in every build, and `agents` is not a valid agent id. `--dev` writes absolute paths to this repo's `runtime/server.js` and `hooks/` (edits apply without a rebuild) and a `.shards-dev` marker that `shards uninstall-dev` requires before removing a directory.
