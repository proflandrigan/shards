'use strict';
const { defineTool } = require('../registry');

module.exports = defineTool({
  name: 'shards_status',
  description: 'Report Shards runtime status: project root, session, state version, config and job bindings, active agent.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async handler(_args, ctx) {
    const cfg = ctx.getConfig();
    const jobs = {};
    for (const [k, v] of Object.entries(cfg.config.jobs || {})) jobs[k] = v && v.binding;
    const frames = ctx.state.read('frames').frames || [];
    const top = frames[frames.length - 1];
    return {
      data: {
        root: ctx.root,
        sessionKey: ctx.sessionKey,
        stateVersion: ctx.state.getVersion(),
        configPath: cfg.path,
        configCreated: cfg.created,
        jobs,
        gatesPolicy: cfg.config.gates && cfg.config.gates.policy,
        activeAgent: top ? top.agent : null,
      },
    };
  },
});
