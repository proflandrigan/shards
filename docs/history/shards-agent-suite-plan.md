# Shards → Pure Agent Suite: Migration Plan (v4)

**Source repo:** `proflandrigan/shards` (analysed at `8e24069`, 10 Sep 2026)
**Revision:** v4, after three independent review rounds (see the change log at the end).

**Goal:** Fork Shards into a host-agnostic agent suite that runs natively in Claude Code, OpenAI Codex, and agentic IDEs such as T3 Code, with:

1. Agents that are real agents, not tied to the Shards UI.
2. Reliable activation, either with a `/` or `$` command or by asking an agent to bring in another agent.
3. No built-in Knowledge Ledger. Decisions, tasks, knowledge and artifacts go to git, Atlassian (Jira/Confluence), Google Drive/Slides, or any other MCP-connected tool.
4. No hardcoded models. Agents use the session's model.
5. Gates that work reliably in long sessions. Tool calls replace the `::GATE::` text-parsing hooks.
6. Build phases delegate. Each specialist breaks the approved plan into discrete tasks, hands each to a worker subagent, and checks the results against the plan.

---

## Background: what the audit found

All counts come from `src/` at `8e24069`. E0.2 adds a script that reproduces each one with a fixed grep scope.

| Area | Finding | Size |
|---|---|---|
| Activation | Slash commands tell the model to "read `.claude/agents/X.md` and become it". Syn hands off by asking the user to run `/compact`, then takes on the specialist in the same session. This depends entirely on the model following instructions. | 23 commands, 15 agents |
| Agents called as reviewers | **All 15 agents** are called through `Task` by other agents. Syn is the most called (42 calls: final sign-off, diverge arbiter). Only 7 have a `service_mode.md`; the rest are reached through `review.md`/`advise.md` or ad-hoc prompts | 236 calls |
| Fan-out modes | PM mode, panel-review fix groups, swarm, diverge and brainstorm launch several specialists in parallel through `Task` | 5 modes |
| UI coupling | Agents check `cat .shards/ui.port`, then call `node .shards/ui/ui-push.js` (10 panel types plus `close`). There are 9 `*_ui_mode.md` variants. The notebook kernel and session index live in `src/ui/`. The installer wires relay hooks into `.claude/settings.json`. | ~34–39 files (E0.2 sets the exact figure) |
| Claude Code lock-in | `subagent_type` calls, `.claude/` references and `/compact` steps throughout. Gates are enforced by parsing Claude Code's transcript file. | 236 / 468 / 46 |
| Text-marker protocols | `::GATE::` fences (kinds in use: phase 198, final 69, checkpoint 26, execute 17, confirm 3; `handoff` is defined but never used) and `::AUTO-VERIFY::` / `::ENDAUTO::` markers | 317 gate occurrences; 10 auto-verify opens, 12 closes |
| Knowledge Ledger | Retrieval, checkpoint and harvest protocols, Syn's knowledge mode, `/knowledge`, `.shards/knowledge/`, and the knowledge-map UI panel | 89 files, ~870 lines of protocol |
| Templates | 11 templates exist; 4 referenced templates are **missing** (`panel-report`, `panel-sequencing-plan`, `presentation-spec`, `research-brief`) | 11 present, 4 missing |
| Models | `model: opus-4.8` hardcoded in every agent | 15 files |
| Hidden limit | Claude Code subagents cannot spawn subagents. Today it works only because specialists run in the main session. Researcher → data-modeller is already a nested call between reviewers. | — |

## Key decisions

- **D1. Three layers.** A tool-neutral agent core, a small runtime (MCP server), and generated packages for each tool. The UI becomes an optional add-on.
- **D2. Ways to activate an agent:**
  - **Switch ("become"):** the agent takes over the main session, pushed onto a stack.
  - **Consult ("ask"):** the agent runs as a subagent and returns a verdict.
  - **Fan-out:** the orchestrator launches parallel workers under a lease.
  - An agent may support all three. Gates belong to the **switch frame** that opened them. Consult and fan-out workers never hold gates.
  - Leaving a frame requires resolving its pending gate, or suspending it **with the same human proof as a confirmation**. Sessions can't end with suspended gates.
  - `load_phase` refuses to serve phase *n* until the gate required for phase *n − 1* is confirmed. That makes gates hold on every host, even with no hooks.
- **D3. Shards owns no storage.** Agents work with jobs (`record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`). Each project points those jobs at real tools in `shards.config.yaml`, which is created automatically with git-only defaults. That file is the single source of truth; plugin `userConfig` only pre-fills it.
- **D4. Shards never sits in the middle of other MCP servers.**
  - Sign-in for Jira, Confluence, Drive and Slides stays in Claude Code or Codex.
  - Every external write and every lookup of a third-party tool is done by the agent through the host's MCP (skills), and the agent reports the result to the runtime.
  - The `shards` CLI and runtime never hold third-party credentials.
- **D5. Git is the source of truth, without taking over the user's branches.**
  - A gate confirmation stages and commits **only the project's output paths** on the **current** branch, with `Shards-Gate:` trailers.
  - Commit outcome is `committed` or `commit_pending(reason)`. **The gate is confirmed in the runtime either way**, and a pending commit is retried.
  - With `git.commit: false`, a detached HEAD, or no repo, the gate is recorded under `refs/shards/*` / git notes, or in `.shards/state`.
  - Copies to Confluence, Jira and Drive go one way.
- **D6. No T3-specific code.** T3 Code runs the real Claude Code and Codex. Host behavior, including hooks under T3, is checked in a spike (E0.6). A project-scope install is the fallback.
- **D7. No model names.** Agents use the session's model. Tier hints take effect only when the user maps them.
- **D8. Gates are tool calls with state, never parsed text. The agent can never approve its own gate.**
  - Every confirmation, and every suspension, is tied to a real human action in this session:
    - an elicitation response;
    - a host approval prompt that was **actually shown at call time** and can't be pre-allowed;
    - the **whole, first, previously unused** user message after the gate was requested.
  - When the runtime can't prove that, it refuses and says how to confirm.
  - Residual risk: in tier 3 the agent still decides between `confirmed` and `changes_requested`. The user's full reply is stored with the gate for audit (ADR).
- **D9. Build phases are led, not done alone.**
  - In build and execute phases, the specialist stays in the main session as the **lead**. It breaks the approved plan into **discrete tasks**, each with owned paths and an acceptance check. It **delegates each task to a worker subagent** and verifies every result against the plan.
  - Workers never hold gates, never change the plan, and never delegate further. Gates, plan changes and the user conversation stay with the lead.
  - This keeps the main session's context small, which also cuts the compaction that drove gate misfires.

## Target repo layout

```
shards/
  core/
    agents/<id>/agent.yaml      # id, description, role, activation[], consult_entries{review,advise,service,final_review}, reviewers, output_dir, model_tier?, jobs
    agents/<id>/AGENT.md        # persona + Phase 0 (+ a ≤15-line persona summary for re-grounding)
    agents/<id>/phases/…        # progressive phases (kept)
    agents/<id>/modes/…         # review, advise, update, service, …
    agents/syn/modes/…          # final_review, arbiter, pm, panel_review, brainstorm, fixer, diff, code_review, free_form, slides, pr_review, notebook_walkthrough
    protocols/                  # shared: sources, behavioral_rules, engineering_guidelines, intent_discovery, incremental_testing, swarm, diverge, AR, validation, …
    templates/                  # 11 existing + 4 restored (or dropped) in E1.11
  bindings/                     # git.md, confluence.md, jira.md, drive.md, slides.md, … (one file per tool)
  runtime/                      # shards-mcp: registry, sessions, phases, gates, auto-verify, fan-out leases, events, notebook
  cli/                          # `shards` CLI (bin of @proflandrigan/shards v2)
  hooks/                        # thin shims per host (recorder, session handshake, re-ground, enforcement)
  build/                        # compiler: shards build --target claude|codex|skills [--dev]
  adapters/                     # generated output (release artifacts)
    claude-code/  codex/  agent-skills/
  packages/studio/              # former web UI + code intelligence, optional
  test/
```

**Packages:** `@proflandrigan/shards` v2 provides the `shards` CLI and replaces the v1 installer under the same name. `@proflandrigan/shards-mcp` is the runtime. `@proflandrigan/shards-studio` is the optional UI. Commands are always written with the package scope (`npx @proflandrigan/shards …`); the unscoped `shards` name on npm belongs to an unrelated package.

---

## Execution plan

Do the stages in order. A stage starts only when the previous stage's **Done when** is met. Inside a stage, the **tracks run in parallel**, and the tasks within a track run top to bottom. Every task appears exactly once. Full details for each ID are in [Task details](#task-details-by-epic).

**Milestones:** Stages 1–4 = **A · Core** · Stage 5 = **B · Separated** · Stage 6 = **C · Connected** · Stages 7–8 = **D · Shipped**

**Recommended first end-to-end slice:** Syn + Data Analyst, git binding, gate tiers 1 and 3, through the dev install on Claude Code and Codex. It falls out of Stages 1–5 if those two agents go first in every track.

### Stage 1 · Setup (Milestone A)

**First (alone):** E0.1 fork, tag `v-legacy`, `next` branch

**Then in parallel:**

