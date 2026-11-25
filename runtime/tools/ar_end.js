'use strict';
// ar_end (issue #91, H1): record the stop reason on the research ref, close the AR lease, mark the run ended.
const { defineTool } = require('../registry');
const R = require('../research');

module.exports = defineTool({
  name: 'ar_end',
  description: 'End an autonomous-research run: commits the stop reason (AR-Stop trailer) on its research ref, closes the AR lease (for a branch run: removes the branch from the shared lease) and marks the run ended. Solo run: the kept state stays uncommitted in the working tree. Branch run: the worktree is removed (unless keep_worktree) and the kept state is the tree of lastKeptCommit on the branch ref. Either way it reaches the user branch only through the Phase 3 convergence gate (human). Returns the pending deferred decisions (ar_defer) that the Phase 3 gate must present.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      run_id: { type: 'string', minLength: 1 },
      branch: { type: 'string', minLength: 1, description: 'Branch run (AR fan-out): which branch of the run. Needed when several branch runs are active.' },
      keep_worktree: { type: 'boolean', description: 'Branch runs: keep the worktree (default: removed; the kept state stays on the research ref).' },
      reason: { type: 'string', minLength: 1, description: 'Stop reason (the runtime stop_reason, or e.g. user-interrupt, reviewer-pause, consecutive-failures).' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_end requires a resolved session');
    const { run, closed, worktreeRemoved } = await R.end(ctx, args);
    const paths = run.mutable.map((m) => (/[*?[]/.test(m) ? `':(glob)${m}'` : m)).join(' ');
    const deferredNote = R.pendingDeferred(run).length ? ' The deferred decisions listed above must be presented there for the user to confirm or reject (a rejected retro_revert means restoring the reverted iterations by hand).' : '';
    return {
      data: {
        ...R.summary(run, { leaseActive: false }),
        lease_closed: closed ? closed.id : null,
        kept_diff: `git diff ${run.pre_loop_head} ${run.lastKeptCommit} -- ${paths}`,
        journal: `git log --format='%h %s%n%(trailers:only)' ${run.pre_loop_head}..${run.ref}`,
        ...(run.worktree ? {
          worktree: run.worktree.path, worktree_removed: !!worktreeRemoved,
          promote: `git diff --binary ${run.pre_loop_head} ${run.lastKeptCommit} -- ${paths} | git apply`,
        } : {}),
        note: run.worktree
          ? `Branch run: the kept state is ${run.lastKeptCommit} on ${run.ref}${worktreeRemoved ? ' (worktree removed)' : ` (worktree kept at ${run.worktree.path})`}. Nothing reached the user branch. After arbitration, the human Phase 3 gate promotes the winner only: apply \`promote\` in the main tree (or cherry-pick its kept diff), then the gate commit records it.${deferredNote}`
          : `Kept changes are uncommitted in the working tree. Present them at the Phase 3 gate (requires_human); the user branch is never changed by the AR tools.${deferredNote}`,
      },
    };
  },
});
