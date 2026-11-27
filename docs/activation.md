# Agent activation (E5)

How a Shards agent becomes active, on which host, with which command. The per-agent table below is derived from `core/agents/*/agent.yaml`; `/shards:agents` (`list_agents`) prints the same data and `test/agents-listing.test.js` keeps them in sync.

## The model

- **switch**: the agent's persona becomes the active frame on the session stack (`activate` pushes, `return` pops). The user talks to that agent, it loads its phases with `load_phase`, and it owns gates until it returns.
- **consult**: an isolated native subagent (Claude `agents/<id>.md` or `agents/<id>-<entry>.md`; Codex `.codex/agents/<id>-<entry>.toml`). It answers one question and returns a verdict. A consult entry never nests: it may not itself consult, switch or fan out (decision D2). The general subagent of a reviewer or specialist can act as a review lead that spawns verifiers one level down (ADR 0013, `docs/delegation.md` 3.2).
- **fanout_worker**: a `<id>-worker` consult entry used by the task manifest and fan-out (see `docs/delegation.md`).

Naming rule: consult subagents exist only if `consult` is in `activation`. The general subagent is `<id>`; each `consult_entries` key gives `<id>-<entry>` (underscores kept, e.g. `syn-final_review`). Switch skills exist only if `switch` is in `activation`: Claude `/shards:<id>`, Codex `$shards:<id>` with profile `shards-<id>` (`codex -p shards-<id>`, profile file `$CODEX_HOME/shards-<id>.config.toml` from `shards install --codex`).

## Commands per agent

| id | role | modes | Claude switch | Codex switch / profile | consult subagents (both hosts) |
|----|------|-------|---------------|------------------------|--------------------------------|
| academic | reviewer | consult, switch | /shards:academic | $shards:academic / shards-academic | academic, academic-service |
| ai-engineer | specialist | switch, consult, fanout_worker | /shards:ai-engineer | $shards:ai-engineer / shards-ai-engineer | ai-engineer, ai-engineer-review, ai-engineer-advise, ai-engineer-worker |
| analytics-engineer | specialist | switch, consult, fanout_worker | /shards:analytics-engineer | $shards:analytics-engineer / shards-analytics-engineer | analytics-engineer, -review, -advise, -service, -worker |
| applied-ml-scientist | specialist | switch, consult, fanout_worker | /shards:applied-ml-scientist | $shards:applied-ml-scientist / shards-applied-ml-scientist | applied-ml-scientist, -review, -advise, -worker |
| backend-engineer | reviewer | switch, consult, fanout_worker | /shards:backend-engineer | $shards:backend-engineer / shards-backend-engineer | backend-engineer, -review, -service, -worker |
| bi-engineer | specialist | switch, consult, fanout_worker | /shards:bi-engineer | $shards:bi-engineer / shards-bi-engineer | bi-engineer, -review, -advise, -worker |
| data-analyst | specialist | switch, consult, fanout_worker | /shards:data-analyst | $shards:data-analyst / shards-data-analyst | data-analyst, -review, -advise, -worker |
| data-engineer | specialist | switch, consult, fanout_worker | /shards:data-engineer | $shards:data-engineer / shards-data-engineer | data-engineer, -review, -advise, -worker |
| data-modeller | specialist | switch, consult, fanout_worker | /shards:data-modeller | $shards:data-modeller / shards-data-modeller | data-modeller, -review, -advise, -service, -worker |
| data-scientist | specialist | switch, consult, fanout_worker | /shards:data-scientist | $shards:data-scientist / shards-data-scientist | data-scientist, -review, -advise, -service, -worker |
| deep-learning-engineer | specialist | switch, consult, fanout_worker | /shards:deep-learning-engineer | $shards:deep-learning-engineer / shards-deep-learning-engineer | deep-learning-engineer, -review, -advise, -worker |
| ml-engineer | specialist | switch, consult, fanout_worker | /shards:ml-engineer | $shards:ml-engineer / shards-ml-engineer | ml-engineer, -review, -advise, -service, -worker |
| mlops-engineer | specialist | switch, consult, fanout_worker | /shards:mlops-engineer | $shards:mlops-engineer / shards-mlops-engineer | mlops-engineer, -review, -advise, -service, -worker |
| researcher | reviewer | consult, switch | /shards:researcher | $shards:researcher / shards-researcher | researcher, researcher-service |
| statistician | reviewer | consult, switch | /shards:statistician | $shards:statistician / shards-statistician | statistician, statistician-service, statistician-advise |
| syn | orchestrator | switch, consult | /shards:syn | $shards:syn / shards-syn | syn, syn-final_review, syn-arbiter |

Entries abbreviated with a leading `-` are `<id>` plus the suffix (e.g. `analytics-engineer-review`). Every agent with a `review` or `service` entry also gets `<id>-verify` (a verifier with no Task tool, ADR 0013); the table omits it. Regenerate by reading `activation` and `consult_entries` keys from each `agent.yaml`.

