# Shards v2: what's left

Status as of 2026-11-17, `next` at `abb41d2` ([PR #72](https://github.com/proflandrigan/shards/pull/72) into `main`). Task IDs (E6.4 and so on) refer to `shards-agent-suite-plan.md`. The pre-migration state is tagged `v-legacy` (8e24069).

## Where things stand

| Milestone | Stages | State |
|---|---|---|
| A · Core | 1–4 | ✅ Done |
| B · Separated | 5 | ✅ Done, including the QA follow-ups |
| C · Connected | 6 | ⬜ Not started. Needs sandbox accounts and a scope decision (section 3) |
| D · Shipped | 7 | 🟨 Built and tested offline. Live and host checks are still OPEN (section 4) |
| D · Shipped | 8 | ⬜ Not started. Waits for Stages 6 and 7 (section 5) |

**Verified on `6008094`:**
- `npm test` passes: 1126 tests. The count dropped because the removed v1 Studio modules' tests went with them.
- `npm run release:dry-run` passes, including the pack check and `claude plugin validate --strict`.
- GitHub Actions on PR #72:
  - `ci` (tests, lints, build, ratchet) is green on ubuntu, macOS and Windows.
  - `runtime` is green on all 3 OSes with Node 18, 20 and 22.
  - `coupling-ratchet` is green.
- The coupling count for `core/` is 0 on every metric.
- `claude plugin validate --strict` passes on the release plugin.

**Definition of done for the migration (Milestone D exit):**
- The E9.3 test matrix meets its rules.
- The E11.10 long-session fixtures pass against the packaged plugins.
- Both packages install on a clean machine.
- `npm` `latest` points to v2, and the v1 commands print deprecation notices.

---

## 1. Owner actions (only you can do these)

- [ ] **Revoke the old GitHub personal access token** that was in the `origin` URL. Git now authenticates through `gh`.
- [ ] **E0.1: protect `main`.** Require a PR and the `ci`, `runtime` and `coupling-ratchet` checks.
- [ ] **Review and merge PR #72.**
- [ ] **E0.7: fill in `docs/test-infra.md`.** Add the owner and renewal date for each row; every row is still `TODO(owner: proflandrigan)`.
- [ ] **Decide the Stage 6 scope.** The plan proposed dropping these as optional:
  - E6.7 Bitbucket;
  - E6.12 Notion, Linear and GitHub Issues bindings;
  - E6.10 backfill;
  - E4.5b publish-knowledge;
  - E2.12 doctor skill.

  Milestones A and B kept full scope.
- [ ] **Provision the external resources** that sections 3–5 need:
  - an Atlassian site, Jira project and Confluence space, with MCP sign-in;
  - a Google Workspace domain (Drive and Slides);
  - a GitHub test repo, and Bitbucket if it stays in scope;
  - the repo secret `ANTHROPIC_API_KEY` and an API budget for the nightly runs;
  - optionally `OPENAI_API_KEY` or `CODEX_API_KEY`, and the repo variable `SHARDS_NIGHTLY_CODEX=true`;
  - access to Codex CLI, T3 Code, a macOS machine and a Windows machine.
- [ ] **npm access** to publish `@proflandrigan/shards` and `@proflandrigan/shards-mcp` (sections 4 and 5).

---

## 2. Can be done now (no external accounts): ✅ done 2026-11-17

All the items below are merged on `next`. The open parts that need a live run are listed at the end of this section.

- [x] **E10.4 release workflow** (`8e38f17`, ADR 0012).
  - `.github/workflows/release.yml` runs on `v*` tags and on dispatch. Default permissions are read-only.
  - It verifies, then builds the claude, codex and skills targets, packs, runs the pack check and uploads artifacts.
  - A tag creates a GitHub Release and force-pushes the generated plugin to the `marketplace` branch. The root `marketplace.json` points there.
  - npm publish runs only when repo variable `SHARDS_NPM_PUBLISH=true` and secret `NPM_TOKEN` are both set.
- [x] **`npm pack` check** (`scripts/pack-check.js`, `npm run pack:check`) runs in `ci.yml`, `release.yml` and the dry run. It checks an explicit allow-list, the required paths and the bin/hook require closure. `package.json` `files` is fixed.
- [x] **Release `package.json` generation** is unified in `build/package.js`, as `releasePackageJson`.
- [x] **E10.5 prep: v1 bins.**
  - `shards-gates` and `shards-sessions` print a notice and forward to `shards gates` / `shards sessions`.
  - `shards-ui` points to Studio.
  - `tools/install.js` refuses unless given `--legacy`; `uninstall` still works.
- [x] **Studio v1 leftovers** (`cdf6c84`). The gate fences, relay, `ui-push`, permission cards, the `cc-readonly` and `permission-pattern` modules, and `ui.*` naming are gone. Gate state comes read-only from runtime state (`/gates`). The guide panel reads `src/docs/manifest.json`.
- [x] **`prompt_lab`** now uses `artifact_emit` (`type=prompt-lab`).
- [x] **`src/ui/` shim removed.** The chat-session test moved to `packages/studio/__tests__/`.
- [x] **CLI help** lists every command, flag and subcommand. `test/cli-help.test.js` scrapes the sources to keep it that way.
- [x] **Plugin icon:** `build/assets/icon.png` (512×512). `ICON_MISSING` is gone.
- [x] **Coupling baseline refreshed** (`abb41d2`): `gate_fences` 11 → 1, `ledger_refs` 36 → 6, `ui_refs` 14 → 1, `via_task_prose` 21 → 3, `subagent_type` 2 → 0.
- [x] **Offline parts of Stage 6** (`5ac642c`), limited to the in-scope core:
  - **E6.11 guardrails:** binding `write_tools` and `guardrails.*` in the config. The PreToolUse hook requires a confirmed `[shards-gate:<id>]` marker, or asks you on Claude Code and denies on Codex, and refuses raw tables. Protocol: `core/protocols/external_writes.md`.
  - **E6.8:** the `copy_report` tool, the queue, `stuck` after 5 tries, and the queue shown in the header, `gate_request` and `doctor`.
  - **E6.9 CLI half:** `shards sync --status`.
  - **E6.10 CLI half:** `shards connect` reads config only and prints `mcp add` commands.

**Still OPEN from this section:**
- [ ] The first real `release.yml` run on a tag. It creates the `marketplace` branch; until then `/plugin marketplace add proflandrigan/shards` cannot resolve.
- [ ] Bumping the version means regenerating `.claude-plugin/marketplace.json`, or the drift test fails. The recipe is in `docs/release.md`.
- [ ] Check the `mcp add` commands printed by `shards connect` against the vendors' docs: the Atlassian SSE URL, the GitHub MCP URL and the Codex forms. They were written from memory.
- [ ] Stage 6 pieces that wait for real bindings or the scope decision:
  - concrete Confluence, Jira and Drive binding files that declare `write_tools`;
  - the `/shards:sync` and `/shards:connect` skills;
  - backfill;
  - publish-knowledge.
- [ ] Minor:
  - `runtime/sessions/index.js` still reads the v1 `.shards/gates/state.json`;
  - dead `.permission-*` CSS rules remain in Studio's `chat.css`;
  - Studio's `package.json` lists a `docs/` directory that no longer exists (copy `src/docs` in at pack time);
  - the Studio gate banner has not been checked in a browser.

---

## 3. Stage 6: Integrations (Milestone C). Needs sandbox accounts

**Do E6.11 guardrails first, on their own.** No external write happens without a confirmed gate or an explicit confirmation, and raw query results never go to Confluence or Jira.

| Track | Tasks, in order |
|---|---|
| 1 · Atlassian | E6.4 Confluence binding → E6.5 Jira binding → E12.7 build tasks as Jira sub-tasks → E4.5b `/shards:publish-knowledge` to Confluence |
| 2 · Google | E6.6 Drive binding + Slides binding (`presentation` job; Syn `[SL]` mode depends on it) |
| 3 · Code review | E6.7 GitHub (`gh` / GitHub MCP) + Bitbucket for PR review mode |
| 4 · Copy pipeline | E6.8 `copy_report` + automatic replay queue → E6.9 `/shards:sync` skill + `shards sync --status` |
| 5 · Onboarding | E6.10 `shards connect` + backfill → E2.12 `/shards:doctor` skill → E6.12 Notion / Linear / GitHub Issues bindings |

**Exit criteria:**
- Atlassian, Drive and Slides copies work in the sandbox.
- With Confluence offline for one gate, the copy is queued and replays at the next gate by itself in at least 9 of 10 runs, across 3 sets.
- A git-only project with 3 confirmed gates connects to Atlassian, with backfill, in under 10 minutes and without editing YAML.

---

## 4. Stage 7 OPEN criteria (built; needs live hosts or runs)

Stage 7 is merged: the Claude Code plugin (E7), the Codex package (E8), other hosts (E9.1, E9.2), migration (E11.11, E10.1), docs (E10.2, E10.3) and CI (E9.4). These checks are still open:

- [ ] **Clean-machine install** of the Claude Code plugin via the marketplace (needs E10.4's `plugins/shards`):
  - skills appear under `/shards:`;
  - subagents appear in the @-mention list;
  - the runtime starts when the plugin is enabled.
- [ ] **Codex CLI** (E8.1–E8.4, E8.7, E0.6). Every Codex format is docs-only so far. Check:
  - `codex plugins install` from a local path;
  - named spawn returns a verdict in at least 9 of 10 runs;
  - the runtime tools are visible, and `gate_advance` and `gate_force_close` always prompt;
  - the hooks fire with real payloads, including whether SubagentStop carries `agent_id`;
  - the switch golden check passes in at least 9 of 10 runs;
  - whether `<PLUGIN_ROOT>` can be replaced by a plugin-relative path;
  - the real `max_depth` / `max_threads` key names (CX-4).
- [ ] **T3 Code with both providers** (E9.1, E0.6). Skills appear in the `/` composer, and switching works on the primary path (manual run against the checklist).
- [ ] **Generic agent-skills package** (E9.2). Smoke test it in at least one host other than Claude Code and Codex, and confirm the Agent Plugins 1.0 `plugin.json` / `mcp.json` schema.
- [ ] **Notebook kernel on macOS and Windows.** Check the install hint and kernel start, including `py` discovery (`docs/notebook.md`). `shards-mcp` itself already passes on both OSes in CI.
- [ ] **Live pass-rate runs.** The harnesses and `nightly.yml` exist, but each harness has run only once.
  - golden sessions: the legacy build should score at least 90% across 3 runs (E0.4);
  - the E11 gate pass-rate criteria;
  - the E12 delegated-build harness.

  These need the API budget from section 1.
- [ ] **First real `nightly.yml` run** publishing scores, on all 3 OSes.

---

## 5. Stage 8: Verify and release (Milestone D). Strictly in order

1. [ ] **E9.3 full test matrix.**
   - Hosts: Claude Code CLI, Codex CLI, T3 + Claude, T3 + Codex.
   - Behaviours: switch, consult, fan-out, plain-language routing, each gate tier, compaction re-ground, Confluence copy and offline queue, and resume.
   - OSes: macOS, Linux and Windows.
   - Record the results in `docs/compat.md`. Switch, consult, at least one human-proof gate tier, re-ground and resume must pass everywhere; any other shortfall needs an ADR and a working fallback.
2. [ ] **E9.5:** record every upstream gap in `docs/compat.md`, each with an issue link, workaround and last-checked date.
3. [ ] **E10.4:** run the release workflow (built in section 2) on a release tag.
4. [ ] **E2.10 / E10.5: publish.**
   - `npm publish --tag next` first (steps in `docs/release.md`).
   - Then v2 to `latest`, with the v1 bins pointing at their replacements.
   - Set the `v-legacy` support window.
   - *Done when:* `npx @proflandrigan/shards install` installs v2.

---

## Suggested order

1. Section 1, first three items: revoke the token, protect `main`, merge PR #72.
2. ~~Section 2~~ (done).
3. Section 3 (Stage 6) and section 4 (the live checks), once the accounts, hosts and budget exist.
4. Section 5 (Stage 8) last.

---

## Done (for reference)

- **Milestones A and B:**
  - three-layer core, runtime and build;
  - gates as tool calls;
  - git binding;
  - sessions;
  - activation and delegation;
  - the Knowledge Ledger removed;
  - the UI moved to Studio;
  - ADRs 0001–0010.
- **Stage 5 follow-ups** (`bf5bd74`):
  - SubagentStop releases leases;
  - ADR 0011 sets the pending-gate policy for subagents;
  - `fanout_start` refuses while a gate is suspended;
  - the ratchet's `--update` accepts new metrics;
  - the lease-sweep test uses a fake clock;
  - the AMS/DLE scaffolding moved to phase 4.
- **Stage 7:**
  - migration (`8f20b31`);
  - Claude Code package (`45c5eeb`, `25c1e1f`);
  - Codex package (`286b65c`);
  - other hosts and CI (`c30a81c`);
  - docs, including the `syn.md` page (`b872b73`, `ae813f9`, `905fb0b`);
  - Windows and Node 18 portability (`a2b168a`).
- **Housekeeping:**
  - the user-owned planning files are committed;
  - `.serena/` and `docs/shards-guide/` are gitignored;
  - the agent worktrees are cleaned up.
