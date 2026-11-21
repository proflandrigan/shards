# Shards v2: what's left

Status as of 2026-11-19, on `next` ([PR #72](https://github.com/proflandrigan/shards/pull/72) into `main`). Task IDs (E6.4 and so on) refer to `shards-agent-suite-plan.md`. The pre-migration state is tagged `v-legacy` (8e24069).

## Where things stand

| Milestone | Stages | State |
|---|---|---|
| A · Core | 1–4 | ✅ Done |
| B · Separated | 5 | ✅ Done, including the QA follow-ups |
| C · Connected | 6 | 🟨 Offline core built: guardrails, `copy_report` queue, `shards sync --status`, `shards connect`. The bindings and the sandbox exit criteria are not started (step 4). |
| D · Shipped | 7 | 🟨 Everything is built and tested offline. Live checks on Claude Code 2.1.329 and Codex CLI 0.169.0 (macOS) passed on 2026-11-19; the rest of the live checks are open (step 5). |
| D · Shipped | 8 | ⬜ Not started. Waits for steps 4 and 5 (step 6). |

**Verified on `next`:**
- `npm test`, the build, lints, coupling ratchet (0 for `core/`), `npm run pack:check` and `npm run release:dry-run` all pass. The dry run includes `claude plugin validate --strict`.
- GitHub Actions on PR #72:
  - `ci` runs on ubuntu, macOS and Windows;
  - `runtime` runs on all 3 OSes with Node 18, 20 and 22;
  - `coupling-ratchet`.

**The migration is done when** (Milestone D exit):
1. The E9.3 test matrix meets its rules.
2. The E11.10 long-session fixtures pass against the packaged plugins.
3. Both packages install on a clean machine.
4. `npm` `latest` points to v2, and the v1 commands print deprecation notices.

---

## Critical path

Each step lists who can do it and what it waits on.

| # | Step | Who | Waits on |
|---|---|---|---|
| 1 | ~~Revoke the old token~~ ✅, protect `main`, merge PR #72 | You | — |
| 2 | Decide the Stage 6 scope; provision accounts, hosts, the API budget and npm access | You | — |
| 3 | First release dry run on GitHub: tag `v2.0.0-next.0` with npm publish **off**. This creates the GitHub Release and the `marketplace` branch. | You (push a tag), or Claude with your go-ahead | 1 |
| 4 | Stage 6 bindings and sandbox exit criteria | Claude + sandbox | 2 |
| 5 | Stage 7 live checks: clean-machine install, Codex, T3, notebook kernel, pass-rate runs | You + Claude on real hosts | 2, 3 |
| 6 | Stage 8: test matrix, gap list, release, publish | You + Claude | 4, 5 |

Small items that can be done now with no accounts are listed under step 0.

---

## Step 0 · Small offline items

Done on `next` (follow-up to the PR #72 review):
- [x] `runtime/sessions/index.js` reads open gates from v2 runtime state (v1 `.shards/gates/state.json` only as a fallback for un-migrated projects).
- [x] Pending-commit store keyed per gate instance (`<gate>@<session>#<seq>`, refs `refs/shards/pending/<gate>-<seq>`), so a reused gate id no longer drops an uncommitted commit; old stores still load.
- [x] Hooks keep a bare-string `tool_input`, so Codex `apply_patch` targets are parsed (docs-only payload forms, see `docs/compat.md` CX-6).
- [x] Studio package bundles `src/docs` at pack time (`prepack`/`postpack`); dead `.permission-*` CSS removed; standalone-install limits documented in `docs/studio.md`.
- [x] `notebook-kernel` CI job in `runtime.yml` installs `jupyter_client`/`ipykernel` and fails if the real-kernel test is skipped.
- [x] `shards connect` commands checked against vendor docs (2026-11-19): Atlassian v2 URL confirmed; GitHub commands now carry the required PAT (`--header` placeholder for Claude Code, `--bearer-token-env-var` for Codex).
- [x] Studio gate banner checked headlessly against a fabricated pending gate (renders id, summary and confirm command).

Still open:
- [x] **Studio session start in a live host:** verified on Claude Code 2.1.329 (2026-11-19) with the release plugin, `--model haiku`, using Studio's own argv (`buildClaudeArgs` in `packages/studio/chat-session.js`) and `buildActivationPrompt`: the session called `mcp__plugin_shards_shards__activate` (agent=data-analyst, mode=switch), no `permission_denied`, and `.shards/state/sessions/<id>/frames.json` holds the `f1-data-analyst` switch frame. Two fixes were needed: v2 agents no longer get `--agent` (it resolved to the plugin's MCP-less consult subagent), and Studio passes `--allowedTools` for the runtime tools minus the human-in-the-loop gate tools (`gate_advance`, `gate_confirm`, `gate_suspend`, `gate_force_close`), `auto_verify_start` and the code-running notebook tools; denied calls now show in the chat (`docs/studio.md`, Chat sessions). Consequence: a gate opened from a Studio chat is confirmed with `shards gates confirm`, not in the chat.
- [ ] **Standalone Studio** (installed without the repo) has no sessions index and an empty v2 agent list, because it cannot reach `runtime/`. Decide whether to depend on `@proflandrigan/shards-mcp` or accept the limit (`docs/studio.md`).
- [ ] **`shards connect` Google Drive/Slides:** the claude.ai connector path and whether an official Drive MCP server exists for Codex were not verified.

## Step 1 · Owner actions

- [x] **Revoke the old GitHub personal access token** that was in the `origin` URL. *(Revoked 2026-11-17. Git authenticates through `gh`.)*
- [ ] **E0.1: protect `main`.** Require a PR and the `ci`, `runtime` and `coupling-ratchet` checks.
- [ ] **Review and merge PR #72.**

## Step 2 · Decisions and provisioning

- [ ] **Decide the Stage 6 scope.** The plan proposed dropping these as optional:
  - E6.7 Bitbucket;
  - E6.12 Notion, Linear and GitHub Issues bindings;
  - E6.10 backfill;
  - E4.5b publish-knowledge;
  - the E2.12 doctor skill.
- [ ] **E0.7: fill in `docs/test-infra.md`.** Add the owner and renewal date for each row.
- [ ] **Sandbox accounts:**
  - Atlassian site, Jira project and Confluence space, with MCP sign-in;
  - Google Workspace (Drive and Slides);
  - a GitHub test repo;
  - Bitbucket, if it stays in scope.
- [ ] **CI secrets and variables:**
  - `ANTHROPIC_API_KEY` and an API budget, for `nightly.yml`;
  - optionally `OPENAI_API_KEY` or `CODEX_API_KEY`, and `SHARDS_NIGHTLY_CODEX=true`;
  - later, `NPM_TOKEN` and `SHARDS_NPM_PUBLISH=true` for step 6.
- [ ] **Hosts:** T3 Code and a Windows machine (Codex CLI and macOS were used for the 2026-11-19 live checks).
- [ ] **npm access** to `@proflandrigan/shards` and `@proflandrigan/shards-mcp`.

## Step 3 · First release run (no publish)

Recipe in `docs/release.md`; ADR 0012 covers distribution.

- [ ] Push the tag `v2.0.0-next.0` while `SHARDS_NPM_PUBLISH` is unset. `release.yml` verifies, builds every target, runs the pack check, uploads artifacts, creates a pre-release, and force-pushes the plugin to the `marketplace` branch.
- [ ] Confirm `/plugin marketplace add proflandrigan/shards` then `/plugin install shards@shards` resolves.
- Note: every version bump means regenerating `.claude-plugin/marketplace.json`, or the drift test fails.

## Step 4 · Stage 6: Integrations (Milestone C)

**Already built (offline):**
- **E6.11 guardrails:** binding `write_tools` and `guardrails.*` in the config. The PreToolUse hook requires a confirmed `[shards-gate:<id>]` marker; otherwise it asks on Claude Code and denies on Codex. It refuses raw tables. Protocol: `core/protocols/external_writes.md`.
- **E6.8 queue:** the `copy_report` tool, the copy queue (`stuck` after 5 tries), with the queue shown in the header, `gate_request` and `doctor`.
- **CLI halves:** `shards sync --status` (E6.9) and `shards connect` (E6.10, read-only).

**To do, against the sandbox:**

| Track | Tasks, in order |
|---|---|
| 1 · Atlassian | E6.4 Confluence binding (idempotent, ordered sections per gate) → E6.5 Jira binding (epic and sub-tasks, `[shards-gate:<id>]` markers) → E12.7 build tasks as Jira sub-tasks → E4.5b `/shards:publish-knowledge`* |
| 2 · Google | E6.6 Drive binding + Slides binding (`presentation` job; Syn `[SL]` mode depends on it) |
| 3 · Code review | E6.7 GitHub (`gh` / GitHub MCP) + Bitbucket* for PR review mode |
| 4 · Copy pipeline | E6.9 `/shards:sync` skill: replays the queue and pulls Confluence comments back as review input |
| 5 · Onboarding | E6.10 `/shards:connect` skill + backfill* → E2.12 `/shards:doctor` skill* → E6.12 Notion / Linear / GitHub Issues bindings* |

\* Optional, pending the step 2 decision. Each binding file must declare `write_tools` so the guardrails apply.

**Exit criteria:**
- Atlassian, Drive and Slides copies work in the sandbox.
- With Confluence offline for one gate, the copy is queued and replays at the next gate by itself in at least 9 of 10 runs, across 3 sets.
- A git-only project with 3 confirmed gates connects to Atlassian, with backfill, in under 10 minutes and without editing YAML.

## Step 5 · Stage 7 live checks

Stage 7 is fully built. These need real hosts or API spend:

- [ ] **Clean-machine install** of the Claude Code plugin from the marketplace (after step 3):
  - skills appear under `/shards:`;
  - subagents appear in the @-mention list;
  - the runtime starts when the plugin is enabled.
- [ ] **Codex CLI** (E8.1–E8.4, E8.7, E0.6). Live-verified on Codex 0.169.0, macOS, 2026-11-19 (`docs/compat.md` CX-1, CX-4, CX-6, CX-7): install through a local marketplace (`codex plugin add shards@shards-local`), all 32 runtime tools visible, hooks fire with real payloads (SubagentStop carries `agent_id`), `${PLUGIN_ROOT}` in hook commands, and the `max_depth` / `max_threads` key names. Still to check:
  - named spawn returns a verdict in at least 9 of 10 runs;
  - the gate tools prompt in the interactive TUI (only `codex exec` was checked);
  - the switch golden check passes in at least 9 of 10 runs;
  - a live fan-out run, hooks trust in the TUI, and Windows.
- [ ] **T3 Code with both providers** (E9.1, E0.6). Skills appear in the `/` composer, and switching works on the primary path (manual run against the checklist).
- [ ] **Generic agent-skills package** (E9.2). Smoke test it in a host other than Claude Code and Codex, and confirm the Agent Plugins 1.0 `plugin.json` / `mcp.json` schema. Gemini CLI 0.44.1 (partial, 2026-11-19): `install --project` skills are discovered and a project MCP server connects, but Gemini ignores `plugin.json` / `mcp.json` and no tool call was made (`docs/release.md`).
- [ ] **Notebook kernel on Windows.** Check the install hint, kernel start and `py` discovery (`docs/notebook.md`). macOS was checked live on 2026-11-19 (start, exec, run_all, stop).
- [ ] **Live pass-rate runs**, through `nightly.yml` or by hand:
  - golden sessions score at least 90% across 3 runs (E0.4);
  - the E11 gate pass-rate criteria;
  - the E12 delegated-build harness.
- [ ] **First real `nightly.yml` run** publishing scores on all 3 OSes.

## Step 6 · Stage 8: Verify and release (strictly in order)

1. [ ] **E9.3 full test matrix.**
   - Hosts: Claude Code CLI, Codex CLI, T3 + Claude, T3 + Codex.
   - Behaviours: switch, consult, fan-out, plain-language routing, each gate tier, compaction re-ground, Confluence copy and offline queue, and resume.
   - OSes: macOS, Linux and Windows.
   - Record the results in `docs/compat.md`. Switch, consult, at least one human-proof gate tier, re-ground and resume must pass everywhere; any other shortfall needs an ADR and a working fallback.
2. [ ] **E9.5:** record every upstream gap in `docs/compat.md`, each with an issue link, workaround and last-checked date.
3. [ ] **E10.4:** tag a release and let `release.yml` build it.
4. [ ] **E2.10 / E10.5: publish.**
   - Set `NPM_TOKEN` and `SHARDS_NPM_PUBLISH=true`, then publish `--tag next` (steps in `docs/release.md`).
   - Then promote v2 to `latest`.
   - Set the `v-legacy` support window.
   - *Done when:* `npx @proflandrigan/shards install` installs v2, and the v1 bins print their v2 replacements. The bins already do this.

---

## Done (for reference)

- **Milestones A and B:**
  - three-layer core, runtime and build;
  - gates as tool calls;
  - git binding;
  - sessions;
  - activation and delegation;
  - Knowledge Ledger removed;
  - UI moved to Studio;
  - ADRs 0001–0010.
- **Stage 5 follow-ups** (`bf5bd74`):
  - SubagentStop releases leases;
  - ADR 0011 sets the pending-gate policy for subagents;
  - `fanout_start` refuses while a gate is suspended;
  - the ratchet's `--update` accepts new metrics;
  - the lease-sweep test uses a fake clock;
  - AMS/DLE scaffolding moved to phase 4.
- **Stage 7:**
  - migration, E11.11 + E10.1 (`8f20b31`);
  - Claude Code package, E7 (`45c5eeb`, `25c1e1f`);
  - Codex package, E8 (`286b65c`);
  - other hosts + CI, E9.1/E9.2/E9.4 (`c30a81c`);
  - docs, E10.2/E10.3, including `syn.md` (`b872b73`, `ae813f9`, `905fb0b`);
  - Windows and Node 18 portability (`a2b168a`);
  - live host tests on Claude Code 2.1.329 and Codex CLI 0.169.0, with the fixes they found (`b8e3a8d`..`7c7eded`).
- **Section 2 offline work:**
  - **E10.4 release workflow, pack check, `files` fix, unified package generation, v1 bin deprecations, plugin icon, CLI help** (`8e38f17`, ADR 0012):
    - `release.yml` runs on `v*` tags and on dispatch;
    - default permissions are read-only;
    - npm publish only runs when explicitly enabled.
  - **Studio v1 leftovers removed** (`cdf6c84`):
    - gate state is read from runtime state;
    - `prompt_lab` uses `artifact_emit`;
    - the `src/ui` shim is deleted.
  - **Stage 6 offline core** (`5ac642c`).
  - **Coupling baseline refreshed** (`abb41d2`):
    - `gate_fences` 11 → 1;
    - `ledger_refs` 36 → 6;
    - `ui_refs` 14 → 1;
    - `via_task_prose` 21 → 3.
- **Housekeeping:**
  - planning files committed;
  - `.serena/` and `docs/shards-guide/` gitignored;
  - all agent worktrees and their branches removed.
