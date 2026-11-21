#!/usr/bin/env node
'use strict';
// Validates core/agents/*/agent.yaml against core/schema/agent.schema.json.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'core', 'schema', 'agent.schema.json');
const AGENTS_DIR = path.join(ROOT, 'core', 'agents');

function makeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(fs.readFileSync(SCHEMA, 'utf8')));
}

// agents: [{ dir, doc }]. Returns array of error strings.
function validateAgents(agents, validate = makeValidator()) {
  const errors = [];
  const ids = new Set(agents.map((a) => a.dir));
  for (const { dir, doc } of agents) {
    if (!validate(doc)) {
      for (const e of validate.errors) {
        errors.push(`${dir}: ${e.instancePath || '(root)'} ${e.message}${e.params && e.params.additionalProperty ? ` '${e.params.additionalProperty}'` : ''}`);
      }
    }
    if (doc && typeof doc === 'object') {
      if (doc.id !== dir) errors.push(`${dir}: id '${doc.id}' does not match directory name '${dir}'`);
      for (const r of Array.isArray(doc.reviewers) ? doc.reviewers : []) {
        if (!ids.has(r)) errors.push(`${dir}: reviewers entry '${r}' is not a known agent id`);
      }
    }
  }
  return errors;
}

function loadAgents(dir = AGENTS_DIR) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const file = path.join(dir, d.name, 'agent.yaml');
    if (!fs.existsSync(file)) { out.push({ dir: d.name, doc: null, missing: true }); continue; }
    out.push({ dir: d.name, doc: YAML.parse(fs.readFileSync(file, 'utf8')) });
  }
  return out;
}

function main() {
  const agents = loadAgents();
  const errors = agents.filter((a) => a.missing).map((a) => `${a.dir}: agent.yaml missing`);
  errors.push(...validateAgents(agents.filter((a) => !a.missing)));
  if (errors.length) {
    console.error('Agent validation failed:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`${agents.length} agents valid:`);
  for (const a of agents) console.log(`  ${a.dir}`);
}

module.exports = { validateAgents, loadAgents, makeValidator };
if (require.main === module) main();
