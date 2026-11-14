'use strict';
// auto_verify_start (E11.12): open a budgeted, time-limited auto-verify block for bulk
// read-only verification work.
const { defineTool } = require('../registry');
const av = require('../auto-verify');

module.exports = defineTool({
  name: 'auto_verify_start',
  description: 'Start an auto-verify block: for a bounded number of tool calls and a bounded time, hardcoded read-only verification calls (Read/Glob/Grep, SELECT-only warehouse CLI SQL, dbt show/ls, git status/log/diff, ...) are auto-approved without prompts. Anything else still prompts. Gates always win: a pending or suspended gate ends the block. Only for the active agent.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['agent', 'phase', 'tool_budget', 'ttl_s'],
    properties: {
      agent: { type: 'string', minLength: 1 },
      phase: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'string', pattern: '^\\d+(-\\d+)?$' }] },
      tool_budget: { type: 'integer', minimum: 1, maximum: 200 },
      ttl_s: { type: 'integer', minimum: 30, maximum: 3600 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('auto_verify_start requires a resolved session');
    const frames = ctx.state.read('frames').frames || [];
    const top = frames[frames.length - 1];
    if (!top) throw new Error('auto_verify_start refused: no active frame. Activate an agent first.');
    if (top.agent !== args.agent) throw new Error(`auto_verify_start refused: active agent is ${top.agent}, not ${args.agent}.`);
    const st = await av.start({ root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state }, args);
    return { text: [
      `Auto-verify block started for ${args.agent} (phase ${args.phase}).`,
      `Budget: ${st.tool_budget} auto-approved read-only tool calls; TTL: ${st.ttl_s}s (expires ${new Date(st.expires_at).toISOString()}).`,
      'Only hardcoded read-only operations are auto-approved; everything else still prompts and does not consume budget.',
      'Gates always win: if a gate becomes pending or suspended, the block ends immediately. Call auto_verify_end when the verification stretch is done.',
    ].join('\n') };
  },
});
