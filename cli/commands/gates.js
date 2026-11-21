'use strict';
// Operator CLI for gates (E11.13): status | history | checkpoints | violations | force-close | confirm.
// The human runs this out of band (operator-cli proof tier). force-close ends a stuck gate as
// 'force_closed' (never confirmed), resets auto-verify and logs to gate-operator.log.jsonl.
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
    else if (a === '--gate') o.gate = val();
    else if (a === '--reason') o.reason = val();
    else if (a === '--all') o.all = true;
    else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) throw new Error(`unknown option '${a}'`);
    else o._.push(a);
  }
  return o;
}

function usage() {
  return [
    'Usage: shards gates <status|history|checkpoints|violations|force-close|confirm> [options]',
    '  gates status [--session <key>] [--root <dir>]',
    '  gates history [--session <key>] [--gate <id>] [--json] [--root <dir>]',
    '  gates checkpoints [--session <key>] [--json] [--root <dir>]',
    '  gates violations [--json] [--root <dir>]',
    '  gates force-close <gate-id> | --all [--session <key>] [--reason "<text>"] [--root <dir>]',
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
    for (const k of keys) {
      try {
        const av = require('../../runtime/auto-verify').get({ root, sessionKey: k });
        if (av && av.active) console.log(`session ${k}: auto-verify ACTIVE  agent ${av.agent}  used ${av.used}/${av.tool_budget}`);
        else if (av && av.ended_at) console.log(`session ${k}: auto-verify inactive (ended: ${av.end_reason || '-'})`);
      } catch (_) { /* ignore */ }
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

  if (sub === 'history' || sub === 'checkpoints') {
    if (rest.length) { console.error(usage()); return 2; }
    const keys = o.session ? [o.session] : sessionKeys(root);
    const rows = [];
    for (const k of keys) {
      for (const g of gates.listGates({ root, sessionKey: k })) {
        if (o.gate && g.id !== o.gate) continue;
        if (sub === 'checkpoints' && !(g.kind === 'checkpoint' || g.kind === 'confirm' || g.evidence)) continue;
        rows.push({ session: k, gate: g.id, kind: g.kind, status: g.status, tier: (g.proof && g.proof.tier) || null,
          ...(sub === 'checkpoints' ? { evidence: g.evidence || null } : { history: g.history || [] }) });
      }
    }
    if (o.json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
    if (!rows.length) { console.log(sub === 'history' ? 'no gate history' : 'no checkpoints'); return 0; }
    for (const r of rows) {
      console.log(`session ${r.session}  gate ${r.gate}  kind ${r.kind}  status ${r.status}  proof ${r.tier || '-'}`);
      if (sub === 'history') for (const h of r.history) console.log(`  ${h.ts}  ${h.from || '(new)'} -> ${h.to}${h.by ? `  by ${h.by}` : ''}`);
      else if (r.evidence) console.log(`  evidence: ${typeof r.evidence === 'string' ? r.evidence : JSON.stringify(r.evidence)}`);
    }
    return 0;
  }

  if (sub === 'violations') {
    if (rest.length) { console.error(usage()); return 2; }
    const op = require('../../runtime/gates/operator');
    const viol = op.readJsonl(op.violationsFile(root));
    const refused = op.readJsonl(op.operatorLogFile(root)).filter((r) => r.refused || r.action === 'refused');
    const all = [...viol, ...refused];
    if (o.json) { console.log(JSON.stringify(all, null, 2)); return 0; }
    if (!all.length) { console.log('no violations'); return 0; }
    for (const v of all) console.log(`${v.ts}  ${v.tool || v.action || 'violation'}  session ${v.session || '-'}  gate ${v.gate || '-'}  ${v.reason || v.kind || ''}`);
    return 0;
  }

  if (sub === 'force-close') {
    const id = o.all ? 'all' : rest[0];
    if (!id || rest.length > (o.all ? 0 : 1)) { console.error(usage()); return 2; }
    let user = 'unknown';
    try { user = os.userInfo().username; } catch (_) { /* ignore */ }
    const op = require('../../runtime/gates/operator');
    let closed;
    try { closed = await op.forceClose(root, o.session || null, id, { actor: user, via: 'operator-cli', ...(o.reason ? { reason: o.reason } : {}) }); } catch (e) { console.error(`shards gates force-close: ${e.message}`); return 1; }
    if (!closed.length) { console.error(`shards gates force-close: no open gate ${id === 'all' ? '' : `'${id}' `}found under ${root}`); return 1; }
    for (const c of closed) console.log(`gate ${c.gate} (session ${c.session}): force-closed (was ${c.from}); NOT confirmed`);
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
