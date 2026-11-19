'use strict';
// gate_resume (E5.5): suspended -> pending. Needs no human proof, but resets the tier-3
// high-water mark so a FRESH confirmation message is required afterwards.
const { defineTool } = require('../registry');
const gates = require('../gates');

module.exports = defineTool({
  name: 'gate_resume',
  description: 'Resume a suspended gate (suspended -> pending) after re-entering its agent. No user proof needed, but confirming it afterwards requires a new user message. The gate is re-homed to your current frame.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['id'],
    properties: { id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 128 } },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_resume requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const g0 = gates.getGate(session, args.id);
    if (!g0) throw new Error(`Unknown gate ${args.id}`);
    const frames = ctx.state.read('frames').frames || [];
    const top = frames[frames.length - 1];
    if (!top || top.agent !== g0.agent) throw new Error(`Gate ${args.id} belongs to ${g0.agent}; re-enter that agent first (active: ${top ? top.agent : 'none'})`);
    const entry = await gates.resumeGate(session, args.id, { proof: { tier: 'agent-resume' }, frame: top.id });
    return { data: { result: 'resumed', gate_id: entry.id, status: 'pending', frame: top.id, note: 'Gate is pending again. Call gate_request to re-surface it; only a new user message can confirm it.' } };
  },
});