| Track | Tasks in order |
|---|---|
| 1 · Baseline | E0.2 coupling report → E0.3 CI ratchet |
| 2 · Host spike | E0.6 host capability spike |
| 3 · Test infrastructure | E0.7 sandbox accounts, CI runners, API budget |
| 4 · Golden sessions | E0.4 reference sessions + scoring guide |
| 5 · Decisions | E0.5 ADRs D1–D8 |

**Done when:** coupling baseline in CI; spike findings in `docs/compat.md`; golden sessions scored; sandbox accounts live.

### Stage 2 · Foundations (Milestone A)

**First (alone):** E1.1 `agent.yaml` schema

**Then in parallel:**

| Track | Tasks in order |
|---|---|
| 1 · Core content | E1.2 move agents, modes, protocols, templates into `core/` → E1.11 restore or drop the 4 missing templates |
| 2 · Compiler | E1.3 macro spec → E1.8 `shards build` compiler |
| 3 · Runtime base | E2.1 MCP server + state header → E2.5 keep validation/allowlist/sql-guard libraries → E2.9 `artifact_emit` |
| 4 · Config | E6.1 `shards.config.yaml` + zero-config defaults → E6.2 binding-file format |

**Done when:** `core/` holds every file from the inventory; the compiler runs on the moved files; `shards-mcp` starts on all three operating systems.

### Stage 3 · Rewrite and sessions (Milestone A)

| Track | Tasks in order |
|---|---|
| 1 · Codemods (one track, because they edit the same files) | E1.4 `subagent_type` → `{{consult/switch/fanout}}` → E1.5 `.claude/` paths → macros → E1.6 remove `/compact` → E1.7 remove model pins |
| 2 · Sessions | E11.0 hook shims → E2.11 session correlation → E2.2 registry and agent stack |

**Done when:** E0.2 shows 0 `subagent_type`, `.claude/`, `/compact` and model pins in `core/`; two concurrent sessions are isolated.

### Stage 4 · Gates core and dev install (Milestone A)

| Track | Tasks in order |
|---|---|
| 1 · Gates | E6.3 git binding **together with** E11.1 gate state machine → E11.2 `gate_request` → E2.3 `load_phase` with gate enforcement |
| 2 · Dev install | E1.10 dev install with shims → E2.12 `shards doctor` (CLI) → E2.10 publish to `next` |

**Done when (Milestone A exit):** both hosts load the dev build; gates are tool calls and `load_phase` enforces them; all E6.3 git fixtures pass; `next` is published.

### Stage 5 · Separation, activation and gates (Milestone B)

The widest stage. Six tracks in parallel, then a joint step and a final pair of tracks.

| Track | Tasks in order |
|---|---|
| 1 · Gates | E7.5 Claude Code hooks + E8.3 Codex MCP registration + E8.4 Codex hooks → E11.3 tier 1 elicitation → E11.4 tier 2 host prompt → E11.5 tier 3 chat reply → E11.7 re-grounding → E11.8 gate policies → E11.9 replace the 317 gate fences → E11.12 auto-verify as a tool → E11.13 operator CLI |
| 2 · Activation | E5.1 activation modes → E5.2 switch skills → E5.3 subagent definitions → E8.7 Codex switch mechanics → E5.4 plain-language router → E5.5 return and stack → E5.6 nesting lint → E5.7 default agent → E5.8 `/shards agents` |
| 3 · UI separation | E3.1 artifact contract → E3.2 delete `ui_mode` files → E3.3 remove `ui-push` calls → E3.5 drop relay hooks → E3.4 move the UI to Studio → E2.8 UI-only modules → E3.6 retire `/shards-ui` and `/shards-guide` |
| 4 · Ledger removal | E4.1 `sources.md` protocol → E4.2 replace ledger references → E4.3 remove knowledge mode → E4.4 remove ledger setup → E4.5a ledger export |
| 5 · Runtime extras | E2.6 sessions and resume → E2.7 notebook kernel → E1.9 AGENT_REPORT fixes |
| 6 · Delegation design | E12.1 task manifest + runtime tools → E12.2 worker contract → E12.6 plan-drift rule |

**Then, joint (needs Tracks 1, 2 and 6):** E5.9 fan-out leases **together with** E11.6 enforcement

**Then in parallel:**

| Track | Tasks in order |
|---|---|
| A · Gate fixtures | E11.10 long-session fixtures |
| B · Delegated builds | E12.3 plan → tasks step in planning phases → E12.4 rewrite build/execute phases → E12.5 lead verification and retry → E12.8 host fallbacks → E12.9 delegated-build golden runs |

**Shared-file warning:** E11.9, E3.2/E3.3, E4.2 and E12.3/E12.4 all edit the same phase files. Split them by agent, or land them in the order E11.9 → E3.2/E3.3 → E4.2 → E12.3/E12.4 within each agent, to avoid merge conflicts.

**Done when (Milestone B exit):** E0.2 shows 0 UI, ledger, fence and `subagent_type` coupling in `core/`; activation, fan-out and gates pass the E11.10 fixtures on both hosts; the delegated-build golden runs (E12.9) pass on both hosts.

### Stage 6 · Integrations (Milestone C)

**First (alone):** E6.11 guardrails (no external write without a gate or a confirmation)

**Then in parallel:**

| Track | Tasks in order |
|---|---|
| 1 · Atlassian | E6.4 Confluence → E6.5 Jira → E12.7 build tasks as Jira sub-tasks → E4.5b publish knowledge to Confluence |
| 2 · Google | E6.6 Drive + Slides |
| 3 · Code review | E6.7 GitHub + Bitbucket |
| 4 · Copy pipeline | E6.8 copy reporting and automatic replay → E6.9 `/shards:sync` |
| 5 · Onboarding | E6.10 `shards connect` + backfill → E2.12 `/shards:doctor` skill → E6.12 extra bindings |

**Done when (Milestone C exit):** Atlassian, Drive and Slides copies work in the sandbox; the offline queue replays by itself; a git-only project connects to Atlassian with backfill.

### Stage 7 · Packaging, migration and docs (Milestone D)

**Overlap:** Stage 7 can start once Stage 5 is done, alongside Stage 6. Only the utility skills in E7.2 and E8.1 (connect, sync, doctor, publish-knowledge) wait for Stage 6.

| Track | Tasks in order |
|---|---|
| 1 · Claude Code | E7.1 `plugin.json` → E7.4 `.mcp.json` → E7.2 skills → E7.3 subagents → E7.6 marketplace → E7.7 default agent → E7.8 CLAUDE.md conventions → E7.9 permission presets |
| 2 · Codex | E8.1 plugin + skills → E8.2 agent TOMLs → E8.5 `AGENTS.md` fragment → E8.6 depth/thread settings |
| 3 · Other hosts | E9.1 project-scope install → E9.2 generic Agent Skills target |
| 4 · Migration | E11.11 gate-history import → E10.1 `shards migrate` |
| 5 · Docs | E10.2 developer guide + repo `CLAUDE.md` → E10.3 README quick starts |
| 6 · CI | E9.4 nightly headless runs on 3 operating systems |

**Done when:** both packages install from a clean machine; migration of the legacy fixture is clean; docs describe v2.

### Stage 8 · Verify and release (Milestone D)

Strictly in order:

1. E9.3 full test matrix (T3 runs are manual against the checklist)
2. E9.5 record upstream gaps and workarounds in `docs/compat.md`
3. E10.4 release workflow + `npm pack` check
4. E10.5 publish v2 to `latest`, deprecate the v1 commands

**Done when (Milestone D exit):** the test matrix meets the E9.3 rules; the E11.10 fixtures pass on the packaged plugins; `latest` points to v2.

---

## Task details (by epic)

Effort: **S** ≤ 1 day, **M** 2–4 days, **L** 1–2 weeks. Steps that depend on model behavior are judged by pass rate across repeated runs, as noted. **Milestone** is shown per task as A, B, C or D.

### E0 · Fork, baseline and spikes

Goal: a safe starting point, measurable targets, and checked assumptions.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E0.1 | Fork, tag `v-legacy` at HEAD, set up a `next` branch | S | A | Tag pushed; `main` protected |
| E0.2 | `scripts/coupling-report.js` with a **fixed pattern and scope per metric**: UI refs, `.claude/` refs, `subagent_type`, `/compact`, `::GATE::`, `::AUTO-VERIFY::`, ledger refs, model pins in frontmatter, missing template links | S | A | Reproduces the audit table; output is stable from run to run |
| E0.3 | CI ratchet: coupling counts can only go down | S | A | A PR that adds coupling fails |
| E0.4 | Reference sessions (Syn → Data Analyst quick, AE deep, PR review, full Data Science deep study, PM with 2 workstreams) with a scoring guide (artifacts produced, gates hit, correct routing) | M | A | Stored in `test/golden/`; the legacy build scores ≥ 90% on its own guide across 3 runs |
| E0.5 | ADRs for D1–D8; move `feedback_and_ideas/AGENT_REPORT.md` and `.bug-hunt/` to `docs/history/` | S | A | `docs/adr/0001–0008` merged |
| E0.6 | **Host capability spike.** One-page findings for each item. **Claude Code:** elicitation; `--agent`; plugin `settings.agent`; hook fields `session_id`, `agent_id`, `permission_mode`; SessionStart `compact`. **Codex:** per-tool `approval_mode`; elicitation; named custom-agent spawns; `max_depth`; whether a skill can take over the main session; hook events (SessionStart incl. compact source, UserPromptSubmit, PreToolUse payload fields, permission/approval mode). **T3 Code (both providers):** whether host hooks fire; display of elicitation and approval prompts; discovery of plugin and project skills; whether one MCP process runs per thread. **Windows:** hook shells, paths, Node/Python presence | M | A | Findings recorded in `docs/compat.md`; every failing item creates a follow-up task or risk entry before Milestone B starts |
| E0.7 | **Test accounts and CI infrastructure:**<br>• sandbox Atlassian site (Jira project and Confluence space) and Google Workspace domain (Drive and Slides), with MCP sign-in<br>• CI secrets, including how long refresh tokens last before they expire<br>• signed-in Claude Code and Codex on Linux, macOS and Windows runners<br>• an API budget for nightly runs<br>• a named owner for each account | S | A | Every external dependency of a done-when criterion is listed in `docs/test-infra.md` with an owner and a renewal date |

