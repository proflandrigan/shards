'use strict';

const { defineTool } = require('../registry');
const { loadBinding } = require('../config/bindings');
const { resolveJob } = require('../config');

module.exports = defineTool({
  name: 'jira_context',
  description: 'Get instructions for Jira issue intake, epic discovery and gated progress comments, plus this project’s Jira settings.',
  async handler(_args, ctx) {
    const { config } = ctx.getConfig();
    const tasks = resolveJob(config, 'tasks');
    const settings = config.bindings?.jira || {};
    return {
      data: {
        site: settings.site || null,
        project: tasks.binding === 'jira' ? tasks.options.project || null : null,
        writeback: tasks.binding === 'jira',
        instructions: loadBinding('jira').body,
      },
    };
  },
});
