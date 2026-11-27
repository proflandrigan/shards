'use strict';
// review_snapshot (verified review): start records a content baseline of project paths for a review run; check
// re-hashes the same paths and reports what was added, modified or deleted. Stored under the session state dir.
const { defineTool } = require('../registry');
const review = require('../review');

module.exports = defineTool({
  name: 'review_snapshot',
  description: 'Review guardrail: action "start" records a content hash of every file under the project-relative paths (run_id required); action "check" re-hashes the same paths and returns {clean, added, modified, deleted}. Skips .git, .shards, node_modules, venv, .venv, __pycache__ and .pytest_cache. Run start before the verifiers, check after they finish.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['action', 'run_id'],
    properties: {
      action: { type: 'string', enum: ['start', 'check'] },
      run_id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' },
      paths: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('review_snapshot requires a resolved session');
    const out = review.snapshot(ctx.root, ctx.state, args);
    return { text: JSON.stringify(out, null, 2) };
  },
});
