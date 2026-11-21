'use strict';
const { defineTool } = require('../registry');

module.exports = defineTool({
  name: 'shards_status',
  description: 'Report Shards runtime status: project root, session (and how it was correlated), state version, config and job bindings, active agent.',
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
        // How the session key was chosen: 'handshake' (SessionStart hook matched this process),
        // 'host-env', 'process' (per-process fallback key) or 'explicit' (fixed --session key).
        sessionSource: ctx.sessionSource || null,
        host: ctx.host || null,
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
