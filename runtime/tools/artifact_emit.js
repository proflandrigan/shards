'use strict';
const { defineTool } = require('../registry');
const { EVENT_TYPES, emitEvent } = require('../lib/events');

module.exports = defineTool({
  name: 'artifact_emit',
  description: 'Emit a UI artifact event (append one line to .shards/events.jsonl). path is project-relative and required unless type is "close".',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: EVENT_TYPES },
      path: { type: 'string' },
      meta: { type: 'object' },
    },
    required: ['type'],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    if (args.type !== 'close' && (args.path === undefined || args.path === '')) {
      throw new Error(`artifact_emit: path is required for type '${args.type}'`);
    }
    const event = await emitEvent(ctx, args);
    return { data: { ok: true, event } };
  },
});