## Router

Syn is the router: the "Routing Reference" in `core/agents/syn/AGENT.md` maps intent to a specialist, then Syn calls `activate(agent=<id>, mode="switch")` rather than spawning it. `scripts/eval/router-eval.js` runs `test/router/prompts.json` through headless `claude -p` and scores the runtime tool calls (`--dry-run` never calls claude). Criterion 18: at least 20/22 correct routes, three consecutive runs. OPEN: needs the live budget.

## Return and suspend

`return` pops the top frame. It refuses while that frame has a pending gate unless the gate was suspended. `gate_suspend` (needs the user's say-so) parks a pending gate so the frame can be left; `gate_resume` brings it back when the frame is re-entered; `gates_open` is the read-only view. `final_review` and `sessions_end` refuse while suspended gates exist.

## Nesting lint

`build/lint-nesting.js` fails the build when a consult entry (or anything it reads) expands a `consult`, `fanout`, `switch`, `protocol`, `review_lead` or `verify` macro. The lead contract (`protocols/review_lead_contract.md`) is the one place `{{verify}}` appears; no consult entry reads it. `NESTING_EXCEPTIONS` (`'<agent>/<entry>'`) is empty by design; add one only with a comment. Per-target relaxation is `options.allowDepth = { codex: true }`, intended for Codex when `max_depth > 1` is confirmed (`docs/compat.md` CX-4).

## Default agent (opt-in)

- Claude: `shards build --target claude --default-agent` (or env `SHARDS_BUILD_DEFAULT_AGENT=1`) writes plugin-root `settings.json` `{"agent":"shards:syn"}`. Manual route without a rebuild: `claude --agent shards:syn`. A plugin `settings.json` honors `agent`, but Claude Code warns it will stop working in a future release (CC-3, live finding 3 below).
- Codex: no config key (Codex 0.169.0 rejects a top-level `profile`); start sessions with `codex -p shards-syn`. The opt-in only adds that hint as a comment in `.codex/config.toml`.

## Codex switch mechanics (E8.7)

Switching is by skill takeover (`$shards:<id>` loads the thin skill, which calls `activate`), the per-tool header carries the active agent, and per-agent profiles (`codex -p shards-<id>`, profiles v2 files) are the fallback when takeover does not hold. Codex 0.169.0 checks (docs/compat.md CX-7): skills are listed as `shards:<id>`, the profile files pass `--strict-config`, and `activate` works over MCP. TODO(owner: proflandrigan): model-test that `$shards:<id>` and `-p shards-<id>` make the model call `activate` (docs/test-infra.md row 12).

## Eval scripts and open criteria

`scripts/eval/switch-eval.js` and `scripts/eval/router-eval.js`. All live criteria are OPEN (they spend model budget):

- switch golden check: at least 9/10, three runs
- consult verdict returns: at least 9/10, three runs
- router: at least 20/22, three runs
- default agent: 2 live tests per host

## Live findings (E5)

Five live `claude -p` runs against a `--dev --default-agent` build (Claude Code, dev plugin):
1. `/shards:data-modeller` headless: the thin skill expands, `activate(agent=data-modeller, mode=switch)` is called, and the header shows `agent=data-modeller`. PASS (1 sample). Gotcha: the skill then reads `content/agents/<id>/AGENT.md`, which needs Read permission, so headless runs must allow Read.
2. Consult: the subagent is addressable as `shards:researcher-service`; it returned a verdict (CONDITIONAL, with its own scale) without nesting. PASS (1 sample). The verdict vocabulary was the researcher's own, not APPROVED/NEEDS REVISION/BLOCKED. Resolved: `core/agents/researcher/modes/service.md` now uses APPROVED / NEEDS REVISION / BLOCKED.
3. Plugin `settings.json` `{"agent":"shards:syn"}` WORKS (CC-3), but Claude Code prints "Plugin shards set this session's agent. That will stop working in a future release: set `agent` in your own settings or pass --agent." Treat the opt-in as transitional; the durable path is `claude --agent shards:syn` or a project `.claude/settings.json` `agent` key.
4. Router sample "bring in the data modeller" -> `activate`. PASS.
5. Router sample "just ask the researcher whether a t-test works..." -> `Agent` consult, no switch. PASS.

OPEN (live budget): switch >= 9/10 x3 (`scripts/eval/switch-eval.js`), consult verdict >= 9/10, router 20/22 x3 (`scripts/eval/router-eval.js`), 2 live default-agent tests per host. OPEN (external): Codex model behaviour (skill takeover, `-p shards-<id>` making the model call `activate`) and the `max_depth` defaults; the profile files, the `max_depth`/`max_threads` keys and the missing default-profile key were checked on Codex 0.169.0 (`docs/compat.md` CX-4, CX-7).
