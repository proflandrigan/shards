'use strict';
// `shards research status` (issue #91, H3 / bug 16): print an autonomous-research run's status so a shell loop
// driving a headless host can test whether the run is done. Read-only: session state first (any session, or
// --session), rebuilt from refs/shards/research/<project>/<run> when the state copy is missing or stale.
const fs = require('fs');
const path = require('path');

function usage() {
  return [
    'Usage: shards research status [--run <id>] [--session <key>] [--json] [--root <dir>]',
    '  Prints the AR run (default: the newest active run, else the newest run): iterations, best, budget left,',
    '  stop reason, pending deferred decisions. `done` is true once the run converged or ended. Exit 0 when a run',
    '  is found, 1 when none is.',
    '  Overnight driver: while ! shards research status --json | node -e "process.exit(JSON.parse(require(\'fs\').readFileSync(0)).done?0:1)"; do <headless host turn>; done',
  ].join('\n');
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--run') o.run = val();
    else if (a === '--session') o.session = val();
    else if (a === '--json') o.json = true;
    else if (a === '--root') o.root = val();
    else if (a === '--help' || a === '-h') o.help = true;
    else if (!o.sub && !a.startsWith('-')) o.sub = a;
    else throw new Error(`unknown option '${a}'`);
  }
  return o;
}

function sessionKeys(root) {
  const d = path.join(root, '.shards', 'state', 'sessions');
  try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch (_) { return []; }
}

function stateRuns(root, keys) {
  const out = [];
  for (const k of keys) {
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(root, '.shards', 'state', 'sessions', k, 'research.json'), 'utf8')); } catch (_) { continue; }
    for (const r of Object.values((s && s.runs) || {})) if (r && r.run_id) out.push({ run: r, session: k });
  }
  return out;
}

async function findRun(root, o) {
  const R = require('../../runtime/research');
  const cands = stateRuns(root, o.session ? [o.session] : sessionKeys(root))
    .filter((c) => !o.run || c.run.run_id === o.run)
    .sort((a, b) => String(b.run.started_at).localeCompare(String(a.run.started_at)));
  // Prefer the copy that matches the research ref tip (another session may have resumed the run since).
  const pick = cands.find((c) => c.run.status === 'active') || cands[0] || null;
  let ref = pick ? pick.run.ref : await R.findRef(root, o.run);
  if (!ref) return null;
  const tip = await R.refTip(root, ref);
  if (pick && pick.run.tip && pick.run.tip === tip) return { run: pick.run, source: 'state', session: pick.session };
  if (!tip) return pick ? { run: pick.run, source: 'state', session: pick.session } : null;
  return { run: await R.rebuildFromRef(root, ref), source: 'ref', session: pick ? pick.session : null };
}

async function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards research: ${e.message}\n\n${usage()}`); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  const sub = o.sub;
  if (sub === 'status') {
    const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
    if (o.session) {
      try { require('../../runtime/state/store').sanitizeSessionKey(o.session); } catch (e) { console.error(`shards research: ${e.message}`); return 2; }
    }
    const R = require('../../runtime/research');
    let found;
    try { found = await findRun(root, o); } catch (e) { console.error(`shards research status: ${e.message}`); return 1; }
    if (!found) {
      if (o.json) console.log(JSON.stringify({ found: false, done: false }, null, 2));
      else console.log(o.run ? `No AR run ${o.run} found.` : 'No AR run found.');
      return 1;
    }
    const r = found.run;
    const pendingStop = r.status === 'active' ? R.stopReason(r) : null;
    const s = { found: true, ...R.summary(r, { source: found.source }), session: found.session, done: r.status !== 'active' || !!pendingStop, ...(pendingStop ? { pending_stop: pendingStop } : {}) };
    delete s.lease_active;
    if (o.json) { console.log(JSON.stringify(s, null, 2)); return 0; }
    console.log(`AR run ${s.run_id} (${s.project})  status ${s.status}${s.done ? ' (done)' : ''}  source ${s.source}`);
    console.log(`  iterations ${s.iterations}/${s.budget.iterations}  green ${s.decisions.green || 0}  yellow ${s.decisions.yellow || 0}  red ${s.decisions.red || 0}`);
    console.log(`  baseline ${s.baseline}  best ${s.bestSoFar}${s.budget_remaining.minutes !== null ? `  minutes left ${s.budget_remaining.minutes}` : ''}`);
    if (s.stop_reason || pendingStop) console.log(`  stop reason ${s.stop_reason || pendingStop}`);
    if (s.deferred.length) console.log(`  deferred (needs a human at Phase 3): ${s.deferred.map((d) => `${d.id} ${d.kind}`).join(', ')}`);
    return 0;
  }
  console.error(`shards research: unknown subcommand '${sub || ''}'\n\n${usage()}`);
  return 2;
}

module.exports = { run };
