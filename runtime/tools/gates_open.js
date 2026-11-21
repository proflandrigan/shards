'use strict';
// gates_open (E5.5): read-only view of open gates. Used by final_review to refuse.
const { defineTool } = require('../registry');
const gates = require('../gates');

module.exports = defineTool({
  name: 'gates_open',
  description: 'List pending and suspended gates in this session. any_blocking_final_review is true if either exists (final review must then be refused).',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async handler(_args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gates_open requires a resolved session');
    const all = gates.listGates({ root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state });
    const row = (g) => ({ id: g.id, kind: g.kind, phase: g.phase, agent: g.agent, frame: g.frame, status: g.status });
    const pending = all.filter((g) => g.status === 'pending').map(row);
    const suspended = all.filter((g) => g.status === 'suspended').map(row);
    return { data: { pending, suspended, any_blocking_final_review: pending.length + suspended.length > 0 } };
  },
});
