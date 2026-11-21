#!/usr/bin/env node
'use strict';
// E9.4: nightly golden-session driver (used by .github/workflows/nightly.yml; runnable by hand).
//   node scripts/nightly-golden.js --host claude|codex --out <dir> [--no-offline]
//   node scripts/nightly-golden.js --summarize <dir>        (markdown table of every *.json score file in <dir>)
// Always runs the offline delegated-build dry-run (no model, no secrets). The LIVE run happens only when the host's
// API secret is present in the environment and the host CLI is on PATH; otherwise it is skipped cleanly
// (exit 0, status "skipped" with the reason). A live run is ONE SAMPLE, never a pass rate.
// Exit: 0 ok or skipped, 1 a measured run failed, 2 usage error.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const RUN_SH = path.join(REPO, 'test', 'golden', 'delegated-build', 'run.sh');
const FIXTURE = path.join(REPO, 'test', 'golden', 'delegated-build', 'fixture');
const SCORE_JS = path.join(REPO, 'test', 'golden', 'delegated-build', 'score.js');

// Secrets each host's headless CLI accepts. UNVERIFIED for Codex (docs/compat.md CX-*).
const SECRETS = { claude: ['ANTHROPIC_API_KEY'], codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'] };
const CLI = { claude: 'claude', codex: 'codex' };

function hasSecret(host, env) {
  return (SECRETS[host] || []).some((k) => typeof env[k] === 'string' && env[k].trim() !== '');
}

function onPath(cmd, env) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { env, encoding: 'utf8' });
  return r.status === 0;
}

// Decide whether the live run happens. Pure given (host, env, cliPresent).
function liveDecision(host, env, cliPresent) {
  if (!SECRETS[host]) return { run: false, reason: `unknown host '${host}'` };
  if (!hasSecret(host, env)) return { run: false, reason: `no ${SECRETS[host].join(' / ')} in the environment` };
  if (!cliPresent) return { run: false, reason: `'${CLI[host]}' CLI not found on PATH` };
  return { run: true, reason: null };
}

const tail = (s, n = 4000) => (s.length > n ? s.slice(-n) : s);

function runBash(args, env) {
  const r = spawnSync('bash', [RUN_SH, ...args], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { exit: r.status === null ? 1 : r.status, output: tail(`${r.stdout || ''}${r.stderr || ''}`) };
}

function liveClaude(env) {
  return runBash(['--mode', 'sequential'], { ...env, SHARDS_GOLDEN_LIVE: '1' });
}

// Codex: copy the fixture, install the generated skills with `shards install --project`, run `codex exec`, score the dir.
// UNVERIFIED end to end: the Codex tool names and approval flow are docs-only (docs/compat.md).
function liveCodex(env) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-codex-'));
  fs.cpSync(FIXTURE, proj, { recursive: true });
  const inst = spawnSync(process.execPath, [path.join(REPO, 'cli', 'shards.js'), 'install', '--project', '--root', proj], { env, encoding: 'utf8' });
  if (inst.status !== 0) return { exit: 1, output: tail(`${inst.stdout}${inst.stderr}`) };
  const prompt = 'Use the shards skills. Run the delegated build described by shards/dbuild/project-specs.md and shards/dbuild/tasks.yaml: register the manifest, dispatch each task, verify each acceptance command. Finish when t1..t4 are verified.';
  const ex = spawnSync('codex', ['exec', prompt], { cwd: proj, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
  const sc = spawnSync(process.execPath, [SCORE_JS, proj], { env, encoding: 'utf8' });
  return { exit: sc.status === null ? 1 : sc.status, output: tail(`codex exit ${ex.status}\n${sc.stdout}${sc.stderr}`) };
}

function runHost(host, { env = process.env, offline = true, cliPresent } = {}) {
  const result = { host, os: process.platform, node: process.version, date: new Date().toISOString().slice(0, 10), offline: { status: 'skipped' }, live: { status: 'skipped', reason: null } };
  if (offline) {
    const r = runBash(['--dry-run'], env);
    result.offline = { status: r.exit === 0 ? 'pass' : 'fail', exit: r.exit, output: r.output };
  }
  const d = liveDecision(host, env, cliPresent === undefined ? onPath(CLI[host], env) : cliPresent);
  if (!d.run) { result.live = { status: 'skipped', reason: d.reason }; return result; }
  const r = host === 'codex' ? liveCodex(env) : liveClaude(env);
  result.live = { status: r.exit === 0 ? 'pass' : 'fail', exit: r.exit, output: r.output, note: 'one live sample, not a pass rate' };
  return result;
}

function summarize(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.json')).sort() : [];
  const rows = ['| host | os | date | offline | live |', '|---|---|---|---|---|'];
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, String(f)), 'utf8')); } catch (_) { continue; }
    if (!j || !j.host) continue;
    rows.push(`| ${j.host} | ${j.os} | ${j.date} | ${j.offline.status} | ${j.live.status}${j.live.reason ? ` (${j.live.reason})` : ''} |`);
  }
  return `## Nightly golden-session scores\n\n${rows.length > 2 ? rows.join('\n') : '_no score files found_'}\n`;
}

function main(argv) {
  const o = { offline: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') o.host = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--no-offline') o.offline = false;
    else if (a === '--summarize') o.summarize = argv[++i];
    else { console.error(`nightly-golden: unknown option '${a}'`); return 2; }
  }
  if (o.summarize) { process.stdout.write(summarize(o.summarize)); return 0; }
  if (!SECRETS[o.host] || !o.out) { console.error('usage: nightly-golden.js --host claude|codex --out <dir> [--no-offline] | --summarize <dir>'); return 2; }
  const result = runHost(o.host, { offline: o.offline });
  fs.mkdirSync(o.out, { recursive: true });
  const file = path.join(o.out, `${o.host}-${process.platform}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`nightly-golden: ${o.host}/${process.platform}: offline=${result.offline.status} live=${result.live.status}${result.live.reason ? ` (${result.live.reason})` : ''} -> ${file}`);
  return result.offline.status === 'fail' || result.live.status === 'fail' ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { liveDecision, hasSecret, runHost, summarize, SECRETS };