### E1 · Agent core and build compiler

Goal: write each agent once and generate every tool's package from it.
Depends on: E0.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E1.1 | `agent.yaml` schema: id, display name, description, role `orchestrator\|specialist\|reviewer`, `activation: [switch, consult, fanout_worker]`, `consult_entries: {review?, advise?, service?, final_review?, arbiter?, worker?}`, reviewers, `output_dir` (created on first activation; also the git commit path list for E6.3), optional `model_tier`, jobs | S | A | JSON Schema in CI; all 15 agents validate, including Syn's `final_review` and `arbiter` entries |
| E1.2 | Move into `core/`: the 15 agents (AGENT.md, phases, modes); **all** Syn modes (final_review, arbiter, pm, panel_review, brainstorm, fixer, diff, code_review, free_form, slides, pr_review, notebook_walkthrough; knowledge → deleted in E4); all `shared/` protocols (behavioral_rules, engineering_guidelines, intent_discovery, incremental_testing, validation, experiment_versioning, join_path, swarm, diverge, autonomous_research, auto_verify, reviewer_verdict, goal_mode → merged in E11.8, notebook_walkthrough); the 11 templates; a ≤ 15-line persona summary per agent | M | A | An inventory checklist generated from `find src/agents src/templates` shows every file mapped |
| E1.3 | Template macros: `{{switch <agent>}}`, `{{consult <agent> entry=<review\|advise\|service\|final_review\|arbiter>}}`, `{{fanout <agent> slices=…}}`, `{{return [to=<agent>]}}`, `{{phase N}}`, `{{protocol <name>}}`, `{{template <name>}}`, `{{gate kind=… phase=… validates=…}}`, `{{auto_verify …}}`, `{{record.write …}}`, `{{tasks.*}}`, `{{knowledge.search …}}`, `{{artifact.emit …}}` (→ runtime `artifact_emit`) | M | A | Macro spec with one example each and the runtime tool or binding it compiles to |
| E1.4 | Codemod: the 236 `subagent_type` calls become `{{consult … entry=…}}`, `{{switch}}` or `{{fanout}}`, choosing the entry from the calling context (final sign-off → `final_review`, diverge convergence → `arbiter`, review checkpoints → `review`/`service`) | M | A | 0 `subagent_type` in `core/`; every target agent and entry exists (build check) |
| E1.5 | Codemod: the 468 `.claude/` references become `{{phase}}`, `{{protocol}}` or `{{template}}` | M | A | 0 `.claude/` refs in `core/` |
| E1.6 | Remove the `/compact` persona-transfer steps (replaced by switch in E5) | S | A | 0 `/compact` refs in `core/` |
| E1.7 | Remove every `model:` pin. Agents use the session's model (Claude Code `model: inherit` or no field; Codex TOML no `model` key). `model_tier` takes effect only if the user maps tiers in `shards.config.yaml` | S | A | Lint over frontmatter, `agent.yaml` and generated manifests finds no literal model ID |
| E1.8 | `shards build --target <claude\|codex\|skills>` compiler: expand macros, emit files, check links, report prompt size per target | L | A | All three targets build; broken macros or links fail; size report in CI |
| E1.9 | Fold in the `AGENT_REPORT.md` fixes that are still open (each phase file loaded once, shared Syn-review resolution, de-duplicated "read project-specs" steps) | M | B | Each finding is either closed with a test or golden check, or marked "won't fix" in the ADR log |
| E1.10 | **Dev install:** `shards build --target X --dev` plus `claude --plugin-dir` / Codex local plugin path, so Milestone B tests run against real hosts before packaging is polished | M | A | The dev build emits a minimal `plugin.json`, a `.mcp.json` / Codex MCP entry and a `hooks.json` with the E11.0 shims for both hosts. Both hosts load it; `/shards:agents` and `$agents` respond; the shims write runtime state |
| E1.11 | Restore or drop the 4 missing templates (`panel-report`, `panel-sequencing-plan`, `presentation-spec`, `research-brief`) and fix the references in the repo's CLAUDE.md | S | A | Link check passes; references match files |

### E2 · Runtime (`shards-mcp`) and CLI

Goal: shared state and logic every tool reaches through MCP; a CLI for operators.
Depends on: E1.1.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E2.1 | MCP server over stdio (Node 18+): tool registry, config loading (creates `shards.config.yaml` with git-only defaults on first use), state under `.shards/state/` with file locks. **Every tool response carries a short state header** (≤ 60 tokens: agent, phase, pending gate id, queued copies count, state version). The queue count stays 0 until E6.8 (Milestone C). The full re-ground (persona summary, confirmed gates) is sent only on `activate`, `load_phase`, SessionStart `compact`, or when the state version changes. The header can be out of date between shards tool calls | M | A | `shards-mcp` starts; `tools/list` works on macOS, Linux and Windows; header ≤ 60 tokens on every response (test) |
| E2.2 | Registry tools: `list_agents`, `activate(agent, mode)`, `return(to?)`, `active()`, with a stack of frames per session. Each frame owns its gates (D2) | M | A | Activation and return work per session; `return(to=syn)` pops several levels |
| E2.3 | `load_phase(agent, n, track?)`: serves rendered phase content plus the full re-ground. **It refuses phase n if the policy-required gate for phase n − 1 isn't confirmed.** This is the gate enforcement that works on every host, with or without hooks | S | A | Phases load in Claude Code and Codex; a test calling `load_phase(n+1)` with a pending gate is refused |
| E2.4 | Gate state machine and tools: see **E11** | — | — | — |
| E2.5 | Keep `validation.js`, `auto-allowlist.js` and `sql-guard.js` as runtime libraries for E11.2 and E11.12 | S | A | Their existing tests pass in the new location |
| E2.6 | Session index behind `sessions_list` / `sessions_resume` / `sessions_end`, plus `shards sessions list\|show\|resume\|end`. Resume hints for each host (`claude --resume <id>`, Codex `resume`, T3 thread link) | M | B | `/resume` and `/end` work without the UI on all hosts; `test/session-index.test.js` ported |
| E2.7 | Notebook kernel (`notebook-kernel.py`) behind `notebook_start/exec/run_all/stop` | M | B | Notebook Walkthrough runs without the UI on macOS, Linux and Windows |
| E2.8 | `permission-pattern.js` and `cc-readonly.js` go to Studio (E3.4), since only the UI uses them | S | B | No runtime module imports the UI |
| E2.9 | `artifact_emit(type, path, meta)` appends to `.shards/events.jsonl` (replaces `ui-push`) | S | A | Events written with a versioned schema |
| E2.10 | Publish `@proflandrigan/shards-mcp` (runtime) and `@proflandrigan/shards` v2 (CLI: build, install, connect, doctor, gates, sessions, sync, migrate) | S | A | Published under the **`next` dist-tag only** (`latest` moves in E10.5); `npx @proflandrigan/shards@next --help` lists only the commands that exist at that milestone; `npx @proflandrigan/shards-mcp@next` starts on a clean machine |
| E2.11 | **Session correlation and concurrency.** The main session key is the hook-reported `session_id`, registered by the E11.0 SessionStart shim through a handshake file. **Fallback key:** the stdio MCP process, **only where E0.6 confirms one process per session or thread** (refuse the fallback when Codex app-server/T3 shares one process across threads). It is linked to hook shims by walking up the process ancestry (to get past `npx` and shell wrappers) or by a host session environment variable, with one handshake file per PID to avoid races. On `/clear` the session is re-keyed through the SessionStart `clear` handshake. MCP calls don't say whether a subagent made them, so the gate tools don't rely on that (see E11.5, E2.3). All state keyed by session and locked. Fixes the cross-session class of bugs from `docs/gate-audit-2026-06.md` | M | A | Two concurrent sessions never see each other's stack, gates, leases or auto-verify blocks; the fallback key works with hooks disabled |
| E2.12 | `shards doctor` (CLI): prerequisites (Node 18+, Python for notebooks, git), config schema, MCP **registrations** in each host, hook shims installed, git state. `/shards:doctor` (skill): checks the binding tool names through the host's MCP (D4) | S | A (CLI) / C (skill) | Each check passes or fails with a fix suggestion; the skill flags a renamed Rovo tool in a fixture |

### E3 · Separate the UI (Studio)

