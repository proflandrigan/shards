'use strict';
// `shards doctor` (E2.12): prerequisites, config, MCP registrations, hook shims, git state,
// and gate-tool permission rules (E7.9 / E11.4). Reads files only; never shells out to `claude`.
// Fixes run only with --fix: .gitignore entry and replayPending(force) for stuck commits.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE_TOOLS = ['gate_advance', 'gate_force_close', 'gate_confirm', 'gate_suspend'];
const SERVERS = ['mcp__plugin_shards_shards', 'mcp__shards'];

function usage() {
  return [
    'Usage: shards doctor [--root <dir>] [--json] [--fix]',
    '  Checks prerequisites, config, MCP registration, hook shims, git state and gate permissions.',
    '  --root <dir>  project root (default: cwd)',
    '  --json        machine output: {checks:[{id,status,message,fix?}], summary:{pass,warn,fail}}',
    '  --fix         append .shards/ to .gitignore and force-replay stuck gate commits (nothing else)',
    'Exit code: 0 if no FAIL, 1 if any FAIL.',
  ].join('\n');
}

function parse(argv) {
  const o = { json: false, fix: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') { if (i + 1 >= argv.length) throw new Error('--root requires a value'); o.root = argv[++i]; }
    else if (a === '--json') o.json = true;
    else if (a === '--fix') o.fix = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option '${a}'`);
  }
  return o;
}

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
function readJson(p) { const t = readText(p); if (t === null) return undefined; try { return JSON.parse(t); } catch (_) { return null; } }
function exists(p) { try { fs.accessSync(p); return true; } catch (_) { return false; } }
function bin(cmd, args) {
  try { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 }); return r.error || r.status !== 0 ? null : (r.stdout || r.stderr || '').trim(); } catch (_) { return null; }
}

// ---- permission matching ----
function globRe(rule) { return new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); }
// Returns true if an allow rule covers any gate tool (gate_request alone does not count).
function ruleCoversGateTools(rule) {
  if (typeof rule !== 'string') return false;
  const r = rule.trim().replace(/\(\s*\)$/, '').replace(/\(\*\)$/, '');
  if (!r) return false;
  if (SERVERS.includes(r)) return true;
  if (/^(?:.*__)?gate_(advance|force_close|confirm)$/.test(r)) return true;
  if (!r.startsWith('mcp__')) return false;
  const re = globRe(r);
  return SERVERS.some((s) => GATE_TOOLS.some((t) => re.test(`${s}__${t}`)));
}

function scanClaudeSettings(file) {
  const j = readJson(file);
  if (!j || typeof j !== 'object') return [];
  const allow = j.permissions && Array.isArray(j.permissions.allow) ? j.permissions.allow : [];
  return allow.filter(ruleCoversGateTools).map((rule) => ({ file, rule }));
}

function scanCodexToml(file) {
  const t = readText(file);
  if (t === null) return [];
  const hits = [];
  const defaults = [];
  const prompted = new Set();
  let section = '';
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/\s#.*$/, '').trim();
    const h = line.match(/^\[+\s*([^\]]+?)\s*\]+$/);
    if (h) {
      section = h[1].replace(/["']/g, '');
      continue;
    }
    if (!/mcp_servers\.(plugin_shards_shards|shards)/.test(section)) continue;
    const toolSec = section.match(/\.tools\.(\w+)$/);
    if (toolSec && GATE_TOOLS.includes(toolSec[1]) && /^approval_mode\s*=/.test(line) && !/=\s*["']?prompt["']?\s*$/.test(line)) {
      hits.push({ file, rule: `[${section}] ${line}` });
    } else if (/^(auto[_-]?approve\w*|allow\w*|approved?_tools)\s*=/.test(line) && (GATE_TOOLS.some((g) => line.includes(g)) || /["']\*["']/.test(line))) {
      hits.push({ file, rule: `[${section}] ${line}` });
    }
    // A server-wide default other than "prompt" (shards install --codex sets "approve") also covers every gate tool
    // that has no approval_mode = "prompt" table of its own.
    const dm = !toolSec && line.match(/^default_tools_approval_mode\s*=\s*["']?(\w+)["']?\s*$/);
    if (dm && dm[1] !== 'prompt') defaults.push({ server: section, rule: `[${section}] ${line}` });
    if (toolSec && GATE_TOOLS.includes(toolSec[1]) && /^approval_mode\s*=\s*["']?prompt["']?\s*$/.test(line)) prompted.add(`${section.replace(/\.tools\.\w+$/, '')}|${toolSec[1]}`);
  }
  for (const d of defaults) {
    const missing = GATE_TOOLS.filter((g) => !prompted.has(`${d.server}|${g}`));
    if (missing.length) hits.push({ file, rule: `${d.rule} without approval_mode = "prompt" for ${missing.join(', ')}` });
  }
  return hits;
}

// ---- hooks ----
function findAdapterDirs(root, repoRoot) {
  const dirs = [];
  for (const base of [root, repoRoot]) {
    const d = path.join(base, 'adapters', 'claude-code');
    if (!dirs.includes(d)) dirs.push(d);
  }
  return dirs;
}

function checkHooks(adapterDirs) {
  const dir = adapterDirs.find((d) => exists(path.join(d, 'hooks', 'hooks.json')));
  const fix = 'shards build --target claude --dev';
  if (!dir) return { id: 'hooks', status: 'WARN', message: 'no hook shims installed (adapters/claude-code/hooks/hooks.json not found)', fix };
  const j = readJson(path.join(dir, 'hooks', 'hooks.json'));
  if (!j || !j.hooks) return { id: 'hooks', status: 'FAIL', message: `${path.join(dir, 'hooks', 'hooks.json')} is not valid hooks JSON`, fix };
  const scripts = new Set();
  for (const groups of Object.values(j.hooks)) {
    for (const g of groups || []) for (const h of g.hooks || []) {
      const m = typeof h.command === 'string' && h.command.match(/"([^"]+\.js)"|(\S+\.js)/);
      if (m) scripts.add((m[1] || m[2]).replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir));
    }
  }
  if (!scripts.size) return { id: 'hooks', status: 'WARN', message: 'hooks.json has no node command shims', fix };
  const bad = [];
  for (const s of scripts) {
    if (!exists(s)) { bad.push(`missing ${s}`); continue; }
    const r = spawnSync(process.execPath, ['--check', s], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0) bad.push(`syntax error in ${s}`);
  }
  if (bad.length) return { id: 'hooks', status: 'WARN', message: `hook shims unresolvable: ${bad.join('; ')}`, fix };
  return { id: 'hooks', status: 'PASS', message: `${scripts.size} hook shim(s) resolve (${path.join(dir, 'hooks', 'hooks.json')})` };
}

// ---- MCP ----
function jsonHasShardsServer(file) {
  const j = readJson(file);
  if (!j || typeof j !== 'object') return false;
  const scan = (m) => m && typeof m === 'object' && Object.entries(m).some(([k, v]) => k === 'shards' || /runtime[\\/]server\.js|shards-mcp/.test(JSON.stringify(v)));
  if (scan(j.mcpServers)) return true;
  if (j.projects && typeof j.projects === 'object') return Object.values(j.projects).some((p) => p && scan(p.mcpServers));
  return false;
}

function checkMcpClaude(root, home, adapterDirs) {
  const fix = 'shards build --target claude --dev, then: claude --plugin-dir <repo>/adapters/claude-code';
  for (const d of adapterDirs) {
    if (exists(path.join(d, '.claude-plugin', 'plugin.json')) && exists(path.join(d, '.shards-dev'))) {
      return { id: 'mcp.claude', status: 'PASS', message: `dev plugin built at ${d} (load with claude --plugin-dir ${d})` };
    }
  }
  const files = [path.join(root, '.mcp.json'), path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json'),
    path.join(home, '.claude.json'), path.join(home, '.claude', 'settings.json')];
  for (const f of files) if (jsonHasShardsServer(f)) return { id: 'mcp.claude', status: 'PASS', message: `shards MCP server registered in ${f}` };
  return { id: 'mcp.claude', status: 'WARN', message: 'no shards MCP server found for Claude Code (no dev plugin build, no mcp config entry)', fix };
}

function checkMcpCodex(root, codexHome) {
  for (const f of [path.join(root, '.codex', 'config.toml'), path.join(codexHome, 'config.toml')]) {
    const t = readText(f);
    if (t !== null && /^\s*\[mcp_servers\.(shards|plugin_shards_shards)\]/m.test(t)) {
      return { id: 'mcp.codex', status: 'PASS', message: `[mcp_servers.shards] registered in ${f}` };
    }
  }
  return { id: 'mcp.codex', status: 'WARN', message: 'no [mcp_servers.shards] in Codex config', fix: 'install the Codex plugin, then shards install --codex (docs/release.md)' };
}

// ---- git ----
async function gitChecks(root) {
  const out = [];
  const git = require('../../runtime/git');
  let st;
  try { st = await git.gitState(root); } catch (e) { st = { inRepo: false }; }
  if (!st.inRepo) {
    out.push({ id: 'git.repo', status: 'WARN', message: 'not a git repository; gate commits will be skipped', fix: 'git init' });
  } else {
    out.push({ id: 'git.repo', status: 'PASS', message: `git repository${st.branch ? ` on branch ${st.branch}` : ''}` });
    out.push(st.detached
      ? { id: 'git.head', status: 'WARN', message: 'detached HEAD; gate commits will be skipped', fix: 'git switch <branch>' }
      : { id: 'git.head', status: 'PASS', message: 'HEAD is on a branch' });
    out.push(st.inProgress
      ? { id: 'git.merge', status: 'WARN', message: `${st.inProgress} in progress; gate commits will be deferred`, fix: `finish or abort the ${st.inProgress}` }
      : { id: 'git.merge', status: 'PASS', message: 'no merge/rebase in progress' });
  }
  let pend = [];
  try { pend = git.listPending(root); } catch (_) { /* no store */ }
  const stuck = pend.filter((r) => r.status === 'stuck');
  const waiting = pend.filter((r) => r.status !== 'stuck');
  if (stuck.length) out.push({ id: 'git.pending', status: 'FAIL', message: `${stuck.length} stuck gate commit(s): ${stuck.map((r) => r.gate).join(', ')}`, fix: 'resolve the git problem, then run `shards doctor --fix`' });
  else if (waiting.length) out.push({ id: 'git.pending', status: 'WARN', message: `${waiting.length} pending gate commit(s): ${waiting.map((r) => r.gate).join(', ')}`, fix: 'they replay on the next gate; or run `shards doctor --fix`' });
  else out.push({ id: 'git.pending', status: 'PASS', message: 'no pending gate commits' });

  if (st.inRepo) {
    const ign = spawnSync('git', ['check-ignore', '-q', '.shards/state/x'], { cwd: root, timeout: 10000 });
    out.push(ign.status === 0
      ? { id: 'git.ignore', status: 'PASS', message: '.shards/ is gitignored' }
      : { id: 'git.ignore', status: 'WARN', message: '.shards/ is not gitignored (runtime state may get committed)', fix: 'add ".shards/" to .gitignore (or run `shards doctor --fix`)' });
  } else out.push({ id: 'git.ignore', status: 'PASS', message: 'not a git repo; nothing to ignore' });
  return out;
}

// E6.8: external copy queue (copy_report). Stuck copies need a human; queued ones retry at the next gate.
function copyCheck(root) {
  let rows = [];
  try { rows = require('../../runtime/copies').listAll(root).filter((r) => r.status !== 'done'); } catch (_) { /* no state */ }
  const stuck = rows.filter((r) => r.status === 'stuck');
  const queued = rows.filter((r) => r.status === 'queued');
  const names = (rs) => rs.map((r) => `${r.gate_id}->${r.target}`).join(', ');
  if (stuck.length) return { id: 'copies', status: 'FAIL', message: `${stuck.length} stuck external copy(ies) after 5 attempts: ${names(stuck)}${queued.length ? `; ${queued.length} queued` : ''}`, fix: 'see `shards sync --status`; fix the target (auth, space, project), then re-run the copy through its binding' };
  if (queued.length) return { id: 'copies', status: 'WARN', message: `${queued.length} queued external copy(ies): ${names(queued)}`, fix: 'the agent retries them at the next gate; see `shards sync --status`' };
  return { id: 'copies', status: 'PASS', message: 'no queued or stuck external copies' };
}

async function runChecks(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const home = opts.home || process.env.HOME || os.homedir();
  // Codex reads $CODEX_HOME/config.toml (default ~/.codex), the file `shards install --codex` writes. An explicit
  // opts.home (tests) pins it to <home>/.codex so the caller's real CODEX_HOME is never read.
  const codexHome = path.resolve(opts.codexHome || (!opts.home && process.env.CODEX_HOME) || path.join(home, '.codex'));
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const checks = [];
  const adapterDirs = findAdapterDirs(root, repoRoot);

  const major = Number(process.versions.node.split('.')[0]);
  checks.push(major >= 18 ? { id: 'node', status: 'PASS', message: `Node ${process.versions.node}` }
    : { id: 'node', status: 'FAIL', message: `Node ${process.versions.node} is too old (>=18 required)`, fix: 'install Node 18 or newer' });
  const py = bin('python3', ['--version']);
  checks.push(py ? { id: 'python3', status: 'PASS', message: py }
    : { id: 'python3', status: 'WARN', message: 'python3 not found (needed for notebooks only)', fix: 'install Python 3 if you use notebook modes' });
  const gv = bin('git', ['--version']);
  checks.push(gv ? { id: 'git', status: 'PASS', message: gv }
    : { id: 'git', status: 'FAIL', message: 'git not found', fix: 'install git' });

  // config: validate only, never create
  const cfgPath = path.join(root, 'shards.config.yaml');
  const cfgText = readText(cfgPath);
  if (cfgText === null) checks.push({ id: 'config', status: 'PASS', message: 'no shards.config.yaml; defaults will be used' });
  else {
    try {
      const YAML = require('yaml');
      const { validateConfig } = require('../../runtime/config');
      let parsed = YAML.parse(cfgText);
      if (parsed === null || parsed === undefined) parsed = {};
      const res = validateConfig(parsed);
      checks.push(res.ok ? { id: 'config', status: 'PASS', message: 'shards.config.yaml is valid' }
        : { id: 'config', status: 'FAIL', message: `invalid shards.config.yaml: ${res.errors.join('; ')}`, fix: `edit ${cfgPath} to fix the errors` });
    } catch (e) {
      checks.push({ id: 'config', status: 'FAIL', message: `shards.config.yaml is not valid YAML: ${e.message}`, fix: `edit ${cfgPath}` });
    }
  }

  checks.push(checkMcpClaude(root, home, adapterDirs));
  checks.push(checkMcpCodex(root, codexHome));
  checks.push(checkHooks(adapterDirs));
  checks.push(...await gitChecks(root));
  checks.push(copyCheck(root));

  const hits = [
    ...scanClaudeSettings(path.join(root, '.claude', 'settings.json')),
    ...scanClaudeSettings(path.join(root, '.claude', 'settings.local.json')),
    ...scanClaudeSettings(path.join(home, '.claude', 'settings.json')),
    ...scanCodexToml(path.join(codexHome, 'config.toml')),
    ...scanCodexToml(path.join(root, '.codex', 'config.toml')),
  ];
  checks.push(hits.length
    ? { id: 'permissions.gate-tools', status: 'FAIL', message: `allow rule(s) cover gate tools (would skip the gate prompt): ${hits.map((h) => `${h.file}: ${h.rule}`).join('; ')}`, fix: 'remove these rules; gate_advance, gate_force_close and gate_confirm must always prompt' }
    : { id: 'permissions.gate-tools', status: 'PASS', message: 'no allow rule covers gate_advance, gate_force_close or gate_confirm' });
  return checks;
}

function summarize(checks) {
  const s = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) s[c.status.toLowerCase()]++;
  return s;
}

async function applyFixes(root) {
  const done = [];
  const git = require('../../runtime/git');
  let st = { inRepo: false };
  try { st = await git.gitState(root); } catch (_) { /* ignore */ }
  if (st.inRepo) {
    const gi = path.join(root, '.gitignore');
    const cur = readText(gi);
    const has = cur !== null && cur.split(/\r?\n/).some((l) => /^\/?\.shards\/?\*?$/.test(l.trim()));
    if (!has) {
      fs.writeFileSync(gi, (cur === null || cur === '' ? '' : cur.endsWith('\n') ? cur : cur + '\n') + '.shards/\n');
      done.push('appended .shards/ to .gitignore');
    }
  }
  let stuck = [];
  try { stuck = git.listPending(root).filter((r) => r.status === 'stuck'); } catch (_) { /* ignore */ }
  if (stuck.length) {
    try {
      const res = await git.replayPending(root, { force: true });
      done.push(`replayed ${stuck.length} stuck gate commit(s): ${JSON.stringify(res)}`);
    } catch (e) { done.push(`replay of stuck gate commits failed: ${e.message}`); }
  }
  return done;
}

async function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards doctor: ${e.message}\n\n${usage()}`); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
  let fixes = [];
  if (o.fix) fixes = await applyFixes(root);
  const checks = await runChecks({ root });
  const summary = summarize(checks);
  if (o.json) {
    console.log(JSON.stringify({ checks, summary, ...(o.fix ? { fixes } : {}) }, null, 2));
  } else {
    if (o.fix) console.log(fixes.length ? fixes.map((f) => `fixed: ${f}`).join('\n') : 'fixed: nothing to fix');
    for (const c of checks) {
      console.log(`${c.status.padEnd(4)}  ${c.id}  ${c.message}`);
      if (c.status !== 'PASS' && c.fix) console.log(`      fix: ${c.fix}`);
    }
    console.log(`\n${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
    if (!o.fix && checks.some((c) => c.id === 'git.ignore' && c.status !== 'PASS' || c.id === 'git.pending' && c.status !== 'PASS')) {
      console.log('note: `shards doctor --fix` can append .shards/ to .gitignore and replay stuck gate commits.');
    }
  }
  return summary.fail ? 1 : 0;
}

module.exports = { run, runChecks, ruleCoversGateTools };
