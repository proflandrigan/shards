---
name: git
description: Always-on binding. Git is the source of truth; all jobs work on local files committed to the current branch.
jobs: [record, tasks, knowledge, review, artifacts, presentation]
required_settings: []
expected_tools: []
verbs:
  record: [record.write, record.read]
  tasks: [tasks.create, tasks.update, tasks.list]
  knowledge: [knowledge.search, knowledge.read, knowledge.write]
  review: [review.fetch, review.comment]
  artifacts: [artifact.emit, artifact.list]
  presentation: [presentation.create, presentation.update]
---

# Git binding

This binding is the worked example for the binding format in [`bindings/README.md`](README.md). It is the default for every job in `shards.config.yaml`.

Git needs no MCP tools, no credentials and no `copy_report` call. Every verb below uses ordinary file tools (Read, Write, Edit, Glob, Grep) and, where stated, read-only git or `gh` commands. The agent never runs `git commit` or `git push` itself for a gate. Commit mechanics belong to the runtime (see "Gate commits" at the end).

## verb: record.write

Writes the project record at `jobs.record.options.path`. The default is `{output_dir}/project-specs.md`, with `{output_dir}` set to the active agent's output directory.

1. Read the path from the resolved `record` job options. If it is missing, use `{output_dir}/project-specs.md`.
2. Create the parent directory if it does not exist.
3. Update the section for the current phase using Edit. Do not rewrite sections for other phases.
4. Read the section back to the user before the gate is requested.

## verb: record.read

1. Read the path from the resolved `record` job options (default above).
2. Return the requested section, or the whole file if no section was named.

## verb: tasks.create

Adds items to `TASKS.md` at the project root (`jobs.tasks.options.path`, default `TASKS.md`). `TASKS.md` is a markdown checklist that mirrors `<output_dir>/tasks.yaml`, the task manifest.

1. Append a checklist item per new task: `- [ ] <id>: <title>`, with the owner or phase in parentheses if known.
2. Update `<output_dir>/tasks.yaml` to match. The YAML is the manifest; `TASKS.md` is its readable mirror.
3. Do not renumber existing items.

## verb: tasks.update

1. Find the item by id in `TASKS.md`.
2. Change its checkbox (`[x]` when done, `[ ]` when reopened) or its text using Edit.
3. Make the same change in `<output_dir>/tasks.yaml`.

## verb: tasks.list

1. Read `<output_dir>/tasks.yaml` if it exists; otherwise parse `TASKS.md`.
2. Return the open items first, then the closed ones, each with id, title and status.

## verb: knowledge.search

Searches `docs/` (`jobs.knowledge.options.paths`, default `docs/`) and, when `git_log` is true (the default), the git history.

1. Grep the configured paths for the query terms, case-insensitive. Return file paths and matching lines.
2. If `git_log` is true, run `git log --oneline -i --grep="<term>"` and `git log -S "<term>" --oneline` for code and doc changes. Keep the output short.
3. Return the matches with their file paths or commit hashes. Do not return whole files.

## verb: knowledge.read

1. Read the file named by the search result, or the requested path under the configured `paths`. Refuse paths outside those roots.
2. Return the relevant section, not the whole file, unless the user asked for it.

## verb: knowledge.write

Adds a markdown file under `docs/`. Writing is a local change; it is committed at the next confirmed gate like any other output.

1. Choose a slug from the title (lowercase, hyphens) and create `docs/<slug>.md`. If the file exists, add a section with Edit rather than overwriting it.
2. Start the file with a title, a one-line summary, and the date and source (phase or gate id).
3. Do not write secrets, credentials or raw data samples into `docs/`. The denylist does not scan document text.

## verb: review.fetch

Gets review material from the local repository.

1. For a local review, run `git diff <base>...HEAD` (base defaults to the main branch). Use `git diff --stat` first to size the change.
2. If `gh` is installed and the branch has a pull request (`gh pr view --json number,title,url`), also fetch its review comments with `gh api repos/{owner}/{repo}/pulls/<number>/comments`. Read-only.
3. Return the diff summary and any comments. If `gh` is missing or unauthenticated, say so and continue with the local diff only.

## verb: review.comment

Writes review comments to a local file. Nothing is posted to GitHub.

1. Append each comment to `<output_dir>/review-comments.md` with file, line, severity and text.
2. Do not run `gh pr review` or `gh api` write calls from this verb.

## verb: artifact.emit

