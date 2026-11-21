'use strict';
// gate_advance (E11.4, tier 2): confirms the pending gate only when the host prompted the user.
const { defineTool } = require('../registry');
const gates = require('../gates');
const tier2 = require('../gates/tier2');

function both(text, data) { return { text: `${text}\n\n${JSON.stringify(data, null, 2)}` }; }

module.exports = defineTool({
  name: 'gate_advance',
  description: 'Confirm your pending gate after the user approved the host permission prompt for this call. Refused unless the host really prompted the user in a supervised permission mode. Never call it to bypass the user; on refusal do not retry, use the form or ask the user to reply in chat.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$', description: 'Gate id to confirm' },
      note: { type: 'string', maxLength: 2000 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_advance requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const entry = gates.getGate(session, args.id);
    if (!entry) throw new Error(`gate_advance refused: unknown gate ${args.id}. Use tier 1 or tier 3.`);
    if (entry.status !== 'pending') throw new Error(`gate_advance refused: gate ${args.id} is ${entry.status}, not pending.`);
    const frames = ctx.state.read('frames').frames || [];
    const top = frames[frames.length - 1];
    if (!top || entry.frame !== top.id) throw new Error(`gate_advance refused: gate ${args.id} is not pending in the top frame. Use tier 1 or tier 3.`);
    const v = await tier2.verifySupervisedCall(session, { tool: 'gate_advance', host: ctx.host });
    if (!v.ok) throw new Error(v.reason);
    const { entry: done, commit } = await gates.confirmGate(session, args.id, { decision: 'confirmed', proof: v.proof, ...(args.note ? { note: args.note } : {}) });
    const c = commit || done.commit || null;
    return both(`Gate ${done.id} confirmed by the user (host prompt). Continue with the next phase.`, { result: 'confirmed', gate_id: done.id, status: 'confirmed', commit: c });
  },
});
