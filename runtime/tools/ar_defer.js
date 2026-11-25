'use strict';
// ar_defer (issue #91, H3 / bug 14): queue a decision for a human without blocking an unattended AR loop.
const { defineTool } = require('../registry');
const R = require('../research');

module.exports = defineTool({
  name: 'ar_defer',
  description: 'Defer a decision that needs a human (unattended/overnight AR runs) instead of raising a blocking gate. Commits a needs-human entry (AR-Decision: needs-human, AR-Needs-Human: <kind>) on the research ref and adds it to the run\'s deferred list, which ar_status and ar_end report and the Phase 3 human gate must present. kind=retro_revert also restores the mutable scope to the kept state before iteration retro_to_iteration and moves lastKeptCommit, lastGreenCommit and the comparison reference there. The loop then continues with the next iteration number. Attended runs keep the blocking gate instead.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'detail'],
    properties: {
      run_id: { type: 'string', minLength: 1, description: 'Default: the active run of this session.' },
      kind: { enum: R.DEFER_KINDS, description: 'retro_revert (reviewer RETRO_REVERT), pause (reviewer PAUSE or a steering PAUSE), floor_breach (metric floor breached on a full eval), other.' },
      detail: { type: 'string', minLength: 1, maxLength: 2000, description: 'What the human must decide and why (the reviewer reason, the breached value, ...).' },
      retro_to_iteration: { type: 'integer', minimum: 1, description: 'kind=retro_revert only: the first invalid iteration M; the run goes back to the kept state before M.' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_defer requires a resolved session');
    if (args.kind !== 'retro_revert' && args.retro_to_iteration !== undefined) throw new Error('ar_defer: retro_to_iteration is only valid with kind=retro_revert');
    const { run, item, retro } = await R.defer(ctx, args);
    return {
      data: {
        deferred: item,
        pending: R.pendingDeferred(run).length,
        ...(retro ? { retro_revert: { to_iteration: retro.to_iteration, lastKeptCommit: run.lastKeptCommit, lastGreenCommit: run.lastGreenCommit, comparisonReference: run.comparisonReference, restored: retro.restored, deleted: retro.deleted } } : {}),
        status: run.status,
        next: run.status === 'active'
          ? 'Recorded for the Phase 3 human gate. Continue the loop with the next hypothesis (ar_iterate); do not raise a gate for it.'
          : `The run has stopped (${run.stop_reason}); call ar_end and present the deferred items at the Phase 3 gate.`,
      },
    };
  },
});
