'use strict';
// INTERIM operator CLI for gates (Milestone A). Replaced by E11.13; the confirmation tiers
// of Stage 5 (E11.3-E11.5) supersede the operator-cli proof used here. D8: the agent has no
// tool that confirms a gate; the human runs this command out of band.
const fs = require('fs');
const os = require('os');
const path = require('path');

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--session') o.session = val();
    else if (a === '--root') o.root = val();
    else if (a === '--changes') o.changes = val();
    else if (a.startsWith('--')) throw new Error(`unknown option '${a}'`);
    else o._.push(a);
  }
  return o;
}

function usage() {
  return [
    'Usage: shards gates <status|confirm> [options]   (INTERIM operator CLI; E11.13 replaces this)',
    '  gates status [--session <key>] [--root <dir>]',
    '  gates confirm <gate-id> [--session <key>] [--changes "<note>"] [--root <dir>]',
  ].join('\n');
}

function sessionKeys(root) {
  const d = path.join(root, '.shards', 'state', 'sessions');
  try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch (_) { return []; }
}

function commitText(c) {
  if (!c) return '-';
  if (c.sha) return `${c.outcome || 'committed'} ${String(c.sha).slice(0, 7)}`;
  return c.reason ? `${c.outcome} (${c.reason})` : (c.outcome || '-');
}

async function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards gates: ${e.message}\n\n${usage()}`); return 2; }
  const [sub, ...rest] = o._;
  const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
  const { StateStore, sanitizeSessionKey } = require('../../runtime/state/store');
  const gates = require('../../runtime/gates');
  try {
    if (o.session) sanitizeSessionKey(o.session);
  } catch (e) { console.error(`shards gates: ${e.message}`); return 2; }

  if (sub === 'status') {
    if (rest.length) { console.error(usage()); return 2; }
    const keys = o.session ? [o.session] : sessionKeys(root);
    if (!keys.length) console.log('no sessions found');
    for (const k of keys) {
      const list = gates.listGates({ root, sessionKey: k });
      if (!list.length) { console.log(`session ${k}: no gates`); continue; }
      for (const g of list) {
        console.log(`session ${k}  gate ${g.id}  status ${g.status}  kind ${g.kind}  agent ${g.agent}  commit ${commitText(g.commit)}`);
      }
    }
    try {
      const pend = require('../../runtime/git').listPending(root);
      if (pend.length) {
        console.log('pending git commits:');
        for (const r of pend) console.log(`  gate ${r.gate}  status ${r.status}  reason ${r.reason || '-'}  tries ${r.tries}`);
      } else console.log('pending git commits: none');
    } catch (e) { console.log(`pending git commits: unavailable (${e.message})`); }
    return 0;
  }

  if (sub === 'confirm') {
    if (rest.length !== 1) { console.error(usage()); return 2; }
    const id = rest[0];
    if (o.changes !== undefined && !o.changes.trim()) { console.error('shards gates confirm: --changes needs a non-empty note'); return 2; }
    let key = o.session;
    if (!key) {
      const hits = sessionKeys(root).filter((k) => { const g = gates.getGate({ root, sessionKey: k }, id); return g && g.status === 'pending'; });
      if (hits.length === 0) { console.error(`shards gates confirm: no session has a pending gate '${id}' under ${root}`); return 1; }
      if (hits.length > 1) {
        console.error(`shards gates confirm: gate '${id}' is pending in several sessions; pass --session. Candidates:\n${hits.map((k) => `  ${k}`).join('\n')}`);
        return 2;
      }
      key = hits[0];
    }
    const state = new StateStore(root, key);
    const decision = o.changes !== undefined ? 'changes_requested' : 'confirmed';
    const ts = new Date().toISOString();
    let user = 'unknown';
    try { user = os.userInfo().username; } catch (_) { /* ignore */ }
    const proof = { tier: 'operator-cli', user, ts };
    let out;
    try {
      out = await gates.confirmGate({ root, sessionKey: key, state }, id, { decision, proof, ...(o.changes !== undefined ? { note: o.changes } : {}) });
    } catch (e) { console.error(`shards gates confirm: ${e.message}`); return 1; }
    const commit = out.commit || null;
    const { lockedAppend } = require('../../runtime/state/append');
    await lockedAppend(path.join(root, '.shards', 'state', 'gate-operator.log.jsonl'), JSON.stringify({
      ts, session: key, gate: id, decision: out.result, user, tier: 'operator-cli',
      ...(o.changes !== undefined ? { note: o.changes } : {}), ...(commit ? { commit } : {}),
    }));
    if (out.result === 'changes_requested') console.log(`gate ${id} (session ${key}): changes requested; no commit. Note: ${o.changes}`);
    else console.log(`gate ${id} (session ${key}): ${out.result}; commit ${commitText(commit)}`);
    return 0;
  }

  console.error(usage());
  return 2;
}

module.exports = { run };
