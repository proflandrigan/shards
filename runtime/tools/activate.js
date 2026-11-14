'use strict';
const fs = require('fs');
const path = require('path');
const { defineTool } = require('../registry');
const { coreDir, loadAgents, readPersonaSummary } = require('../agents');
const { pushFrame, stackNames, fmtStack } = require('../stack');

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

module.exports = defineTool({
  name: 'activate',
  description: 'Activate an agent. mode=switch pushes a frame and adopts its persona (returns persona summary and output dir); mode=consult consults the agent without pushing a frame or holding gates.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', minLength: 1 },
      mode: { type: 'string', enum: ['switch', 'consult'] },
      project: { type: 'string' },
      entry: { type: 'string' },
    },
    required: ['agent', 'mode'],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const agents = loadAgents(coreDir());
    const agent = agents.get(args.agent);
    if (!agent || agent.error) {
      const valid = [...agents.values()].filter((a) => !a.error).map((a) => a.id);
      throw new Error(`Unknown agent "${args.agent}". Valid agents: ${valid.join(', ')}`);
    }
    const allowed = (agent.activation || []).filter((m) => m === 'switch' || m === 'consult');
    if (!allowed.includes(args.mode)) throw new Error(`Agent ${agent.id} cannot be activated in mode "${args.mode}". Allowed modes: ${allowed.join(', ') || '(none)'}`);
    if (args.project !== undefined && !PROJECT_RE.test(args.project)) throw new Error(`Invalid project name ${JSON.stringify(args.project)}: must match ${PROJECT_RE}`);

    if (args.mode === 'consult') {
      const entries = agent.consult_entries || {};
      const consultEntries = {};
      for (const [k, v] of Object.entries(entries)) consultEntries[k] = `agents/${path.basename(agent.dir)}/${v}`;
      let entry;
      if (args.entry !== undefined) {
        if (!Object.prototype.hasOwnProperty.call(consultEntries, args.entry)) throw new Error(`Invalid entry "${args.entry}" for ${agent.id}. Valid entries: ${Object.keys(consultEntries).join(', ') || '(none)'}`);
        entry = consultEntries[args.entry];
      }
      return { data: { agent: agent.id, mode: 'consult', consult_entries: consultEntries, entry: entry || null, persona_summary: { path: agent.personaSummaryPath }, note: 'consult does not hold gates' } };
    }

    // switch
    const frames0 = ctx.state.read('frames').frames || [];
    if (frames0.length && frames0[frames0.length - 1].agent === agent.id) throw new Error(`Agent ${agent.id} is already active (stack ${fmtStack(frames0)})`);

    let outputDir = null;
    let outputDirTemplate = null;
    let created = false;
    if (agent.output_dir) {
      if (args.project) {
        const rel = agent.output_dir.replace('{project}', args.project);
        const root = path.resolve(ctx.root);
        const abs = path.resolve(root, rel);
        if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`Output directory escapes project root: ${rel}`);
        if (!fs.existsSync(abs)) { fs.mkdirSync(abs, { recursive: true }); created = true; }
        outputDir = rel;
      } else {
        outputDirTemplate = agent.output_dir;
      }
    }

    const frame = await pushFrame(ctx.state, { agent: agent.id, project: args.project });
    const frames = ctx.state.read('frames').frames || [];
    let reground = '';
    try {
      const fn = ctx.reground || require('../reground').regroundHook;
      const r = await fn('activate', { root: ctx.root, sessionKey: ctx.sessionKey, agent: agent.id, mode: 'switch', frame });
      reground = (r && r.text) || '';
    } catch (_) { /* reground is best-effort */ }
    const data = {
      agent: agent.id, mode: 'switch', frame,
      persona_summary: { path: agent.personaSummaryPath, content: readPersonaSummary(agent) },
      output_dir: outputDir, output_dir_created: created, stack: stackNames(frames), reground,
    };
    if (outputDirTemplate) data.output_dir_template = outputDirTemplate;
    return { data };
  },
});
