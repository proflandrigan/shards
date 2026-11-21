'use strict';
// `shards sessions list|show|resume|end` (E2.6). Reuses runtime/sessions/ops.js.
const path = require('path');

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--root') o.root = val();
    else if (a === '--status') o.status = val();
    else if (a === '--limit') { o.limit = Number(val()); if (!Number.isFinite(o.limit) || o.limit < 1) throw new Error('--limit must be a positive number'); }
    else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) throw new Error(`unknown option '${a}'`);
    else o._.push(a);
  }
  return o;
}

function usage() {
  return [
    'Usage: shards sessions <list|show|resume|end> [options]',
    '  sessions list [--status active|ended|abandoned] [--limit n] [--root d] [--json]',
    '  sessions show <id|prefix> [--root d] [--json]',
    '  sessions resume <id|prefix> [--root d] [--json]',
    '  sessions end [id|prefix] [--root d] [--json]   (refused while gates are pending/suspended)',
  ].join('\n');
}

const pad = (s, n) => { s = String(s == null ? '-' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };

async function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards sessions: ${e.message}\n\n${usage()}`); return 2; }
  const [sub, ...rest] = o._;
  const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
  const ops = require('../../runtime/sessions/ops');
  const out = (x) => console.log(JSON.stringify(x, null, 2));
  try {
    if (sub === 'list') {
      if (rest.length) { console.error(usage()); return 2; }
      const rows = ops.listRows(root, { status: o.status, limit: o.limit });
      if (o.json) { out(rows); return 0; }
      if (!rows.length) { console.log('no sessions recorded'); return 0; }
      console.log(pad('ID', 10) + pad('AGENT', 22) + pad('STATUS', 11) + pad('PHASE', 7) + 'PROJECT');
      for (const r of rows) console.log(pad(r.sessionId.slice(0, 8), 10) + pad(r.agent, 22) + pad(r.status, 11) + pad(typeof r.phase === 'number' ? r.phase : '-', 7) + (r.projectDir || r.projectName || '-'));
      return 0;
    }
    if (sub === 'show' || sub === 'resume') {
      if (rest.length !== 1) { console.error(usage()); return 2; }
      const { entry, hints, host } = ops.resumeInfo(root, rest[0]);
      if (o.json) { out(sub === 'show' ? entry : { entry, hints, host }); return 0; }
      if (sub === 'show') {
        for (const [k, v] of Object.entries(entry)) console.log(`${pad(k + ':', 18)}${v == null ? '-' : v}`);
      } else {
        console.log(`Session ${entry.sessionId} (agent: ${entry.agent || '-'}, status: ${entry.status}, host: ${host})`);
        for (const [k, v] of Object.entries(hints)) console.log(`  ${pad(k, 7)} ${v}`);
      }
      return 0;
    }
    if (sub === 'end') {
      if (rest.length > 1) { console.error(usage()); return 2; }
      const r = await ops.endSession(root, { id: rest[0], reason: 'cli_end' });
      if (o.json) { out(r); return 0; }
      console.log(r.ended ? `ended session ${r.session}` : (r.note || 'nothing ended'));
      if (r.replayed.length) console.log(`replayed ${r.replayed.length} pending commit(s)`);
      if (r.replay_error) console.log(`replay error: ${r.replay_error}`);
      if (r.still_pending.length) console.log(`still pending commits: ${r.still_pending.map((p) => p.gate).join(', ')}`);
      return 0;
    }
  } catch (e) { console.error(`shards sessions: ${e.message}`); return 1; }
  console.error(usage());
  return 2;
}

module.exports = { run, parse, usage };
