# Shards v2: next steps

Status as of 2026-11-17 (Stage 5 follow-ups and the Stage 7 tracks merged, CI green on 3 OSes). Task IDs (E6.4 and so on) refer to `shards-agent-suite-plan.md`.

**Done:** Milestones A (Core, Stages 1–4) and B (Separated, Stage 5): 27 commits on `next`, open as [PR #72](https://github.com/proflandrigan/shards/pull/72) into `main`. The pre-migration state is tagged `v-legacy` (8e24069).

**Verified on `ea86fda`:**
- `npm test` passes (1092 passed, 1 skipped).
- The coupling count for `core/` is 0 on every metric, and the ratchet passes.
- The strict build, `build:all` and the lints pass.
- `release-dry-run` passes.

**Left to do:**

| Milestone | Stages | State |
|---|---|---|
| C · Connected | Stage 6 | Not started; needs sandbox accounts |
| D · Shipped | Stage 7 | Not started; can start now |
| D · Shipped | Stage 8 | Not started; waits for Stages 6 and 7 |

Items OPEN from Stages 1–5 are also still pending (the first section below).

---

## 0. Before or alongside merging PR #72

### Housekeeping (owner actions)
- [ ] **Revoke the old GitHub personal access token** that was in the `origin` URL. Git now authenticates through `gh` instead.
- [ ] **E0.1: protect `main`** on GitHub. Require a PR, plus the CI ratchet once CI exists.
- [ ] Review and merge PR #72.
- [x] *(Committed 2026-11-17. `.serena/` and `docs/shards-guide/` are gitignored.)* Decide what happens to the user-owned files that are not committed:
  - `src/docs/02-agents/syn.md` (modified)
  - `BACKLOG.md`
  - `CALUDE_REVIEW.md`
  - `GATED_BUILD_MIGRATION.md`
  - `test/chat-session.test.js`
  - `shards-agent-suite-plan.md`
  - `.bug-hunt/`
- [ ] Remove the `src/ui/chat-session.js` shim once `test/chat-session.test.js` is moved to `packages/studio` or deleted. The shim re-exports `packages/studio/chat-session.js`.

### Stage 5 follow-ups (bugs and gaps found during QA)
- [x] **SubagentStop is not wired into leases.** *(Done (S5F, bf5bd74): `hooks/subagent-stop.js` + `leases.releaseWorker`. No-op on Codex (no `agent_id` on PreToolUse).)* When a fan-out worker exits, its lease isn't released early; it only expires on heartbeat timeout.
- [x] **A pending checkpoint blocks writes from workers without a lease.** *(Decided in ADR 0011: lease-bound workers are exempt within their slice; every other subagent stays blocked.)* Decide whether non-fan-out subagents should be exempt.
- [x] **`fanout_start` ignores suspended gates.** *(Now refuses while any stack gate is suspended.)* It should refuse, or warn, while a gate is suspended.
- [x] **`coupling-ratchet.js --update` rejects new metrics.** *(`--update` now records top-level metrics that are new to the baseline.)* Let `--update` add a metric when its baseline count is 0 or lower.
- [x] **A lease test may be flaky.** *(Didn't reproduce in 20 runs. The lease-sweep test now uses a fake clock.)* Run it about 20 times in a loop, then fix it or quarantine it.
- [x] *(It was misplaced and has moved: phase 3 now only plans, and the scaffold is the first phase-4 task.)* Confirm the AMS/DLE phase-3 scaffolding is where it belongs, or move it.
- [x] *(Done in the docs epic)* README, `CLAUDE.md` and `src/docs/` still describe the Knowledge Ledger, the old UI, `tools/install.js` and the `::GATE::` fences. This is formally E10.2, but the repo `CLAUDE.md` misleads contributors now.

### Criteria marked OPEN (live runs and external checks)
- [ ] **Live pass-rate runs.** The harnesses exist, but each was run only once:
  - golden sessions: the legacy build should score ≥ 90% across 3 runs (E0.4);
  - gate pass-rate criteria (E11);
  - delegated-build harness (E12).

  These need an API budget (`docs/test-infra.md`, rows 22–23).
- [ ] **Host capability spike, for the hosts not yet checked (E0.6):**
  - Codex: the CLI isn't installed on the dev machine.
  - T3 Code, with both providers.
  - Windows: hook shells, paths, Node/Python.
- [~] *(`shards-mcp` `tools/list` passes on macOS and Windows with Node 18/20/22 in `runtime.yml`, and the full suite passes on all 3 OSes in `ci.yml`. The notebook kernel is still unchecked.)* **macOS and Windows** checks for `shards-mcp` `tools/list` and for the notebook kernel. See the TODO in `docs/notebook.md` about `py` discovery.
- [ ] **E8.3 / E8.4 (Codex runtime + hooks):**
  - Generated files exist: `hooks/codex.hooks.json`, and `approval_mode` in `build/emit.js`.
  - Not yet checked against a real Codex CLI.
- [ ] **E0.7 test infrastructure:** fill in the owner and renewal dates in `docs/test-infra.md`. Every row is currently `TODO(owner: proflandrigan)`.
- [ ] **E2.10:** `npm publish --tag next` for `@proflandrigan/shards` and `@proflandrigan/shards-mcp`. The steps are in `docs/release.md`.

---

## 1. Stage 6: Integrations (Milestone C)

**Prerequisite:** sandbox accounts from `docs/test-infra.md`:
- Atlassian site, Jira project and Confluence space, with MCP sign-in;
- Google Workspace domain (Drive and Slides);
- a GitHub test repo;
- optionally Bitbucket.

**Do E6.11 first, on its own:** guardrails. No external write happens without a confirmed gate or an explicit confirmation, and raw query results never go to Confluence or Jira.

Then the tracks can run in parallel:

| Track | Tasks, in order |
|---|---|
| 1 · Atlassian | E6.4 Confluence binding → E6.5 Jira binding → E12.7 build tasks as Jira sub-tasks → E4.5b `/shards:publish-knowledge` to Confluence |
| 2 · Google | E6.6 Drive binding + Slides binding (`presentation` job) |
| 3 · Code review | E6.7 GitHub (`gh` / GitHub MCP) + Bitbucket for PR review mode |
| 4 · Copy pipeline | E6.8 `copy_report` + automatic replay queue → E6.9 `/shards:sync` skill + `shards sync --status` |
| 5 · Onboarding | E6.10 `shards connect` + backfill → E2.12 `/shards:doctor` skill → E6.12 Notion / Linear / GitHub Issues bindings |

The plan's v1 scope cut proposed dropping these as optional:
- E6.7 Bitbucket;
- E6.12;
- E6.10 backfill;
- E4.5b;
- the E2.12 skill.

You chose "keep full scope" for Milestones A and B. Decide again for Stage 6.

**Exit criteria:**
- Atlassian, Drive and Slides copies work in the sandbox.
- The offline queue replays by itself.
- A git-only project connects to Atlassian, with backfill.

---

## 2. Stage 7: Packaging, migration and docs (Milestone D)

This stage can start now, alongside Stage 6. Only the utility skills in E7.2 and E8.1 wait for Stage 6: connect, sync, doctor and publish-knowledge.

| Track | Tasks, in order |
|---|---|
| 1 · Claude Code ✅ (0b16688→25c1e1f; OPEN: `plugins/shards` is built by the E10.4 release workflow, so marketplace install on a clean machine isn't verified yet. No plugin icon. connect/sync/doctor/publish-knowledge skills wait for Stage 6) | E7.1 `.claude-plugin/plugin.json` → E7.4 `.mcp.json` (`${CLAUDE_PLUGIN_ROOT}`) → E7.2 `skills/` → E7.3 package subagents → E7.6 `marketplace.json` → E7.7 Syn as default agent → E7.8 CLAUDE.md conventions → E7.9 opt-in permission presets |
| 2 · Codex ✅ (built + offline-tested. OPEN, needs a real Codex CLI: plugin install, named spawn, gate prompts, E8.4 hooks, E8.7 switch. `<PLUGIN_ROOT>` placeholder in config/hooks) | E8.1 `.codex-plugin/plugin.json` + skills → E8.2 agent TOMLs → E8.5 `AGENTS.md` fragment between markers → E8.6 `max_depth` / `max_threads` guidance |
| 3 · Other hosts ✅ (OPEN: T3 composer listing, other-host smoke test, Agent Plugins schema confirmation) | E9.1 `shards install --project` (`.claude/skills/`, `.agents/skills/`) → E9.2 generic Agent Skills target |
| 4 · Migration ✅ (8f20b31) | E11.11 import legacy gate history (`.shards/gates/state.json` + `gates.jsonl`) → E10.1 full `shards migrate`. `cli/commands/migrate.js` currently handles only `--export-ledger`. |
| 5 · Docs ✅ (guide, CLAUDE.md and README rewritten for v2. `syn.md` now rewritten for v2 too. OPEN: Studio still carries legacy fence/relay names. `prompt_lab` mode still assumes a browser panel) | E10.2 rewrite the developer guide + repo `CLAUDE.md` → E10.3 README quick starts (≤ 3 commands each for Claude Code, Codex and T3) |
| 6 · CI ✅ (`ci.yml` + `nightly.yml`. `ci.yml` and `runtime.yml` green on ubuntu, macOS and Windows. OPEN: nightly needs `ANTHROPIC_API_KEY` + budget) | E9.4 nightly headless golden-session runs on Linux, macOS and Windows |

E7.5, the plugin `hooks/hooks.json`, was largely built in Stage 4 as `hooks/claude-code.hooks.json`. Check it against the packaged plugin layout.

**Exit criteria:**
- Both packages install on a clean machine.
- Migrating the legacy fixture comes out clean.
- The docs describe v2.

---

## 3. Stage 8: Verify and release (Milestone D)

Run these strictly in order:

1. **E9.3 full test matrix.** Hosts: Claude Code CLI, Codex CLI, T3 + Claude and T3 + Codex. Behaviours: switch, consult, fan-out, plain-language routing, each gate tier, compaction and resume. The T3 cells are manual runs against the checklist.
2. **E9.5** Record every upstream gap and its workaround in `docs/compat.md`, each with an issue link.
3. **E10.4** Release workflow that builds every target, plus an `npm pack` check. Fix `package.json` `files`.
4. **E10.5** Publish v2 to `latest`, and point the v1 bins at deprecation messages.

**Exit criteria:**
- The test matrix meets the E9.3 rules.
- The E11.10 long-session fixtures pass against the packaged plugins.
- `latest` points to v2.

---

## Suggested order

1. Do the housekeeping:
   - revoke the token;
   - protect `main`;
   - merge PR #72.
2. Clear the Stage 5 follow-ups, especially the lease and fan-out bugs and the stale repo `CLAUDE.md`.
3. Start Stage 7, tracks 1, 4 and 5. They need no external accounts.
4. In parallel, set up the sandbox accounts and the API budget (`docs/test-infra.md`), then run Stage 6 and the OPEN live-run criteria.
5. Run Stage 8 last.