Goal: agents never know whether a UI exists.
Depends on: E2.9.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E3.1 | Artifact contract for the **10 types agents send** (data-viewer, chart, dag, experiment-dashboard, eval-dashboard, model-card, prompt-lab, brainstorm, pr-review, notebook-walkthrough), plus `close`. UI-only panels: `diagram` and `diff` stay in Studio; `knowledge-map` is removed (E4.4); `guide` moves to the docs (E3.6) | M | B | `docs/artifact-contract.md` with a JSON Schema per type |
| E3.2 | Delete the 9 `*_ui_mode.md` files; move each "write the artifact" step into the normal phase files | M | B | 0 `ui_mode` files; golden sessions still produce artifacts |
| E3.3 | Remove every `ui.port` check and `ui-push.js` call from `core/` | M | B | 0 UI refs in `core/` (E0.2 metric) |
| E3.4 | Move `src/ui/` (server, relay, chat-session, symbol-index/code-intel, permission-pattern, cc-readonly, js/, css/) to `packages/studio/`; Studio reads `events.jsonl` and the output folders | L | B | Studio shows all 10 artifact types from files alone; UI tests moved with it |
| E3.5 | Remove relay hooks from the default install; Studio installs its own hooks only if needed | S | B | Clean install writes no UI hooks |
| E3.6 | Replace `/shards-ui` and `/shards-guide` with `npx @proflandrigan/shards-studio`; the guide becomes plain docs. `src/docs/manifest.json` moves to Studio (its guide panel reads it) and the docs site TOC is generated from it. Record whether the Electron desktop build in `DISTRIBUTE.md` is kept or dropped | S | B | Old commands removed; manifest owned by Studio; ADR records the desktop-build decision |

### E4 · Remove the Knowledge Ledger

Goal: no built-in storage; connected sources take its place.
Depends on: E1.3, E6.1, E6.2.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E4.1 | Write `protocols/sources.md` (≤ 80 lines): check `knowledge` sources before Phase 1, cite what was used, re-check mid-phase when needed, propose write-backs at close | S | B | Golden Data Analyst and Data Science runs cite at least one connected source in Phase 0 and propose a write-back at close in ≥ 3/3 runs each |
| E4.2 | Remove `knowledge_retrieval.md`, `knowledge_checkpoint.md`, `knowledge_harvest.md`; replace the ~95 references with `{{protocol sources}}` / `{{knowledge.search}}` | M | B | 0 ledger refs in `core/` |
| E4.3 | Remove Syn's knowledge mode, `/knowledge` and `knowledge-index.md` | S | B | Files deleted; Syn's menu updated |
| E4.4 | Remove the `.shards/knowledge/` setup and the knowledge-map panel | S | B | No ledger references outside the migration code |
| E4.5a | `shards migrate --export-ledger` converts entries to `docs/knowledge/*.md` (committed) | S | B | Ledger fixture exported with no entries lost |
| E4.5b | `/shards:publish-knowledge` skill: the agent copies exported entries to Confluence through the host's MCP (D4) | S | C | Fixture published to a sandbox space |

### E5 · Activation

