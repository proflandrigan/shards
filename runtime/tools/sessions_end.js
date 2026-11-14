'use strict';
const { defineTool } = require('../registry');
const ops = require('../sessions/ops');

module.exports = defineTool({
  name: 'sessions_end',
  description: 'End a session cleanly (default: the current one). Refused while the session has pending or suspended gates (force-close is operator-only). Replays pending git commits, then marks the session ended in the index.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, additionalProperties: false },
  async handler(args, ctx) {
    const data = await ops.endSession(ctx.root, { id: args.id, currentKey: ctx.sessionKey, state: ctx.state, reason: 'tool_end' });
    return { data };
  },
});
