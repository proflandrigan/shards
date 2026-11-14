'use strict';
const path = require('path');
const { defineTool } = require('../registry');
const { coreDir, loadAgents, readPersonaSummary } = require('../agents');
const { popFrames, pendingGatesFor, stackNames } = require('../stack');

module.exports = defineTool({
  name: 'return',
  description: 'Return from the current agent: pops one frame, or with `to` pops everything above that agent. The base frame is only popped with pop_base:true. Refused while a popped frame owns a pending gate.',
  inputSchema: {
    type: 'object',
    properties: { to: { type: 'string', minLength: 1 }, pop_base: { type: 'boolean' } },
    additionalProperties: false,
  },
  async handler(args, ctx) {
    if (args.to && args.pop_base) throw new Error('pop_base cannot be combined with `to`');
    const { popped, frames } = await popFrames(ctx.state, { to: args.to, popBase: args.pop_base });
    const top = frames.length ? frames[frames.length - 1] : null;
    let persona = null;
    if (top) {
      const a = loadAgents(coreDir()).get(top.agent);
      if (a && !a.error) persona = { path: a.personaSummaryPath, content: readPersonaSummary(a) };
      else persona = { path: `agents/${path.basename(top.agent)}/persona-summary.md`, content: '' };
    }
    const pending = top ? pendingGatesFor(ctx.state.read('gates').gates, [top]) : [];
    return {
      data: {
        popped: popped.map((f) => f.agent), stack: stackNames(frames), top: top ? top.agent : null,
        persona_summary: persona,
        state_summary: top ? { agent: top.agent, phase: top.phase, project: top.project, pending_gates: pending } : null,
      },
    };
  },
});
