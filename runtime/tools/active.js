'use strict';
const { defineTool } = require('../registry');

module.exports = defineTool({
  name: 'active',
  description: 'Show the agent stack for this session (base first, top last).',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async handler(_args, ctx) {
    const frames = ctx.state.read('frames').frames || [];
    return { data: { stack: frames, top: frames.length ? frames[frames.length - 1] : null, depth: frames.length } };
  },
});
