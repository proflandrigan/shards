'use strict';
// Loads core/ (agents, protocols, templates) and validates agent.yaml files.
const fs = require('fs');
const path = require('path');
const { loadAgents, validateAgents, makeValidator } = require('../scripts/validate-agents.js');


function walk(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Label used in error messages: relative to cwd, or absolute when outside it.
function label(file) {
  const rel = path.relative(process.cwd(), file);
  // Diagnostics always use forward slashes so output (and tests) are identical on Windows.
  return rel.startsWith('..') || path.isAbsolute(rel) ? file : rel.split(path.sep).join('/');
}

function loadCore(coreDir) {
  const errors = [];
  const agentsDir = path.join(coreDir, 'agents');
  const agents = new Map();
  if (!fs.existsSync(agentsDir)) {
    errors.push(`${label(agentsDir)}:1: core agents directory not found`);
    return { coreDir, agents, protocols: new Set(), templates: new Set(), errors };
  }
  const loaded = loadAgents(agentsDir);
  const good = [];
  for (const a of loaded) {
    const yamlPath = label(path.join(agentsDir, a.dir, 'agent.yaml'));
    if (a.missing) { errors.push(`${yamlPath}:1: agent.yaml missing`); continue; }
    good.push(a);
  }
  for (const msg of validateAgents(good, makeValidator())) {
    const id = msg.split(':')[0];
    errors.push(`${label(path.join(agentsDir, id, 'agent.yaml'))}:1: ${msg.slice(id.length + 1).trim()}`);
  }
  for (const a of good) {
    const dir = path.join(agentsDir, a.dir);
    const doc = a.doc || {};
    for (const [entry, rel] of Object.entries(doc.consult_entries || {})) {
      if (!fs.existsSync(path.join(dir, rel))) {
        errors.push(`${label(path.join(dir, 'agent.yaml'))}:1: consult entry '${entry}' file '${rel}' does not exist`);
      }
    }
    agents.set(a.dir, { id: a.dir, doc, dir, files: walk(dir).filter((f) => f !== 'agent.yaml') });
  }
  const protocols = new Set(walk(path.join(coreDir, 'protocols')));
  const templates = new Set(walk(path.join(coreDir, 'templates')));
  return { coreDir, agents, protocols, templates, errors };
}

module.exports = { loadCore, walk, label };
