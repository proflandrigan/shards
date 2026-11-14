'use strict';
const { defineTool } = require('../registry');
const ops = require('../sessions/ops');

module.exports = defineTool({
  name: 'sessions_resume',
  description: 'Look up a session by id (or unique prefix) and return its index entry plus per-host resume hints. Resume itself is host-side; this prints the command.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false },
  async handler(args, ctx) {
    const { entry, hints, host } = ops.resumeInfo(ctx.root, args.id);
    return { data: { entry, hints, host } };
  },
});
