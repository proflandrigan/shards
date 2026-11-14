'use strict';
const { defineTool } = require('../registry');
const { coreDir, loadAgents } = require('../agents');

module.exports = defineTool({
  name: 'list_agents',
  description: 'List the available Shards agents with role, activation modes, consult entries and output directory.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  sessionless: true,
  async handler() {
    const core = coreDir();
    const agents = [...loadAgents(core).values()].map((a) => (a.error
      ? { id: a.id, error: a.error }
      : {
        id: a.id, display_name: a.display_name, description: a.description, role: a.role,
        activation: a.activation, consult_entries: Object.keys(a.consult_entries || {}), output_dir: a.output_dir === undefined ? null : a.output_dir,
      }));
    return { data: { agents, core_dir: core } };
  },
});
