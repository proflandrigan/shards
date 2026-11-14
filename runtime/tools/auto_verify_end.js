'use strict';
// auto_verify_end (E11.12): close the active auto-verify block early.
const { defineTool } = require('../registry');
const av = require('../auto-verify');

module.exports = defineTool({
  name: 'auto_verify_end',
  description: 'End the active auto-verify block now. Safe to call when none is active.',
  async handler(_args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('auto_verify_end requires a resolved session');
    const { ended, state } = await av.end({ root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state }, 'ended_by_agent');
    if (!ended) return { text: 'No auto-verify block was active.' };
    return { text: `Auto-verify block ended after ${state.used} of ${state.tool_budget} auto-approved tool calls. Normal permission prompts resume.` };
  },
});
