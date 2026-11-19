'use strict';
// gate_force_close (E11.13): supervised (tier-2 rule) force-close of ONE gate in this session.
// Never confirms the gate; the gate ends as force_closed.
const { defineTool } = require('../registry');
const gates = require('../gates');
const tier2 = require('../gates/tier2');
const operator = require('../gates/operator');

module.exports = defineTool({
  name: 'gate_force_close',
  description: 'Force-close a stuck gate after the user approved the host permission prompt for this call. The gate is NOT confirmed (it does not satisfy phase progression); a new gate can be requested. Refused unless the host really prompted the user in a supervised permission mode, and on Codex.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$', description: 'Gate id to force-close' },
      reason: { type: 'string', maxLength: 2000 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_force_close requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    // Validate the gate before consuming the supervised-call (host prompt) record.
    const entry = gates.getGate(session, args.id);
    if (!entry) throw new Error(`gate_force_close refused: unknown gate ${args.id}.`);
    if (!gates.FORCE_CLOSABLE.includes(entry.status)) throw new Error(`gate_force_close refused: gate ${args.id} is ${entry.status}, not open.`);
    const v = await tier2.verifySupervisedCall(session, { tool: 'gate_force_close', host: ctx.host });
    if (!v.ok) {
      try { await operator.logViolation(ctx.root, { kind: 'refused', tool: 'gate_force_close', session: ctx.sessionKey, gate: args.id, host: ctx.host || null, reason: v.reason }); } catch (_) { /* best-effort */ }
      throw new Error(v.reason);
    }
    const closed = await operator.forceClose(ctx.root, ctx.sessionKey, args.id, { actor: 'agent', via: 'host-prompt', reason: args.reason, state: ctx.state });
    if (!closed.length) throw new Error(`gate_force_close refused: gate ${args.id} is ${entry.status}, not open.`);
    return { text: `Gate ${args.id} force-closed by the user (host prompt). It is NOT confirmed; request a new gate if the work should continue.\n\n${JSON.stringify({ result: 'force_closed', gate_id: args.id, status: 'force_closed' }, null, 2)}` };
  },
});
