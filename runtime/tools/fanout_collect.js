'use strict';
// fanout_collect (E5.9): merge worker verdicts (worst wins) and close the lease.
const { defineTool } = require('../registry');
const fanout = require('../fanout');

module.exports = defineTool({
  name: 'fanout_collect',
  description: 'Collect fan-out results, one per slice. Fix leases: {slice_id, verdict, summary?, findings?} with verdict APPROVED, NEEDS REVISION or BLOCKED; merged worst-wins and returned as the verdict. Review leases: {slice_id, status, summary?, findings?} with status CONFIRMED, PLAUSIBLE or REFUTED; verdict is APPROVED only if every status is REFUTED, else NEEDS REVISION, with counts and per_slice. Closes the lease. Every slice must have exactly one result.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['lease_id', 'results'],
    properties: {
      lease_id: { type: 'string', minLength: 1 },
      results: { type: 'array', minItems: 1, items: { type: 'object', required: ['slice_id'], anyOf: [{ required: ['verdict'] }, { required: ['status'] }], properties: {
        slice_id: { type: 'string', minLength: 1 }, verdict: { type: 'string', enum: ['APPROVED', 'NEEDS REVISION', 'BLOCKED'] },
        status: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] }, summary: { type: 'string' }, findings: {} } } },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('fanout_collect requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const merged = await fanout.collectFanout(session, args.lease_id, args.results);
    return { text: `Fan-out ${args.lease_id} collected: ${merged.verdict}. Lease closed.\n\n${JSON.stringify(merged, null, 2)}` };
  },
});
