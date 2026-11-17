'use strict';
// `shards sync --status` (E6.9, CLI half): list the external copy queue (pending / stuck) per gate and target.
// Read-only. Replaying the queue is the agent's job (the /shards:sync skill, not built yet): the runtime never
// writes externally (D4).
const path = require('path');

function usage() {
  return 'Usage: shards sync --status [--json] [--all] [--root <dir>]\n  Lists queued (pending) and stuck external copies per gate and target. --all also lists completed copies.';
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--status') o.status = true;
    else if (a === '--json') o.json = true;
    else if (a === '--all') o.all = true;
    else if (a === '--root') { if (i + 1 >= argv.length) throw new Error('--root requires a value'); o.root = argv[++i]; }
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option '${a}'`);
  }
  return o;
}

const LABEL = { queued: 'pending', stuck: 'stuck', done: 'done' };

function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards sync: ${e.message}\n\n${usage()}`); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  if (!o.status) {
    console.error(`shards sync: only --status is available from the CLI. Replaying queued copies is done by the agent (/shards:sync) through the host's MCP tools.\n\n${usage()}`);
    return 2;
  }
  const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
  const all = require('../../runtime/copies').listAll(root);
  const rows = (o.all ? all : all.filter((r) => r.status !== 'done'))
    .map((r) => ({ session: r.session, gate: r.gate_id, target: r.target, status: LABEL[r.status] || r.status, attempts: r.attempts, last_error: r.last_error, updated_at: r.updated_at }));
  const summary = { pending: rows.filter((r) => r.status === 'pending').length, stuck: rows.filter((r) => r.status === 'stuck').length };
  if (o.json) { console.log(JSON.stringify({ copies: rows, summary }, null, 2)); return 0; }
  if (!rows.length) { console.log('external copy queue: empty'); return 0; }
  for (const r of rows) {
    console.log(`gate ${r.gate}  target ${r.target}  ${r.status}  attempts ${r.attempts}/${require('../../runtime/copies').MAX_ATTEMPTS}  session ${r.session}${r.last_error ? `  last error: ${r.last_error}` : ''}`);
  }
  console.log(`\n${summary.pending} pending, ${summary.stuck} stuck`);
  if (summary.stuck) console.log('stuck copies are not retried automatically: fix the target, then redo the copy through its binding.');
  return 0;
}

module.exports = { run };
