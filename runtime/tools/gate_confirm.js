'use strict';
// gate_confirm (E11.5, tier 3): the agent relays the user's chat reply. The runtime checks the
// reply against the hook-recorded prompt log; the agent cannot confirm without a real reply.
const { defineTool } = require('../registry');
const gates = require('../gates');
const tier3 = require('../gates/tier3');

module.exports = defineTool({
  name: 'gate_confirm',
  description: 'Relay the user\'s chat reply to a pending gate. Pass the user\'s reply VERBATIM and in full (their whole message), plus your reading of it as `confirmed` or `changes_requested`. Accepted only when the reply is the user\'s first message after the gate was requested. Never call this without a real user reply; if refused, stop and wait.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['id', 'decision', 'user_reply'],
    properties: {
      id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 128 },
      decision: { type: 'string', enum: ['confirmed', 'changes_requested'] },
      user_reply: { type: 'string', minLength: 1, maxLength: 20000 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_confirm requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const r = await tier3.confirmByReply(session, args);
    if (!r.ok) throw new Error(r.refusal);
    const e = r.entry;
    if (r.result === 'changes_requested') {
      return { text: `Gate ${e.id} recorded as changes_requested with the user's note. Address it, then call gate_request again.\n\n${JSON.stringify({ result: r.result, gate_id: e.id, status: e.status, note: e.note }, null, 2)}` };
    }
    return { text: `${gates.formatConfirmedMessage(e)}\n\n${JSON.stringify({ result: r.result, gate_id: e.id, status: e.status, commit: e.commit || null }, null, 2)}` };
  },
});
