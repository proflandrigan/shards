'use strict';
const { defineTool } = require('../registry');
const ops = require('../sessions/ops');

module.exports = defineTool({
  name: 'sessions_list',
  description: 'List recorded Shards chat sessions (from .shards/sessions/INDEX.json), most recent first.',
  inputSchema: {
    type: 'object',
    properties: { status: { type: 'string', enum: ['active', 'ended', 'abandoned'] }, limit: { type: 'integer', minimum: 1 } },
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const rows = ops.listRows(ctx.root, { status: args.status, limit: args.limit });
    return { data: { count: rows.length, sessions: rows } };
  },
});
