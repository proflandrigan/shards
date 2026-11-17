'use strict';
// copy_report (E6.8): the agent reports the outcome of one external copy (a binding write through the host's
// MCP tools). The runtime records it, queues failures and caps retries; it never writes externally (D4).
const { defineTool } = require('../registry');
const copies = require('../copies');

module.exports = defineTool({
  name: 'copy_report',
  description: 'Report the result of one external copy (Confluence, Jira, Drive, ...) of a CONFIRMED gate, right after the binding write. ok=false queues it for retry at the next gate (max 5 attempts, then stuck). Call again with ok=true after a retry succeeds.',
  inputSchema: {
    type: 'object',
    required: ['gate_id', 'target', 'ok'],
    additionalProperties: false,
    properties: {
      gate_id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 128 },
      target: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$', maxLength: 64, description: 'Binding or destination name, e.g. confluence, jira' },
      ok: { type: 'boolean' },
      error: { type: 'string', maxLength: 1000, description: 'Why the write failed (ok=false)' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('copy_report requires a resolved session');
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const { entry, result } = await copies.report(session, args);
    const msg = {
      done: `Copy of gate ${entry.gate_id} to ${entry.target} recorded as done.`,
      queued: `Copy of gate ${entry.gate_id} to ${entry.target} failed (attempt ${entry.attempts} of ${copies.MAX_ATTEMPTS}); queued. Retry it at the next gate, then call copy_report again.`,
      stuck: `Copy of gate ${entry.gate_id} to ${entry.target} is STUCK after ${entry.attempts} failed attempts. Do not retry it; tell the user (see \`shards sync --status\`).`,
    }[result];
    return { text: `${msg}\n\n${JSON.stringify({ result, gate_id: entry.gate_id, target: entry.target, attempts: entry.attempts, queue: copies.queued(session), stuck: copies.stuck(session) }, null, 2)}` };
  },
});
