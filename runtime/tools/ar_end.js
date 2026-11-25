'use strict';
// ar_end (issue #91, H1): record the stop reason on the research ref, close the AR lease, mark the run ended.
const { defineTool } = require('../registry');
const R = require('../research');

module.exports = defineTool({
  name: 'ar_end',
  description: 'End an autonomous-research run: commits the stop reason (AR-Stop trailer) on its research ref, closes the AR lease and marks the run ended. The kept state stays uncommitted in the working tree; it reaches the user branch only through the Phase 3 convergence gate (human).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      run_id: { type: 'string', minLength: 1 },
      reason: { type: 'string', minLength: 1, description: 'Stop reason (the runtime stop_reason, or e.g. user-interrupt, reviewer-pause, consecutive-failures).' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_end requires a resolved session');
    const { run, closed } = await R.end(ctx, args);
    return {
      data: {
        ...R.summary(run, { leaseActive: false }),
        lease_closed: closed ? closed.id : null,
        kept_diff: `git diff ${run.pre_loop_head} ${run.lastKeptCommit} -- ${run.mutable.join(' ')}`,
        journal: `git log --format='%h %s%n%(trailers:only)' ${run.pre_loop_head}..${run.ref}`,
        note: 'Kept changes are uncommitted in the working tree. Present them at the Phase 3 gate; the user branch is never changed by the AR tools.',
      },
    };
  },
});
