'use strict';
// fanout_claim (E5.9): a fan-out worker's first call; returns its slice contract.
const { defineTool } = require('../registry');
const fanout = require('../fanout');

module.exports = defineTool({
  name: 'fanout_claim',
  description: 'Fan-out worker only: claim your slice. Call this first with the lease_id and slice_id from your card; returns the slice contract (owned_paths, acceptance, rules). Write only inside owned_paths.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['lease_id', 'slice_id'],
    properties: { lease_id: { type: 'string', minLength: 1 }, slice_id: { type: 'string', minLength: 1 } },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('fanout_claim requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    return { text: JSON.stringify(fanout.claimSlice(session, args.lease_id, args.slice_id), null, 2) };
  },
});
