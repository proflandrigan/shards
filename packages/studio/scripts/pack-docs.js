#!/usr/bin/env node
'use strict';

// Copies the Developer Guide (repo src/docs) into packages/studio/docs so the
// published tarball is self-contained (server.js serves the guide from ./docs
// when ../../src/docs is out of reach). Wired as prepack ("copy") and postpack
// ("clean") in package.json. It also writes agents-catalog.json (the v2 agent
// list from core/agents/*/agent.yaml) so a standalone install, which cannot reach
// runtime/, still lists agents. Node-only so it works on Windows too.
//
//   node scripts/pack-docs.js copy|clean

const fs = require('fs');
const path = require('path');

const PKG = path.join(__dirname, '..');
const SRC = path.join(PKG, '..', '..', 'src', 'docs');
const DEST = path.join(PKG, 'docs');
const CATALOG = path.join(PKG, 'agents-catalog.json');

const mode = process.argv[2];
if (mode === 'clean') {
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.rmSync(CATALOG, { force: true });
} else if (mode === 'copy') {
  if (!fs.existsSync(path.join(SRC, 'manifest.json'))) {
    console.error(`pack-docs: ${SRC}/manifest.json not found; run npm pack from the shards repo`);
    process.exit(1);
  }
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.cpSync(SRC, DEST, { recursive: true });
  const { loadAgents, coreDir } = require(path.join(PKG, '..', '..', 'runtime', 'agents.js'));
  const agents = [];
  for (const a of loadAgents(coreDir()).values()) {
    if (a.error) continue;
    agents.push({ id: a.id, description: a.description || '', activation: a.activation || [] });
  }
  fs.writeFileSync(CATALOG, JSON.stringify({ version: 1, agents }, null, 2) + '\n');
} else {
  console.error('usage: node scripts/pack-docs.js copy|clean');
  process.exit(2);
}
