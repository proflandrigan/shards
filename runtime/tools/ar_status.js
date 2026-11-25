'use strict';
// ar_status (issue #91, H1/H2): run state from session state, or rebuilt from the research ref's trailers.
const { defineTool } = require('../registry');
const R = require('../research');

module.exports = defineTool({
  name: 'ar_status',
  description: 'Show an autonomous-research run: iterations, decisions, bestSoFar, budget remaining, converged/stop_reason. Reads session state, or rebuilds the run from the trailers of refs/shards/research/<project>/<run_id> when the state is missing (new session, context loss). resume=true makes the run the active run of this session and reopens its AR lease so ar_iterate can continue.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      run_id: { type: 'string', minLength: 1 },
      resume: { type: 'boolean', description: 'Adopt the run in this session and reopen its AR lease.' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_status requires a resolved session');
    const s = await R.status(ctx, args);
    if (!s) return { text: args.run_id ? `No AR run ${args.run_id} found (session state or refs/shards/research/).` : 'No AR run found.' };
    return { data: s };
  },
});
