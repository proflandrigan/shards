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

The git binding does not commit. At gate confirmation the runtime handles all git writes. This is specified in E6.3 (Stage 4) and is not yet implemented. The intended behaviour is:

- **Explicit file list.** The runtime builds the list from the agent's `output_dir` and the paths written under this gate. It respects `.gitignore` and the denylist (`git.denylist`), even for files already tracked. In-flight paths held by a fan-out lease are excluded.
- **Snapshot first.** The selected files are snapshotted to `refs/shards/pending/<gate>` as a tree object, without a checkout, so a later commit can be replayed exactly.
- **Commit only those paths.** `git commit --only <files>` on the current branch, with `Shards-Gate:` and `Shards-Agent:` trailers. Files the user staged for their own work are not included. Pre-commit hooks run under a timeout.
- **Outcome.** `committed`, or `commit_pending(reason)`. The gate is confirmed in the runtime either way. Pending commits are retried in gate order at the next gate, at session end, and from `doctor`, capped at 5 tries with backoff.
- **Push.** Only if `git.push` is `true`.
- **Fallbacks.** Detached HEAD, a merge or rebase in progress, a signing prompt, or no repository leaves the snapshot ref in place and `doctor` warns.

The agent's job is to write the files and report the gate. It does not stage, commit, push or create refs for gates.
