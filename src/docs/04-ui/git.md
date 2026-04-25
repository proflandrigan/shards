# Git

Git integration in the Shards UI: status, diffs, and PR review.

## Source Control sidebar

Click the branch icon in the activity bar (or `Cmd+Shift+G`). Shows:

- Current branch + upstream tracking state.
- List of changed files grouped by status: Modified / Added / Deleted / Untracked.
- A badge on the activity-bar button shows the change count when the sidebar is collapsed.
- Multi-repo projects: a repo picker at the top switches which repo the view shows.

## Diff view

Click any changed file → opens a split-pane diff in the right workspace.

- Left: the committed version. Right: the working copy.
- Hunks are navigable (up/down arrows in the diff toolbar).
- Line numbers are preserved.

## Commit / push

Commits are not performed from the UI — it is intentionally read-only for git state changes. Use Claude Code directly or your shell. This is a deliberate choice: commits often interact with hooks, signing, and pre-commit checks better handled in the terminal.

## PR review

When the working tree is on a branch with an open PR (detected via `gh`):

- "PR" tab appears in the source-control view.
- PR title + description at the top.
- File tree shows files changed vs. the base branch.
- Inline comment threads appear in the diff.
- Syn's PR Review mode (`Syn → [PR]`) can populate threaded review drafts into this view.

See `src/agents/specific_instructions/syn/pr_review.md` for how Syn participates.

## HUD integration

The HUD strip above the sidebar shows:

- Current branch.
- Pending PR comment count (if reviewing a PR).
- Pin count.

## Troubleshooting

- If the UI shows "no git repo detected": check that you launched `shards-ui` from inside a git working tree.
- If PR info is missing: verify `gh auth status` works from your shell.

## See also

- [Activity Bar](activity-bar.md)
- [Syn PR Review](../02-agents/syn.md)
