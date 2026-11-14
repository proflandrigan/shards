'use strict';
// Agent catalog loader: reads <coreDir>/agents/*/agent.yaml (re-read on every call; files are tiny).
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function coreDir() {
  return process.env.SHARDS_CORE_DIR ? path.resolve(process.env.SHARDS_CORE_DIR) : path.join(__dirname, '..', 'core');
}

// -> Map id -> {...yaml, dir, personaSummaryPath (core-relative), personaSummaryAbsPath}
// or {id, error, dir} for a malformed agent.yaml.
function loadAgents(core = coreDir()) {
  const out = new Map();
  const agentsDir = path.join(core, 'agents');
  let names = [];
  try { names = fs.readdirSync(agentsDir).sort(); } catch (_) { return out; }
  for (const name of names) {
    const dir = path.join(agentsDir, name);
    const file = path.join(dir, 'agent.yaml');
    let text;
    try { if (!fs.statSync(dir).isDirectory()) continue; text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    try {
      const y = YAML.parse(text);
      if (!y || typeof y !== 'object') throw new Error('agent.yaml is not a mapping');
      const id = y.id || name;
      out.set(id, {
        ...y, id, dir,
        personaSummaryPath: `agents/${name}/persona-summary.md`,
        personaSummaryAbsPath: path.join(dir, 'persona-summary.md'),
      });
    } catch (e) {
      out.set(name, { id: name, dir, error: e.message });
    }
  }
  return out;
}

function readPersonaSummary(agent) {
  try { return fs.readFileSync(agent.personaSummaryAbsPath, 'utf8'); } catch (_) { return ''; }
}

module.exports = { coreDir, loadAgents, readPersonaSummary };
