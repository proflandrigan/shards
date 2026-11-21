'use strict';
// Builds a minimal valid core/ in a temp dir for compiler tests.
const fs = require('fs');
const os = require('os');
const path = require('path');

function write(root, rel, text) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

function yaml(id, extra = '') {
  return `id: ${id}\ndisplay_name: "${id}"\ndescription: "Agent ${id}."\nrole: specialist\nactivation: [switch, consult, fanout_worker]\n${extra}reviewers: []\noutput_dir: "${id}/{project}/"\njobs: [record]\n`;
}

function makeCore(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-core-'));
  const base = {
    'agents/alpha/agent.yaml': yaml('alpha', 'consult_entries:\n  review: modes/review.md\n  worker: modes/worker.md\n'),
    'agents/alpha/AGENT.md': '---\nname: alpha\ndescription: x\ntools: Read, Write, Task\nmodel: opus-4.8\n---\n\n# Alpha\nPersona {{PROJECT_NAME}}.\n',
    'agents/alpha/modes/review.md': '# Review\n',
    'agents/alpha/modes/worker.md': '# Worker\n',
    'agents/alpha/phases/index.md': '# Phases\n',
    'agents/alpha/phases/phase-1.md': '# Phase 1\n',
    'agents/alpha/phases/phase-6-5.md': '# Phase 6.5\n',
    'agents/beta/agent.yaml': yaml('beta', 'consult_entries:\n  service: modes/service.md\n'),
    'agents/beta/AGENT.md': '---\nname: beta\ndescription: y\ntools: Read\n---\n# Beta\n',
    'agents/beta/modes/service.md': '# Service\n',
    'agents/beta/phases_quick/phase-1.md': '# Q1\n',
    'agents/beta/phases_deep/phase-2.md': '# D2\n',
    'protocols/validation.md': '# Validation\n',
    'templates/project-specs.md': '# Specs {{PROJECT_NAME}}\n',
    'templates/schema.json': '{"a":"{{x}}"}\n',
  };
  for (const [rel, text] of Object.entries({ ...base, ...files })) if (text !== null) write(root, rel, text);
  return root;
}

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'shards-out-')); }

module.exports = { makeCore, tmpDir, write };
