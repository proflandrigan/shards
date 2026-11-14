'use strict';
// gate_suspend (E5.5, D2): park a pending gate so its frame can be left. Needs the same human
// proof as a confirmation (tier 1 elicitation if available, else tier 3 chat reply).
const { defineTool } = require('../registry');
const gates = require('../gates');
const tier1 = require('../gates/tier1');
const tier3 = require('../gates/tier3');

module.exports = defineTool({
  name: 'gate_suspend',
  description: 'Suspend a pending gate (so you can return from its frame) ONLY when the user has asked to. Pass the user\'s reply VERBATIM and in full (their first message after the gate was requested). Refused without valid proof; state is unchanged then. A suspended gate does not block return but blocks final review and ending the session.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 128 },
      user_reply: { type: 'string', minLength: 1, maxLength: 20000 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_suspend requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const g = gates.getGate(session, args.id);
    if (!g) throw new Error(`Unknown gate ${args.id}`);
    if (g.status !== 'pending') throw new Error(`Gate ${args.id} is ${g.status}; only a pending gate can be suspended`);

    // Tier 1: ask via form (approve = suspend).
    const el = await tier1.elicitGate(ctx, { ...g, summary: `SUSPEND this gate (leave its phase unfinished and return to the previous agent). Approve = suspend. ${g.summary || ''}`.trim() });
    if (el.outcome === 'approved') {
      const entry = await gates.suspendGate(session, args.id, { proof: { tier: 'elicitation', level: 1, ts: new Date().toISOString(), action: 'accept' } });
      return { data: { result: 'suspended', gate_id: entry.id, status: entry.status, tier: 'elicitation' } };
    }
    if (typeof args.user_reply !== 'string') {
      throw new Error(`Suspension needs the user's say-so. Ask the user, then call gate_suspend(id="${args.id}", user_reply=<their words>). ${tier3.FIXED_REFUSAL}`);
    }
    const r = await tier3.suspendByReply(session, { id: args.id, user_reply: args.user_reply });
    if (!r.ok) throw new Error(r.refusal);
    return { data: { result: 'suspended', gate_id: r.entry.id, status: r.entry.status, tier: 'chat-reply' } };
  },
});
