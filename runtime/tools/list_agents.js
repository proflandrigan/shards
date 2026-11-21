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
    const agents = [...loadAgents(core).values()].map((a) => {
      if (a.error) return { id: a.id, error: a.error };
      const entries = Object.keys(a.consult_entries || {});
      const act = a.activation || [];
      const consult = act.includes('consult') ? [a.id, ...entries.map((e) => `${a.id}-${e}`)] : [];
      const sw = act.includes('switch');
      return {
        id: a.id, display_name: a.display_name, description: a.description, role: a.role,
        activation: a.activation, modes: act, consult_entries: entries, output_dir: a.output_dir === undefined ? null : a.output_dir,
        activate: {
          claude: { switch: sw ? `/shards:${a.id}` : null, consult },
          codex: { switch: sw ? `$shards:${a.id}` : null, profile: `shards-${a.id}`, consult: consult.slice() },
        },
      };
    });
    return { data: { agents, core_dir: core } };
  },
});