Goal: activating an agent is reliable in every tool.
Depends on: E1, E1.10, E2.2, E2.11, E11.0–E11.2.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E5.1 | Set `activation` and `consult_entries` for every agent, based on the E1.4 call inventory. **Syn:** switch + consult (`final_review`, `arbiter`). **Every specialist with `review.md`/`advise.md`/`service_mode.md`:** switch + consult. **Researcher, Academic:** consult + switch (keeps today's interactive `/researcher` and `/academic` commands). **Swarm and diverge targets:** + `fanout_worker` | S | B | The build emits a skill for every switchable agent and a subagent for every consultable agent; every `{{consult}}` resolves |
| E5.2 | One thin skill per switchable agent: calls `activate(agent, "switch")` and loads AGENT.md | M | B | `/shards:<agent>` (Claude Code) and `$<agent>` (Codex, incl. under T3) switch correctly in ≥ 9/10 runs (×3) |
| E5.3 | Native subagent definitions for consultable agents (Claude Code `agents/*.md` with `model: inherit`; Codex `.codex/agents/*.toml`, no `model`), one per consult entry where needed, generated into the dev build. E7.3/E8.2 only package them | M | B | `@agent-shards:researcher`, Syn `final_review` and Codex named spawn return a verdict in ≥ 9/10 runs |
| E5.4 | Router: Syn (or `/shards`) turns plain-language requests ("bring in the data modeller") into `activate` | M | B | 20 labelled test prompts route correctly ≥ 18/20 on each host, across 3 runs |
| E5.5 | Return and stack: `return()` pops one frame; `return(to=<agent>)` pops to that frame ("go back to Syn"). Restores the frame's persona (summary from E1.2) and a state summary. A pending gate in a frame being left must be **resolved, or suspended with the same human proof as a confirmation** (tiers 1–3). Suspended gates reappear when the frame is re-entered (`gate_resume`). `final_review` and `sessions_end` list suspended gates and refuse to close until each is resolved or force-closed (CLI) | M | B | Syn → AE → BI → `return(to=syn)` works; a suspend with no human proof is refused; a session with a suspended gate can't end; golden check confirms the persona is restored |
| E5.6 | Nesting lint: a consult cannot consult further unless the host allows it (Codex `max_depth`). The build fails on violations. Fix the known Researcher → data-modeller chain (`researcher/service_mode.md:22`, `critical_review.md:122`) by having the caller collect data-modeller's input first | S | B | Lint passes on `core/` |
| E5.7 | Optional default agent: Claude Code `settings.json` `"agent"` / `claude --agent shards:syn`; Codex profile | S | B | A fresh session on each host starts as Syn when opted in, and as the plain host agent when not (2 tests per host) |
| E5.8 | `/shards agents`: list agents with modes, descriptions and how to activate each | S | B | Output matches the registry |
| E5.9 | **Fan-out modes** (PM, swarm, diverge, brainstorm, panel-review fix groups) use `{{fanout}}`. `fanout_start(agent, slices)` issues a **lease**, and only workers registered under an active lease are exempt from gate blocking (E11.6). Workers run under a slice contract with no gates and return a structured verdict; the orchestrator merges. **Fan-out is launched only from the main session:** PM switches into a workstream's specialist when that workstream needs gates **or** its own fan-out (Claude Code subagents cannot nest), so such workstreams run one after another. The lease records each slice's paths so E6.3 won't commit paths that are still being written.<br>**Lease rules:**<br>• tied to the `fanout_worker` subagent types and the slice count<br>• has a TTL plus heartbeat and closes on SubagentStop or crash<br>• workers may write only inside their slice paths<br>• `fanout_start` is refused while the frame has a pending gate<br>• paths under an expired lease are committed at the next gate<br>**Delivered together with E11.6** | L | B | PM runs a 2-workstream plan (gated AE + 4-slice BI swarm) on Claude Code and Codex, with gates only in main-session frames. Fixtures: in-progress slice paths not committed; crashed worker's lease expires; `fanout_start` refused with a pending gate; a worker writing outside its slice is blocked |

### E6 · Integrations (git, Atlassian, Drive/Slides, any MCP)

Goal: the agents' documentation and tasks land in the team's real tools.
Depends on: **E6.1–E6.3 → E1.3, E2.1, E2.11; the rest → E2**. E6.1–E6.3 are Milestone A; the rest is Milestone C.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E6.1 | `shards.config.yaml` schema and **zero-config defaults** (all jobs → git: `record` → `project-specs.md`, `tasks` → `TASKS.md`, `knowledge` → `docs/` + git log, `artifacts` → `output_dir`); `gates.policy` (default `phase`); `git.commit`, `git.push`; tier mapping. Single source of truth | S | A | JSON Schema; config created automatically on first activation; `doctor` validates it |
| E6.2 | Binding-file format (`bindings/<tool>.md`): how to do each job verb with that tool's MCP tools, required settings, expected tool names for `/shards:doctor` | S | A | Spec plus one example |
| E6.3 | `git` binding (always on), **delivered together with E11.1**. **On gate confirmation:**<br>• Build an **explicit file list** from the agent's `output_dir`. Respect `.gitignore` and a size/type denylist (no data dumps or model binaries, even if already tracked). Exclude leased in-flight slice paths (E5.9).<br>• **Snapshot** those files to `refs/shards/pending/<gate>` (a tree object, no checkout).<br>• `git commit --only <files>` with `Shards-Gate:` / `Shards-Agent:` trailers. The user's pre-commit hooks run under a timeout.<br>**Outcome** `committed \| commit_pending(reason)`. The gate is confirmed either way.<br>**Pending commits:**<br>• replayed **in gate order from their snapshots**, so gate N's commit never holds N+1's content<br>• retried at the next gate, at `sessions_end` and from `doctor`<br>• capped at 5 tries with backoff, then marked `stuck`<br>**Fallbacks:** detached HEAD, merge/rebase in progress, signing prompts or no repo → keep the snapshot ref / notes or `.shards/state`; `doctor` warns.<br>**Monorepos:** paths relative to the project root, which `doctor` reports | M | A | Fixtures pass: clean tree, untracked outputs, user's staged files untouched, tracked denylisted file not committed, merge in progress, failing pre-commit hook, hook timeout, detached HEAD, non-repo, two pending commits replayed in order |
| E6.4 | Confluence binding: page per project, one section per phase keyed by gate id, so writes are **idempotent and in order** (a replayed older section never overwrites a newer one), plus artifacts attached and a "source of truth is git" banner | M | C | Sandbox page mirrors `project-specs.md`; out-of-order replay test passes |
| E6.5 | Jira binding: epic per project, sub-task per phase; gate confirmation → transition + comment with the commit **SHA** (a link only when `git.push` is on and the commit is pushed); PM workstreams → issues. **Idempotent:** every comment and issue carries a `[shards-gate:<id>]` marker, and the binding searches for it before writing | M | C | Sandbox project shows the epic and sub-tasks moving through phases; replaying a gate creates no duplicate comment or transition |
| E6.6 | Drive binding (artifacts folder, Docs record option, Drive search as a knowledge source) and **Slides binding** for the `presentation` job (Syn Slides mode; replaces `08-integrations/google-slides.md`). Note the Workspace MCP may sign in differently from Drive | M | C | Artifacts uploaded; search results cited; Slides deck created from the Slides-mode golden session |
| E6.7 | Review binding: `gh` / GitHub MCP and Bitbucket (via the Atlassian MCP) for PR review mode | M | C | PR review mode works on both |
| E6.8 | Copy reporting: after each binding write the agent calls `copy_report(gate_id, target, ok, error?)`; the runtime records the result and queues failures. The **state header** (E2.1) and each `gate_request` response show the queue, so the agent retries queued copies at the next gate automatically (D4: the runtime never writes externally). This relies on the model following the instruction, so it's capped at 5 attempts per copy, then marked `stuck` and shown by `doctor` and `/shards:sync` | M | C | With Confluence offline for one gate, that gate commits, the copy is queued, and it is replayed at the next gate with nobody running anything in ≥ 9/10 runs (×3); a permanently failing copy becomes `stuck` after 5 tries |
| E6.9 | `/shards:sync` skill: the agent replays the queue on request and pulls Confluence comments back as review input. `shards sync --status` (CLI) only lists the queue | M | C | Queue clears; comments appear at the next gate |
| E6.10 | Connecting, in two parts. `shards connect` (CLI) checks which MCP servers are registered and prints or runs the official `mcp add` commands (no credentials). `/shards:connect` (skill, after the session restarts) has the agent pick the Atlassian site (cloudId), space and project through the host's MCP, update `shards.config.yaml`, and **offer to backfill** pages and issues for gates confirmed while only git was connected | M | C | Starting from a git-only project with 3 confirmed gates and the Atlassian MCP **not yet registered**: connected and earlier gates backfilled in under 10 minutes, without the user editing YAML |
| E6.11 | Guardrails: external writes only after a confirmed gate or an explicit confirmation; raw query results never go to Confluence or Jira by default (summaries only) | S | C | Tests confirm no external write without a gate or confirmation |
| E6.12 | Extra binding templates (Notion, Linear, GitHub Issues) | S | C | Each has a binding file and a smoke test |

### E7 · Claude Code package

Goal: install with one command as a Claude Code plugin.
Depends on: E1.8, E2, E5, E6, E11.0.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E7.1 | Generate `.claude-plugin/plugin.json` (name, version; `userConfig` only to pre-fill `shards.config.yaml`) | S | D | `claude plugin validate --strict` passes |
| E7.2 | Generate `skills/`: one per switchable agent plus the utilities: brainstorm, review-pr, notebook-walkthrough, agents, resume, end, connect, sync, doctor, publish-knowledge | M | D | All skills appear under `/shards:` |
| E7.3 | Package the E5.3 subagent files into the release plugin | S | D | Subagents appear in the @-mention list from the installed plugin |
| E7.4 | `.mcp.json` registering `shards-mcp` with `${CLAUDE_PLUGIN_ROOT}` | S | D | Runtime starts when the plugin is enabled |
| E7.5 | `hooks/hooks.json`: **required** recorder, handshake and re-ground shims (E11.0); the PreToolUse `ask` shim for `gate_advance`/`gate_force_close` (E11.4); **optional** write/exec enforcement (E11.6). No Stop-hook parsing | M | B | Passes the E11.10 fixtures on Claude Code (through the dev install; D re-runs them on the packaged plugin) |
| E7.6 | `.claude-plugin/marketplace.json` so `/plugin marketplace add proflandrigan/shards` works | S | D | Install from a clean machine succeeds |
| E7.7 | Optional `settings.json` setting Syn as the default `agent` | S | D | Same 2 tests as E5.7 pass from the packaged plugin |
| E7.8 | Replace what the installer used to append to CLAUDE.md (tool-call conventions read by the auto-mode permission classifier, `08-integrations/claude-code-auto-mode.md`): ship a `shards-conventions` skill and an opt-in `shards install --claude-md` that inserts the block between markers | S | D | Auto-mode guide updated; uninstall removes the block |
| E7.9 | Optional permission presets: turn the installer's BASE_ALLOW / BASE_DENY lists into an opt-in settings fragment (`shards install --permissions`). The fragment must never allow `gate_advance` or `gate_force_close` | S | D | Fragment merges and unmerges cleanly; `doctor` rejects any allow rule that covers the gate tools |

### E8 · Codex package

Goal: the same suite installs as a native Codex plugin.
Depends on: E1.8, E2, E5, E6, E11.0. **E8.3 and E8.7 are needed in Milestone B (through the E1.10 dev install).**

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E8.1 | Generate `.codex-plugin/plugin.json` and `skills/` (same set as E7.2) | M | D | `codex plugins install` works from a local path |
| E8.2 | Package the E5.3 `.codex/agents/<id>.toml` files into the release plugin | S | D | Named spawn from the installed plugin returns a verdict (≥ 9/10) |
| E8.3 | Register `shards-mcp` in the Codex config, with `gate_advance` and `gate_force_close` set to `approval_mode = "prompt"` (E11.4) | S | B | Runtime tools visible; both tools always prompt in supervised modes |
| E8.4 | `.codex/hooks.json`: **required** recorder, handshake and re-ground shims (E11.0), limited to the events Codex supports (per E0.6); the tier-2 prompt shim where Codex can force a prompt each time; optional enforcement | M | B | Passes the E11.10 fixtures on Codex, or each gap is listed in `docs/compat.md` with its fallback |
| E8.5 | `AGENTS.md` fragment inserted at install (Codex doesn't merge plugin AGENTS.md content) | S | D | Inserted between markers; uninstall removes it |
| E8.6 | `max_depth` / `max_threads` recommendations for consult and fan-out | S | D | Documented; tested with Syn `final_review` → Researcher and a 4-slice swarm |
| E8.7 | Switch mechanics on Codex (based on E0.6). **Primary:** the skill takes over the session's instructions and `activate` re-asserts the persona in every tool header. **Fallback outside T3 only:** a Codex profile per agent (`codex --profile shards-<agent>`); profiles can't be changed mid-session or inside T3, so T3 relies on the primary path | M | B | Switch golden check ≥ 9/10 on Codex CLI (automated) and on T3 + Codex using the primary path (manual run against the written checklist, since T3 has no headless mode) |

### E9 · T3 Code and testing across tools

Goal: works in T3 Code and other harnesses without special-case code.
Depends on: E7, E8.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E9.1 | `shards install --project`: copy generated skills to `.claude/skills/` and `.agents/skills/`, and optionally the permission fragment (E7.9) | M | D | Skills show up in T3's `/` composer for both providers |
| E9.2 | Generic `agent-skills` target (Agent Skills format plus Agent Plugins 1.0 `plugin.json` / `mcp.json`) | M | D | Smoke test in at least one host other than Claude Code and Codex |
| E9.3 | Test matrix: {Claude Code CLI, Codex CLI, T3 + Claude, T3 + Codex} × {switch, consult, fan-out, plain-language route, gate (each tier), compaction re-ground, Confluence copy and offline queue, resume} on macOS, Linux and Windows | L | D | Matrix in `docs/compat.md`. Switch, consult, at least one human-proof gate tier, re-ground and resume must pass everywhere; any other shortfall needs an ADR and a working fallback. T3 cells are manual runs against a written checklist; the CLI hosts are automated |
| E9.4 | Automate the golden sessions with headless runs (Claude Code `-p`, Codex `exec`); **CI on Linux, macOS and Windows** | M | D | Nightly CI on all 3 operating systems publishes scores against the E0.4 guide, using the E0.7 runners, secrets and API budget |
| E9.5 | Track upstream T3, Claude Code and Codex gaps with workarounds | S | D | `docs/compat.md` lists every known gap with an issue link, workaround and last-checked date; reviewed each release |

### E10 · Migration, docs and release

Goal: existing users move over without losing work.
Depends on: all of the above.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E10.1 | `shards migrate`: remove legacy `.claude/commands`, `.claude/agents`, gate and relay hooks from `settings.json` (using the existing manifest), `.shards/ui`, and the CLAUDE.md block; run the ledger export (E4.5a) and the gate-history import (E11.11); keep the existing output folders | M | D | Migration of the legacy fixture project is clean and repeatable |
| E10.2 | Rewrite the developer guide (core, runtime, packages, jobs and bindings, activation modes, gate policies; replace `08-integrations` pages) **and the repo's own `CLAUDE.md`** (architecture section) | L | D | `src/docs` and `CLAUDE.md` describe v2; every page linked from the README or the index |
| E10.3 | README quick starts for Claude Code, Codex and T3 Code (≤ 3 commands each), plus prerequisites (Node 18+, Python for notebooks, git) | S | D | Run on a clean machine for each host, including Windows |
| E10.4 | Versioning and release workflow building every target; fix `package.json` `files` (the `shards-ui` bin points to a file that isn't shipped) | M | D | A tag produces the npm packages and plugin artifacts; `npm pack` includes every bin target plus `runtime/`, `hooks/` and the generated `adapters/` (checked against an explicit list) |
| E10.5 | Publish `@proflandrigan/shards` v2 (new CLI under the same package name). Point the v1 bins (`shards install`, `shards-ui`, `shards-gates`, `shards-sessions`) to the new commands with a deprecation notice; set a `v-legacy` support window | S | D | Running a v1 command prints the v2 replacement; `npx @proflandrigan/shards install` still works and installs v2 |

### E11 · Gate redesign: tool calls instead of text parsing

Goal: gates that don't misfire in long sessions. A confirmed gate stays confirmed; agents ask for approval only when it's actually needed; agents never approve their own gates.
Depends on: **E11.0 → E2.1. E11.1+ → E2.11, E6.1, E11.0. E11.1 and E6.3 are delivered together; E11.6 and E5.9 are delivered together.** Blocks: E5 (needs E11.0–E11.2 only), E6.8, E7.5, E8.4.

**Why (from the code audit):**
1. `handleStop` re-reads the **whole transcript** on every turn and takes the last assistant text it can find (`transcript.js`). If a turn ends with no text (interrupt, tool-only turn, background-agent wake-up), the hook picks up an earlier message's fence.
2. Opening a gate doesn't check history, so a confirmed gate id **reopens** whenever its fence is parsed again. After compaction the model also loses track of which gates were confirmed and re-emits fences, and each one reopens.
3. Confirmation is a start-of-message regex (`classify.js`). "Great, go ahead", "sure" or "looks right" count as ambiguous; the gate stays open and a reminder tells the agent to ask again, which produces the clearance loop. "Yes but change X" counts as a confirmation.
4. Text after the fence (>40 words or phase-like wording) blocks Stop and **doesn't open the gate**, so the agent waits, emits the gate again, or loops.
5. While a gate is open, PreToolUse blocks every non-Read tool for the session, including subagent tool calls (AR fan-out, swarm).
6. The volume is high: Data Scientist alone has 34 `::GATE::` references, 31 of them typed fences (16 phase, 6 final, 4 execute, 5 checkpoint), and incremental testing adds a human checkpoint after every component.
7. Auto-verify uses the same text-marker method (`::AUTO-VERIFY::` / `::ENDAUTO::`) and has the same failure modes.

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E11.0 | **Hook shims (required in every package):** a UserPromptSubmit recorder (session id, prompt id, timestamp, **normalised full text** (whitespace + NFC) plus its hash); a PreToolUse shim that reports `permission_mode` **at call time** for the gate tools; a SessionStart (`startup`, `resume`, `compact`) handshake and re-ground. No transcript reading | M | A | The shims write runtime state on Claude Code and Codex (and under T3 where E0.6 says hooks fire); uninstall removes them |
| E11.1 | Gate state machine: `pending → confirmed \| changes_requested \| suspended`, owned by a **switch frame** and keyed by session, project, agent, track and phase. Idempotent: a confirmed gate never reopens. Confirmation calls E6.3 | M | A | `gate_request` on a confirmed id returns "already confirmed (`<sha>` or `commit_pending`), continue"; per-session isolation and suspend/resume tests pass |
| E11.2 | `gate_request(id, kind, phase, summary, record_ref, validates?)` MCP tool replaces fences. Input checked against a schema; `validates=` runs `validation.js` against the record (VALIDATION_SPEC kept). The response includes the state header and the copy queue | M | A | Malformed requests come back to the agent as tool errors; validation-gate tests pass |
| E11.3 | Confirmation tier 1: **MCP elicitation** (Approve / Request changes + note) where the host shows it (E0.6) | M | B | Approve confirms; the note goes back to the agent |
| E11.4 | Confirmation tier 2: the **host's own approval prompt** on `gate_advance` (Claude Code permission prompt; Codex `approval_mode = "prompt"`). **Accepted only if the PreToolUse shim, at call time:**<br>• reports a supervised `permission_mode`, and<br>• returns `permissionDecision: "ask"` for `gate_advance`/`gate_force_close`, so allow rules and "don't ask again" can't skip the prompt.<br>The E7.9 presets and `doctor` reject allow rules covering these tools. Where E0.6 shows a host can't force a prompt on every call, tier 2 is **off** for that host. Otherwise the call returns "use tier 1 or 3" and doesn't confirm (D8) | M | B | Advancing shows the host prompt in supervised mode. `gate_advance` never confirms in any of these fixtures:<br>• auto or bypass mode<br>• an "allow always" rule is set<br>• the mode is switched mid-turn |
| E11.5 | Confirmation tier 3 (fallback): the user replies in chat and the agent calls `gate_confirm(id, decision, user_reply)`. **Accepted only if `user_reply`:**<br>• equals the **whole** recorded message after normalisation;<br>• is the **first** user message in **this session** after the turn that called `gate_request` (or `gate_resume`);<br>• hasn't already been used for another gate (each message is used once).<br>Only **one pending gate per frame**. The agent decides `confirmed` vs `changes_requested`, and the reply text is stored in the gate's git note for audit. Without a recorder, or when the rules aren't met, it is refused with a **fixed, user-facing message** that says exactly how to confirm (e.g. "reply in chat, or approve in the form/prompt") and doesn't ask the agent to ask again | M | B | "Great, go ahead" confirms; "yes but change X" becomes `changes_requested`. Refused: a made-up reply, part of a message, an unrelated later message, a message sent while the gate was suspended, one message used for 2 gates. The refusal message appears at most once per gate |
| E11.6 | Optional enforcement: PreToolUse reads runtime state only; blocks only write and execute tools in the main session **while the active frame has a pending gate**. Exempt calls carry an `agent_id` registered under an **active fan-out lease** (E5.9); any other subagent call is blocked like the main session, so starting a worker can't get around a gate | M | B | No transcript reads; leased workers keep running; an unleased subagent cannot write while a gate is pending |
| E11.7 | Re-grounding: the SessionStart `compact`/`resume` shim, `activate` and `load_phase` inject the active frame's **persona summary** (E1.2), phase, confirmed gates with SHAs, pending or suspended gates, and copy queue. Other tool responses carry only the ≤ 60-token header (E2.1) | S | B | In the fixed Data Science golden scenario with two forced compactions, the agent keeps its persona and re-asks 0 times for confirmed gates, in 3/3 runs |
| E11.8 | Gate policies in `shards.config.yaml`, covering the kinds actually used (`phase`, `final`, `checkpoint`, `execute`, `confirm`; `handoff` reserved for switch-with-gate): **`strict`**: every kind needs a human. **`phase`** (default): `phase`, `final`, `execute` (experiment results) need a human; `checkpoint` and `confirm` are recorded as evidence automatically and block only on a failed test or anomaly. **`plan`**: approve the plan and a budget once; every kind becomes a notice; stop on failure, anomaly or budget. `plan` absorbs `goal_mode.md`; `incremental_testing.md` and the AR protocol are rewritten to match | M | B | In the fixed Data Science golden scenario (E0.4: deep study, ~8 phases, 2 experiments), `phase` mode needs ≤ 10 human approvals (was 30+) and `plan` mode needs 1, in 3/3 runs |
| E11.9 | Replace the 317 gate fences with `{{gate …}}`; delete `tools/gate-hook.js` and `parser.js`, `classify.js`, `transcript.js`, `state.js`, `sweep.js`, `log.js`, `auto-state.js`, `migrate-gates.js`, the post-fence rule and fence instructions in prompts | M | B | 0 `::GATE::` in `core/`; legacy gate-hook modules removed |
| E11.10 | Long-session fixtures: compaction (×2), interrupts, tool-only turns, background agents, casual short replies, auto/bypass permission modes, two concurrent sessions, leased and unleased workers, frame suspend/resume; port the useful cases from `test/gate-hook.test.js` and `test/fixtures/gate-hook/` | M | B | Re-asks per confirmed gate = 0; false blocks = 0; cross-session leaks = 0; no gate confirmed without a human action |
| E11.11 | Import legacy gate history (`.shards/gates/state.json` in both the single-slot and the v2 `sessions` formats, plus `gates.jsonl`) into runtime state and git notes (called by E10.1) | S | D | History preserved for fixtures in both formats |
| E11.12 | **Auto-verify as a tool:** `auto_verify_start(agent, phase, tool_budget, ttl)` / `auto_verify_end()`; PreToolUse checks runtime state plus `auto-allowlist.js` and `sql-guard.js` (including the quoted-region fix from the bug-hunt report); blocks are per session | M | B | 0 `::AUTO-VERIFY::` in `core/`; ported auto-verify tests pass |
| E11.13 | Operator CLI `shards gates status\|history\|checkpoints\|violations\|force-close` (replaces the `shards-gates` bin), plus a `gate_force_close` tool under the same supervised-mode rule as E11.4 | S | B | A stuck gate can be cleared from the CLI or a supervised host prompt; the action is logged; force-close in bypass mode is refused |


### E12 · Delegated build execution: leads break the plan into tasks for worker subagents

Goal: in build and execute phases, the specialist works as a **lead**. It breaks the confirmed plan into discrete tasks, delegates each to a worker subagent, and verifies each result against the plan before moving on (D9).
Depends on: E1.3, E2.1, E2.3, E5.3, **E5.9 (leases and slice-path limits)**, E11.2, E11.6, E11.8.

**Why:**
- Today one agent writes a whole build (notebooks, dbt models, pipelines, services) in the main session.
- Context fills up, compaction kicks in, and gates misfire.
- Work can't run in parallel, and nobody independently checks it against the plan.

**Build and execute phases in scope (11 specialists, 17 phase files):**

| Agent | Phase files |
|---|---|
| Data Analyst | `phases/phase-3` |
| Data Scientist | `phase-6` |
| ML Engineer | `phase-6`, `phase-6-5` |
| AI Engineer | `phase-6` |
| Analytics Engineer | deep `phase-7`, quick `phase-2` |
| Data Engineer | deep `phase-6`, quick `phase-2` |
| Data Modeller | deep `phase-6`, quick `phase-2` |
| BI Engineer | `phase-3` |
| Applied ML Scientist | `phase-3`, `phase-4` |
| Deep Learning Engineer | `phase-3`, `phase-4` |
| MLOps Engineer | `phase-6` |

| ID | Task | Effort | MS | Done when |
|---|---|---|---|---|
| E12.1 | **Task manifest and runtime tools.** Manifest `<output_dir>/tasks.yaml`. Each task has:<br>• id, goal, plan reference (section of `project-specs.md`)<br>• inputs and **owned paths**<br>• **acceptance check** (command + expected evidence)<br>• dependencies, worker type, size (max ~1 hour of agent work)<br>Runtime tools `tasks_set(manifest)`, `task_dispatch(ids)` (opens a lease per E5.9), `task_report(id, result)`, `task_status()`. `{{delegate}}` macro. Phases with ≤ 2 tasks may run inline (`delegate: inline`). The manifest is mirrored to `TASKS.md` through the `tasks` job | M | B | Schema in CI; the runtime rejects cyclic dependencies, overlapping owned paths between parallel tasks, and tasks without an acceptance check |
| E12.2 | **Worker contract.** A `worker` consult entry (`modes/worker.md`) per specialist, generated as subagents by E5.3 and packaged by E7.3/E8.2.<br>**Input:** the task card plus only the referenced spec sections and the specialist's coding/validation rules.<br>**Rules:** write only inside owned paths (lease-enforced); run the acceptance check; no gates, no plan changes, no further delegation.<br>**Returns** a structured result: status, files changed, the check it ran with output, deviations, open questions | M | B | 11 worker entries generated; a worker writing outside its owned paths is blocked; every result validates against the result schema |
| E12.3 | **Plan → tasks step.** Add a decomposition step to the end of each planning phase that comes before a build phase. The lead turns the plan into `tasks.yaml`, and the task list is **part of the plan gate summary**, so the user approves plan and tasks together | M | B | In each in-scope agent's golden run, the plan gate shows the task list, and `tasks.yaml` validates |
| E12.4 | **Rewrite the build/execute phases** listed above as a lead loop:<br>1. load the manifest<br>2. dispatch ready tasks in parallel, within the host's thread cap<br>3. verify each result (E12.5)<br>4. mark it done and dispatch the tasks it unblocks<br>5. raise the phase gate when all tasks are done<br>The lead writes no build code itself except for inline tasks. `incremental_testing.md` is folded in: each task is one tested component, and its evidence replaces the per-component checkpoint gate under the `phase` policy (E11.8) | L | B | All 17 phase files rewritten; E0.2 reports 0 "write the whole build" instructions in build phases; golden runs show ≥ 1 dispatch per task |
| E12.5 | **Lead verification and retry.**<br>• The lead **re-runs or independently checks** each acceptance check, compares the result with the plan reference, and writes an evidence row to the record's `## Validation` section.<br>• On failure it re-dispatches with the failure and feedback (max 2 retries), then stops and asks the user with a summary.<br>• It never marks a task done on the worker's word alone | M | B | Fixtures: failing task retried then escalated after 2 retries; a worker that claims success but fails the re-check is caught; every done task has an evidence row |
| E12.6 | **Plan-drift rule.** If a worker reports a deviation, or the lead finds the plan can't be met as written, the lead pauses the dependent tasks and raises a **plan amendment gate** (E11) with the proposed change. Plan and manifest change only after confirmation | S | B | Fixture: a deviation stops dependent tasks and opens an amendment gate; no plan or manifest change happens without a confirmed gate |
| E12.7 | **Build tasks in the team's tools.** `TASKS.md` checkboxes by default (from E12.1). When Jira is bound, each build task becomes a sub-task under the phase's Jira sub-task and moves to Done when verified, with `[shards-task:<id>]` markers so updates aren't duplicated | S | C | Sandbox Jira shows build tasks moving to Done as they're verified; replays create no duplicates |
| E12.8 | **Host fallbacks.**<br>• Respect thread caps (Claude Code background subagents, Codex `max_threads`).<br>• Sequential mode when parallelism isn't available.<br>• Inline mode when a host has no subagents (same task cards, checks and evidence; only the isolation is lost), recorded in `docs/compat.md`.<br>• Under T3, use whatever the underlying provider supports (per E0.6) | S | B | The delegated-build golden run passes in parallel, sequential and inline modes |
| E12.9 | **Delegated-build golden runs.** The Data Science deep study and the Analytics Engineer deep track, in delegated mode on both hosts. Measures: share of tasks that pass within 2 retries; main-session context at the end of the build phase compared with the legacy run; owned-path violations; plan changes without an amendment gate | M | B | In 3/3 runs on each host:<br>• ≥ 90% of tasks pass within 2 retries<br>• main-session context at the end of the build is ≤ 50% of the legacy run<br>• 0 owned-path violations<br>• 0 unapproved plan changes |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Host features differ from assumptions (elicitation, approval modes, hooks under T3, named spawns, skill takeover on Codex) | Gate tiers or activation fail on a host | E0.6 spike before Milestone B; three confirmation tiers; MCP-process session key as a fallback (E2.11); compat matrix (E9.3) |
| No human-proof confirmation available (no elicitation, bypass mode, no hooks) | Gates can't be confirmed, or the old loop comes back | E11.5 fixed refusal message; `plan` policy as the documented choice for unattended runs; E9.3 requires at least one human-proof tier per host |
| Users run in auto-approve or bypass permission modes | Tier 2 would let the agent approve itself | `gate_advance` and force-close only count with a supervised `permission_mode` reported by a hook (E11.4, E11.13) |
| Nesting limits and fan-out | Consult chains or fan-out fail; workers get around gates | Nesting lint (E5.6); fan-out only from the main session with leases (E5.9); lease-only exemption (E11.6); Codex `max_depth` (E8.6) |
| Concurrent sessions in one project | Stacks, gates and auto-verify leak across sessions | Session-keyed, locked state (E2.11); concurrency fixture (E11.10) |
| Gate commits disturb the user's git workflow | Unwanted commits or swept-up changes; failed commits stall gates | Path-limited `--only` commits on the current branch; commit separate from confirmation; fallback refs/notes; failure fixtures (D5, E6.3) |
| Copy conflicts and replay order | Drift; older content overwrites newer | One-way copy with a banner; section writes keyed by gate id (E6.4); comments come back as review input (E6.9) |
| Sensitive data leaks to shared tools | Compliance exposure | Summaries-only default; confirmation through gates (E6.11); git denylist for data and model files (E6.3) |
| MCP server tool names change (Rovo, Drive, Slides) | Bindings break | Small binding files; `/shards:doctor` checks tool names (E2.12) |
| npm name collision; early v2 publish | `npx shards` runs an unrelated package; v1 users get an unfinished v2 | Always use scoped package names; publish under `next` until E10.5 (E2.10) |
| Agents getting around gates (suspend, switch away, read ahead, reuse replies, pre-allowed prompts) | A gate moves forward without a human | `load_phase` enforcement (E2.3); human proof for suspend (E5.5); single-use first replies (E11.5); forced `ask` for tier 2 (E11.4); E11.10 fixtures for each workaround |
| State header token cost in long sessions | Context bloat | ≤ 60-token header; full re-ground only on activate, load_phase, compaction or a version change (E2.1, E11.7) |
| Delegated workers produce weak or inconsistent work | Bugs pass through; build quality varies | The lead re-runs every acceptance check and records evidence (E12.5); retry cap then escalation; plan-drift amendment gate (E12.6); E12.9 quality bar |
| Delegation raises token use and cost | More tokens spent per build | Small, scoped task cards (only the referenced spec sections); inline mode for phases with ≤ 2 tasks; thread caps (E12.1, E12.8) |
| Parallel workers collide on files | Broken or overwritten output | Owned paths per task with no overlap between parallel tasks; lease-enforced writes; git commits skip in-flight paths (E12.1, E5.9, E6.3) |
| Dependence on test accounts and runners | Done-when checks can't run | E0.7 provisions and owns them; T3 runs are manual against a checklist |
| Windows | Hooks, kernel and paths break | E0.6 spike; Windows in the E2.1/E2.7/E10.3 criteria; Windows CI (E9.4) |
| Prompt size grows as macros expand | Context pressure | Progressive phase loading; size report per target (E1.8) |

---

## Effort estimate

- **Size:** about 111 tasks (≈ 50 S, 54 M, 6 L). At S = 1, M = 3, L = 7.5 person-days that's **≈ 255 person-days**, with a likely range of **190–330**. E12 (delegated builds) accounts for about 25 of those. That doesn't include the repeated (×3) model-behavior test runs.
- **With the proposed v1 scope cut below:** ≈ 215 person-days.

## Proposed v1 scope cut (needs your decision)

None of these are needed for goals 1–5. The cut saves about 35–40 person-days. The tasks stay in the plan, in their current milestones, until you decide.

| Defer to v1.1 | Why |
|---|---|
| E3.4: a working Studio. Keep the move; drop "renders all 10 types" | Goal 1 only needs the UI references removed |
| E2.7: notebook kernel and the Notebook Walkthrough skill | Niche; costly on Windows |
| E1.9: AGENT_REPORT fixes | Not tied to any goal |
| E6.7 Bitbucket, E6.12 extra bindings, E9.2 generic target | Git, GitHub, Atlassian and Drive cover goal 3 |
| E6.10 backfill, E4.5b publish-knowledge, E2.12 doctor skill | Nice to have |
| E7.9: permission presets | Risky around gate tools (E11.4) |
| E11.13: the `gate_force_close` **tool**. Keep the CLI | Smaller self-approval attack surface |
| E11.11: history import. Archive the old files instead | Legacy only |
| E9.3: cut to all 4 hosts on Linux/macOS; Windows for the CLI hosts only | The matrix grows fast |

---

## Change log

### v4.2 (delegated builds)
- **New goal 6 and decision D9:** build and execute phases are run by a lead that delegates discrete tasks to worker subagents.
- **New epic E12** (9 tasks):
  - task manifest and runtime tools
  - worker contract
  - plan → tasks step inside the plan gate
  - rewrite of 17 build/execute phase files across 11 specialists
  - lead verification and retry
  - plan-drift amendment gate
  - Jira sub-tasks for build tasks
  - host fallbacks
  - delegated-build golden runs
- **Execution plan:**
  - Stage 5 gains Track 6 (delegation design) and a delegated-builds track after the E5.9/E11.6 joint step.
  - E12.7 joins the Atlassian track in Stage 6.
  - The shared-file warning now covers E12.3/E12.4.
  - The Milestone B exit now includes E12.9.
- **Elsewhere:**
  - `worker` consult entry added to the E1.1 schema.
  - 3 new risk rows.
  - Effort updated to ≈ 255 person-days.

### v4.1 (structure)
- Added the **Execution plan**: 8 stages, done in order, with parallel tracks inside each stage. Every task is placed exactly once, and each stage has an exit check.
- Replaced the milestone table and ASCII diagram. Milestones are now mapped onto stages.
- Called out where tracks edit the same files (Stage 5) and where Stages 6 and 7 can overlap.
- Renamed "Epics" to "Task details (by epic)".
- Removed the staffing section; the effort estimate stays.

### v3 → v4 (third review)
- **Blocking issues fixed:**
  - **Shims and manifests arrived too late:** E1.10 now emits a minimal `plugin.json`, MCP entry and hooks with the E11.0 shims; E7.5 and E8.4 moved to Milestone B.
  - **Tier 2 self-approval through "don't ask again" or a stale mode:** a PreToolUse shim checks the mode at call time and forces `ask`; allow rules on the gate tools are rejected; tier 2 is off on hosts that can't force a prompt each time (E11.4, E7.9).
  - **Tier 3 accepted any matching message:** now it must be the whole, first, previously unused message after `gate_request`; one pending gate per frame; the reply is stored for audit (E11.5, E11.0 stores normalised text).
  - **Gates could be dodged:** `load_phase` refuses until the previous gate is confirmed (E2.3, D2); suspending needs human proof, and `final_review` and `sessions_end` refuse while gates are suspended (E5.5).
  - **Early v2 publish could break v1 users:** published under the `next` dist-tag until E10.5 (E2.10).
- **Consistency fixes:**
  - E6 dependency line split.
  - E5.9 and E11.6 delivered together.
  - E11 "Blocks" clarified.
  - Diagram no longer puts E11.11 in Milestone B.
  - Leased-path fixture moved to E5.9.
  - E5.3 generates the subagent files; E7.3 and E8.2 only package them.
  - The copy queue field stays empty until Milestone C.
- **Design hardening:**
  - **Fallback session key:** follows the process ancestry, uses one handshake file per PID, re-keys on `/clear`, and is refused when one MCP process serves several threads (E2.11).
  - **Fan-out leases:** TTL plus heartbeat, crash handling, slice-path write limits, no fan-out while a gate is pending (E5.9).
  - **Git commits:** snapshots replayed in gate order, explicit file lists, retry cap and backoff, hook timeouts (E6.3).
  - **External copies:** Jira idempotency markers (E6.5); copy-replay pass rate and attempt cap (E6.8).
  - **State header:** ≤ 60 tokens, with the full re-ground only on activate, load_phase, compaction or a version change (E2.1, E11.7).
  - **Residual risk recorded:** the agent decides `confirmed` vs `changes_requested` (D8).
- **Measurability:**
  - **E0.7** test accounts and CI infrastructure.
  - T3 runs are manual against a checklist (E8.7, E9.3).
  - Run counts added to E4.1, E11.7 and E11.8, with a fixed golden scenario.
  - E6.10 starting state defined.
  - E9.4 tied to the E0.7 runners and budget.
- **Coverage:**
  - `/researcher` and `/academic` stay as switch commands (E5.1).
  - `src/docs/manifest.json` moves to Studio (E3.6).
  - The `npm pack` list now includes `runtime/`, `hooks/` and `adapters/` (E10.4).
- **New sections:** effort estimate; proposed v1 scope cut.

### v2 → v3 (second review)
- **Blocking issues fixed:**
  - **Consult scope:** all 15 agents (incl. Syn ×42) are consult targets → `consult_entries` map, Syn `final_review`/`arbiter`, E1.4 chooses the entry, E5.1 rewritten.
  - **Milestone B depended on D:** dev install E1.10 added; E8.3 and E8.7 moved to B.
  - **Required hooks unchecked on Codex/T3:** E0.6 expanded; MCP-process fallback session key added (E2.11).
  - **Tier 2 broke D8 in auto/bypass modes:** `gate_advance` and force-close need a supervised `permission_mode` (E11.4, E11.13).
  - **Gate commit failures undefined:** commit outcome separate from confirmation; `add` + `commit --only`; denylist; fallbacks; failure fixtures (D5, E6.3).
  - **4 missing templates:** E1.11.
- **Partly-fixed items completed:**
  - `syn/final_review.md` added to the inventory.
  - Dependency loop broken: E11.0 → E2.1 → E2.11 → E11.1, with E6.3 and E11.1 delivered together.
- **Non-blocking issues fixed:**
  - **Gates:** `execute` and `confirm` mapped to policies (`handoff` reserved); E11.5 word-for-word match, `changes_requested` and fixed refusal message; lease-only worker exemption and slice-path exclusion (E11.6, E5.9).
  - **Gate code and history:** E11.9 delete list completed; E11.11 imports the v2 state format.
  - **Packaging and doctor:** scoped package names (E2.10, E10.5); doctor split into a CLI part and a skill part (D4).
  - **Integrations:** Jira uses the commit SHA (link only when pushed); E4.5 publish moved to C; automatic copy replay through the state header; idempotent Confluence sections.
  - **Codex:** E8.7 fallback limited to outside T3.
  - **Tests:** measurable criteria for E5.7, E7.7 and E9.5; Windows CI in E9.4.
- **Walkthrough gaps fixed:**
  - Persona summary re-injected after compaction (E11.7).
  - State header on every tool response (E2.1).
  - `return(to=)` and gates that belong to a frame, with suspend (E5.5, E11.1).
  - PM runs gated or fan-out workstreams one after another (E5.9).
  - Zero-config git defaults and automatic config creation (E6.1).
  - Two-part connect plus backfill (E6.10).
  - Prerequisite checks (E2.12, E10.3).
- **Coverage additions:**
  - The repo's `CLAUDE.md` rewrite (E10.2).
  - Resume hints for each host (E2.6).
  - Output folder creation tied to `output_dir` (E1.1).
  - Milestone shown on every task.

### v1 → v2 (first review)
- **Blocking issues fixed:**
  - E11 placed in milestones and its dependency loop broken.
  - Dual-role agents supported.
  - Fan-out modes added and the nested-consult violation handled.
  - D4 enforced for copies, sync and ledger export.
  - Session correlation added.
  - Auto-verify converted to a tool.
  - Recorder hook made required.
- **Corrections:** command and metric counts, 10 artifact types plus `close`, complete macro list, model lint scope, E7.5 criteria, E2.8 rationale, redrawn diagram.
- **Additions:**
  - E0.6 spike, `shards doctor`, CLAUDE.md conventions, permission presets, Codex switch mechanics, operator CLI.
  - Slides binding; git strategy that doesn't take over the user's branches.
  - Windows coverage; pass-rate criteria; full inventory of modes, protocols, templates and legacy bins.
