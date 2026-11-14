'use strict';
// Writes the target layout. Deterministic: sorted, no timestamps. See MACROS.md section 6.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const pkg = require('../package.json');
const fm = (obj) => `---\n${YAML.stringify(obj, { lineWidth: 0 }).trimEnd()}\n---\n`;
const jsonText = (o) => `${JSON.stringify(o, null, 2)}\n`;

function tomlMulti(s) { return `"""\n${s.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}\n"""`; }
function tomlStr(s) { return JSON.stringify(String(s)); }

function toolsOf(meta) {
  const t = meta && meta.tools;
  const list = Array.isArray(t) ? t : String(t || '').split(',').map((x) => x.trim()).filter(Boolean);
  return list.filter((x) => x !== 'Task'); // consults cannot nest; TODO(E5.3)
}

function skillBody(a, persona, target) {
  const modes = a.doc.activation || [];
  const mode = modes.includes('switch') ? 'switch' : 'consult';
  const pre = target === 'claude' ? 'mcp__shards__' : target === 'codex' ? 'shards.' : '';
  return `${persona.trimEnd()}\n\n---\n\nRuntime: call \`${pre}activate\`(agent="${a.id}", mode="${mode}") to start, then load each phase with \`${pre}load_phase\`(agent="${a.id}", n, track?). Content for this agent lives under \`content/agents/${a.id}/\`.\n`;
}

function emitTarget({ target, core, rendered, agentBodies, report, dev, outDir }) {
  const out = new Map();
  for (const [rel, data] of rendered) out.set(rel, data);
  out.set('size-report.json', jsonText(report));

  for (const [id, a] of [...core.agents].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const res = agentBodies.get(id) || { meta: null, body: '' };
    const description = a.doc.description;
    const persona = res.body;
    out.set(`skills/${id}/SKILL.md`, fm({ name: id, description }) + '\n' + skillBody(a, persona, target));
    if (target === 'claude') {
      const tools = toolsOf(res.meta);
      const head = { name: id, description };
      if (tools.length) head.tools = tools.join(', ');
      out.set(`agents/${id}.md`, `${fm(head)}\n${persona}`);
    } else if (target === 'codex') {
      out.set(`.codex/agents/${id}.toml`, `name = ${tomlStr(id)}\ndescription = ${tomlStr(description)}\ndeveloper_instructions = ${tomlMulti(persona)}\n`);
    }
  }

  if (dev) {
    if (target === 'claude') {
      // TODO(E1.10): real plugin metadata, runtime registration and E11.0 hook shims.
      out.set('.claude-plugin/plugin.json', jsonText({ name: 'shards', version: pkg.version, description: pkg.description }));
      out.set('.mcp.json', jsonText({ mcpServers: { shards: { command: 'npx', args: ['-y', '@proflandrigan/shards-mcp@next'] } } }));
      out.set('hooks/hooks.json', jsonText({ hooks: {} }));
    } else if (target === 'codex') {
      // TODO(E1.10): MCP entry and hook shims.
      out.set('.codex/config.toml', '[mcp_servers.shards]\ncommand = "npx"\nargs = ["-y", "@proflandrigan/shards-mcp@next"]\n');
    }
  }

  const written = [];
  for (const rel of [...out.keys()].sort()) {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, out.get(rel));
    written.push(rel);
  }
  return written;
}

module.exports = { emitTarget };
