# Git binding

`bindings/git.md` is the always-on default for all six jobs and the worked example for the binding format. It needs no MCP tools, no credentials and no setup.

## What each job does under git

| Job | Verbs | Behaviour |
|-----|-------|-----------|
| `record` | `record.write`, `record.read` | Updates the current phase's section of `{output_dir}/project-specs.md` (path from `jobs.record.options.path`). Reads the section back to you before the gate. |
| `tasks` | `tasks.create`, `tasks.update`, `tasks.list` | Keeps `TASKS.md` at the project root as a readable checklist mirroring the manifest `<output_dir>/tasks.yaml`. The YAML is the manifest. |
| `knowledge` | `knowledge.search`, `knowledge.read`, `knowledge.write` | Searches `docs/` (and `git log` when `git_log` is true), reads sections of files under the configured paths, writes markdown files under `docs/`. |
| `review` | `review.fetch`, `review.comment` | Fetches `git diff <base>...HEAD` and, if `gh` is available, PR comments (read-only). Comments go to `<output_dir>/review-comments.md`; nothing is posted to GitHub. |
| `artifacts` | `artifact.emit`, `artifact.list` | Writes and lists files under the agent's output directory. Files over the denylist size limit or matching a denylist glob stay local. |
| `presentation` | `presentation.create`, `presentation.update` | Deck source under `presentations/<slug>/` as `index.md` or `index.html`. |

## Gate commits

The agent writes files and reports the gate; it never stages, commits or pushes for a gate. When a human confirms an advancing gate, the runtime does the git work:

- It takes the diff of each file under the agent's `output_dir` and commits only those paths on the current branch with subject `shards gate <gate-id>` and `Shards-Gate:` / `Shards-Agent:` trailers. Files you staged elsewhere are not included.
- Before committing it writes a snapshot to `refs/shards/pending/<gate>-<seq>` and a record to `.shards/state/git-pending.json`, so a failed commit can be replayed.
- Denylisted and oversized files are skipped, never deleted. Agents with `output_dir: null` produce no commit.
- Non-advancing gates (`checkpoint`, `confirm`) do not commit.
- The runtime never pushes; `git.push` has no effect today.
- If HEAD is detached, a merge or rebase is in progress, signing is required or there is no repository, the gate is still confirmed and the commit is left as `commit_pending` to retry later.

Add `.shards/` to the project's `.gitignore`; gate commits do not cover it. Full reference: `docs/gates.md` in the repository.

## See also

- [Jobs and bindings](overview.md)
- [Configuration](config.md)
- [Gate pattern](../03-protocols/gate-pattern.md)
