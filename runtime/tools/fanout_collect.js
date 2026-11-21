'use strict';
// fanout_collect (E5.9): merge worker verdicts (worst wins) and close the lease.
const { defineTool } = require('../registry');
const fanout = require('../fanout');

module.exports = defineTool({
  name: 'fanout_collect',
  description: 'Collect fan-out results: one {slice_id, verdict, summary?, findings?} per slice (verdict APPROVED, NEEDS REVISION or BLOCKED). Merges worst-wins (BLOCKED, then NEEDS REVISION, else APPROVED), closes the lease and returns the merged verdict. Every slice must have exactly one result.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['lease_id', 'results'],
    properties: {
      lease_id: { type: 'string', minLength: 1 },
      results: { type: 'array', minItems: 1, items: { type: 'object', required: ['slice_id', 'verdict'], properties: {
        slice_id: { type: 'string', minLength: 1 }, verdict: { type: 'string', enum: ['APPROVED', 'NEEDS REVISION', 'BLOCKED'] }, summary: { type: 'string' }, findings: {} } } },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('fanout_collect requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const merged = await fanout.collectFanout(session, args.lease_id, args.results);
    return { text: `Fan-out ${args.lease_id} collected: ${merged.verdict}. Lease closed.\n\n${JSON.stringify(merged, null, 2)}` };
  },
});