Writes generated files under `jobs.artifacts.options.path`, which defaults to `{output_dir}`.

1. Resolve the target path under the agent's output directory. Refuse paths outside it.
2. Write the file with Write. Use the file type the agent produced (CSV, JSON, Python, markdown, model file under the denylist size limit).
3. Files over `git.denylist.max_file_size_bytes` or matching a denylist glob are written locally but are not committed. Say so in the gate summary.

## verb: artifact.list

1. Glob the output directory (`{output_dir}/**`), excluding anything the denylist would skip.
2. Return each path with its size and modification time.

## verb: presentation.create

Creates a presentation source under `presentations/<slug>/`, where `<slug>` is the deck name in lowercase with hyphens.

1. Create `presentations/<slug>/` if it does not exist.
2. Write the deck source as `presentations/<slug>/index.md` (markdown outline) or `presentations/<slug>/index.html` (single-file HTML), following the presentation spec template.
3. Write any supporting figures next to it. Keep them under the denylist size limit.

## verb: presentation.update

1. Read the existing source under `presentations/<slug>/`.
2. Edit only the slides or sections that changed, keeping slide ids stable.
3. Record the change in the deck's changelog section, if present.

## Gate commits (performed by the runtime)

The git binding does not commit. At gate confirmation the runtime handles all git writes, in `runtime/git/index.js` (E6.3). Full reference: `docs/gates.md`, sections 6 and 8. The behaviour as implemented:

- **Scope.** The runtime takes the full diff against HEAD of each file under the agent's `output_dir` (`{project}` substituted). It is not limited to the files written under the gate. Agents with `output_dir: null` produce no commit. `.gitignore` applies to untracked files only. Tracked files are still included when `.gitignore` matches them. The denylist (`git.denylist.globs`) and `git.denylist.max_file_size_bytes` (default 5 MiB) exclude files, tracked or not. An excluded tracked file is left alone, not deleted. Leased paths are excluded through `getLeasedPaths`, which returns no paths until E5.9.
- **Snapshot first.** Before the commit, the changed files are written as a commit object (parent = HEAD) to `refs/shards/pending/<gate>-<seq>` (one ref per pending record; stores written before this change keep their bare `<gate>` ref), and a record goes to `.shards/state/git-pending.json`. The user's index and working tree are not touched. The ref is deleted on success.
- **Commit only those paths.** Normal case: `git commit --only` of the changed paths on the current branch, subject `shards gate <gate-id>`, with `Shards-Gate:` and `Shards-Agent:` trailers. Files the user staged outside the gate are not included. If the working tree has moved on (for example, an older gate is replayed), the commit is built from the snapshot blobs on a temporary index and HEAD moves with `update-ref` against its old value. `pre-commit` runs on both paths under `hookTimeoutMs` (default 30 s). `commit-msg` runs only on the normal path.
- **Outcome.** The gate's `commit` field is `committed` (with `sha`), `skipped` (`nothing_to_commit`, `no_output_dirs`, or `non_advancing_kind`), or `commit_pending` (with `reason`). The gate is confirmed either way.
- **Retries.** Pending records replay in gate order at the start of each `gate_request` and `gates confirm`, and before each new gate commit. Replay at session end and from `doctor` is not implemented. Counted failures (hook failure, hook timeout, `git commit` failure) back off 60 s, 300 s, 900 s, then 3600 s. The fifth counted failure marks the record `stuck`. Precondition waits (no repo, detached HEAD, a merge, rebase, cherry-pick or revert in progress, signing required, commit disabled, HEAD moved) retry every 60 s and are not counted. A `stuck` record blocks every later gate commit in the project. Nothing clears it yet.
- **Push.** Never. The runtime does not push, and `git.push` has no effect.
- **Fallbacks.** Detached HEAD, a merge, rebase, cherry-pick or revert in progress, a signing requirement (`commit.gpgsign=true`), or no repository leaves the snapshot ref and pending record in place (`commit_pending`). Nothing is committed until the condition clears and the record replays. `doctor` does not exist yet, so no warning is shown.
- **Monorepo.** The project root may be a subdirectory of the git toplevel. Covered by `test/git-binding-commit.test.js`.
- **Ignored state.** `.shards/` is not committed by gate commits, because no current output directory covers the project root. Target projects must still gitignore `.shards/`. The legacy installer does not do this yet (OPEN, installer and doctor).

The agent's job is to write the files and report the gate. It does not stage, commit, push or create refs for gates.
