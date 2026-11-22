#!/usr/bin/env node
'use strict';
// Re-ground fixture harness (E11.7): builds a temp project with a fixture session (frame
// data-scientist, 3 confirmed gates with fake SHAs, 1 pending gate) and prints the text the
// SessionStart shim would inject after a compaction. `--check` exits non-zero unless the
// persona line, a SHA and the pending gate are all present. Harness for the plan's
// "survives compaction" criterion; the live run is done by hand.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHAS = ['a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'b2c3d4e5f60718293a4b5c6d7e8f901234567890', 'c3d4e5f60718293a4b5c6d7e8f90123456789012'];

async function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reground-fixture-'));
  const { StateStore } = require('../runtime/state/store');
  const { pushFrame } = require('../runtime/stack');
  const gates = require('../runtime/gates');
  const sessionKey = 'fixture-session';
  const state = new StateStore(root, sessionKey);
  await pushFrame(state, { agent: 'data-scientist', project: 'churn-study' });
  const frame = state.read('frames').frames[0];
  const session = { root, sessionKey, state };
  await state.update('frames', (cur) => ({ ...cur, frames: cur.frames.map((f) => ({ ...f, phase: 4, track: 'deep' })) }));
  const ts = Date.now();
  await state.update('gates', (cur) => {
    const g = cur.gates || {};
    SHAS.forEach((sha, i) => {
      const id = `data-scientist-phase-${i + 1}`;
      const t = new Date(ts + i * 1000).toISOString();
      g[id] = { id, status: 'confirmed', kind: 'phase', phase: i + 1, track: 'deep', project: 'churn-study', agent: 'data-scientist', frame: frame.id, summary: 'fixture', record_ref: null, validates: null, requested_at: t, updated_at: t, history: [], commit: { outcome: 'committed', sha } };
    });
    return { ...cur, gates: g };
  });
  await gates.requestGate(session, { frame, id: 'data-scientist-phase-4', kind: 'phase', phase: 4, summary: 'fixture pending', record_ref: 'shards/churn-study/project-specs.md' });
  return { root, sessionKey, state, session };
}

async function main() {
  const { regroundHook } = require('../runtime/reground');
  const { loadAgents, readPersonaSummary } = require('../runtime/agents');
  const fx = await buildFixture();
  try {
    const r = await regroundHook('compact', { root: fx.root, sessionKey: fx.sessionKey, source: 'compact', host: 'claude-code' });
    process.stdout.write(`${r.text}\n`);
    if (process.argv.includes('--check')) {
      const persona = readPersonaSummary(loadAgents().get('data-scientist')).split('\n').map((l) => l.trim()).find(Boolean) || '';
      const missing = [];
      if (!persona || !r.text.includes(persona)) missing.push('persona line');
      if (!r.text.includes(SHAS[0].slice(0, 12))) missing.push('commit sha');
      if (!/data-scientist-phase-4 \(pending/.test(r.text)) missing.push('pending gate');
      if (missing.length) { console.error(`reground-fixture check FAILED: missing ${missing.join(', ')}`); process.exitCode = 1; } else console.error('reground-fixture check OK');
    }
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { buildFixture, SHAS };
