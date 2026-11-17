'use strict';
// fanout_start (E5.9): open one lease over N non-overlapping slices; returns a contract card per slice.
const { defineTool } = require('../registry');
const fanout = require('../fanout');

module.exports = defineTool({
  name: 'fanout_start',
  description: 'Start a fan-out: open one lease over non-overlapping worker slices and return one contract card per slice. Refused while the active frame has a pending or suspended gate. Launch one worker per card in parallel; each worker calls fanout_claim first, writes only inside its owned_paths, and returns verdict JSON. Then call fanout_collect.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['agent', 'slices'],
    properties: {
      agent: { type: 'string', minLength: 1 },
      slices: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['id', 'paths', 'acceptance'], properties: {
        id: { type: 'string', minLength: 1 }, paths: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }, acceptance: { type: 'string', minLength: 1 } } } },
      ttl_ms: { type: 'integer', minimum: 1 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('fanout_start requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const { lease, cards } = await fanout.startFanout(session, args);
    return { text: `Fan-out started: lease ${lease.id}, ${cards.length} slice(s). Launch one worker per card in parallel; then call fanout_collect({lease_id, results}).\n\n${JSON.stringify({ lease_id: lease.id, cards }, null, 2)}` };
  },
});
