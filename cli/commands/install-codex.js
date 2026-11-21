'use strict';
// `shards install --codex` (E8.3, docs/compat.md CX-1/CX-7): register the shards MCP server in a Codex config.toml and
// copy the per-agent profile files (Codex profiles v2) into $CODEX_HOME.
//
// Why config.toml and not the plugin's .mcp.json: Codex 0.169 runs a plugin .mcp.json server from the plugin cache
// dir with a scrubbed env (and does not expand ${PLUGIN_ROOT} in its args), so the runtime would keep its state in
// <plugin cache>/.shards while the hooks write <project>/.shards and pending gates would never block writes. A
// config.toml server started for a thread runs with cwd = the project (verified), so both sides share one state dir.
// The entry needs the absolute path of the installed plugin's runtime/server.js, which only exists after
// `codex plugin add`, hence this installer.
//
// The MCP entry is a marker-delimited block (`# shards:begin codex-mcp v1` ... `# shards:end codex-mcp`): rerunning
// replaces it in place (idempotent), --remove deletes exactly that block (and the file if this command created it and
// nothing else is left). Profile files carry CODEX_PROFILE_MARK on line 1; only marked files are overwritten or removed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const relpkg = require('../../build/package');

const REPO = path.resolve(__dirname, '..', '..');
const BEGIN = '# shards:begin codex-mcp v1';
const END = '# shards:end codex-mcp';
const BLOCK_RE = /# shards:begin codex-mcp[^\n]*\n[\s\S]*?# shards:end codex-mcp\n?/;
const TABLE_RE = /^\s*\[\s*mcp_servers\s*\.\s*(?:shards|"shards")\s*\]/m;
const PROFILE_RE = /^shards-[A-Za-z0-9_-]+\.config\.toml$/;

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

function codexHome(env = process.env) { return path.resolve(env.CODEX_HOME || path.join(os.homedir(), '.codex')); }

// Numeric-aware version compare ("2.0.0-next.10" > "2.0.0-next.9"); a release sorts above its prereleases.
function cmpVersion(a, b) {
  const split = (v) => { const [main, pre] = String(v).split('-', 2); return { main: main.split('.').map((x) => parseInt(x, 10) || 0), pre }; };
  const x = split(a); const y = split(b);
  for (let i = 0; i < Math.max(x.main.length, y.main.length); i++) {
    const d = (x.main[i] || 0) - (y.main[i] || 0);
    if (d) return d;
  }
  if (!x.pre !== !y.pre) return x.pre ? -1 : 1;
  return String(x.pre || '').localeCompare(String(y.pre || ''), undefined, { numeric: true });
}

// Installed plugin copies: <home>/plugins/cache/<marketplace>/shards/<version>/ with runtime/server.js. Newest version first.
function findInstalledPlugins(home) {
  const base = path.join(home, 'plugins', 'cache');
  const found = [];
  let mkts = [];
  try { mkts = fs.readdirSync(base); } catch (_) { return found; }
  for (const m of mkts.sort()) {
    const dir = path.join(base, m, 'shards');
    let vers = [];
    try { vers = fs.readdirSync(dir); } catch (_) { continue; }
    for (const v of vers) {
      const root = path.join(dir, v);
      if (fs.existsSync(path.join(root, 'runtime', 'server.js'))) found.push({ root, marketplace: m, version: v });
    }
  }
  return found.sort((a, b) => cmpVersion(b.version, a.version) || (a.marketplace < b.marketplace ? -1 : 1));
}

// -> {pluginDir|null, server} or throws with a fix hint.
function resolveServer({ home, server, pluginDir }) {
  if (server) {
    const s = path.resolve(server);
    if (!fs.existsSync(s)) throw new Error(`--server ${s} does not exist`);
    const guess = path.dirname(path.dirname(s));
    return { server: s, pluginDir: pluginDir ? path.resolve(pluginDir) : (fs.existsSync(path.join(guess, '.codex-plugin')) ? guess : null) };
  }
  if (pluginDir) {
    const d = path.resolve(pluginDir);
    let s = path.join(d, 'runtime', 'server.js');
    // A dev build (`shards build --target codex --dev`) has no bundled runtime; it runs this repo's.
    if (!fs.existsSync(s) && fs.existsSync(path.join(d, '.shards-dev'))) s = path.join(REPO, 'runtime', 'server.js');
    if (!fs.existsSync(s)) throw new Error(`no runtime/server.js under ${d}`);
    return { server: s, pluginDir: d };
  }
  const found = findInstalledPlugins(home);
  if (!found.length) {
    throw new Error(`no installed Codex plugin "shards" under ${path.join(home, 'plugins', 'cache')}. ` +
      'Install it first (codex plugin marketplace add <dir>; codex plugin add shards@<marketplace>), or pass --server <path to runtime/server.js> or --plugin-dir <dir>.');
  }
  return { server: path.join(found[0].root, 'runtime', 'server.js'), pluginDir: found[0].root };
}

const fwd = (p) => p.split(path.sep).join('/');
function blockText(server) { return `${BEGIN}\n${relpkg.codexMcpToml(fwd(server))}${END}\n`; }

function applyMcp(file, server, opts = {}) {
  const cur = readText(file);
  const block = blockText(server);
  if (cur !== null) {
    const outside = cur.replace(BLOCK_RE, '');
    if (TABLE_RE.test(outside)) throw new Error(`${file} already has an [mcp_servers.shards] table not written by shards install; remove it first (or edit it by hand)`);
  }
  let next;
  if (cur === null) next = block;
  else if (BLOCK_RE.test(cur)) next = cur.replace(BLOCK_RE, () => block);
  else {
    const sep = cur.length === 0 ? '' : cur.endsWith('\n\n') ? '' : cur.endsWith('\n') ? '\n' : '\n\n';
    next = cur + sep + block;
  }
  if (next === cur) return { changed: false, file };
  if (!opts.dryRun) writeAtomic(file, next);
  return { changed: true, file, created: cur === null };
}

function removeMcp(file, opts = {}) {
  const cur = readText(file);
  if (cur === null || !BLOCK_RE.test(cur)) return { changed: false, file };
  // Also drop the one blank separator line applyMcp put before the block, wherever the block now sits.
  const next = cur.replace(new RegExp(`(^|\\n)\\n?${BLOCK_RE.source}`), '$1');
  const del = !next.trim();
  if (!opts.dryRun) { if (del) fs.rmSync(file, { force: true }); else writeAtomic(file, next); }
  return { changed: true, file, deleted: del };
}

const isOurs = (text) => typeof text === 'string' && text.startsWith(relpkg.CODEX_PROFILE_MARK);

function applyProfiles(home, pluginDir, opts = {}) {
  const r = { written: [], unchanged: [], skipped: [] };
  const src = pluginDir ? path.join(pluginDir, '.codex') : null;
  let names = [];
  try { names = fs.readdirSync(src).filter((f) => PROFILE_RE.test(f)).sort(); } catch (_) { return r; }
  for (const f of names) {
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    const dest = path.join(home, f);
    const cur = readText(dest);
    if (cur === text) { r.unchanged.push(f); continue; }
    if (cur !== null && !isOurs(cur)) { r.skipped.push(f); continue; }
    if (!opts.dryRun) writeAtomic(dest, text);
    r.written.push(f);
  }
  return r;
}

function removeProfiles(home, opts = {}) {
  const removed = [];
  let names = [];
  try { names = fs.readdirSync(home).filter((f) => PROFILE_RE.test(f)).sort(); } catch (_) { return removed; }
  for (const f of names) {
    if (!isOurs(readText(path.join(home, f)))) continue;
    if (!opts.dryRun) fs.rmSync(path.join(home, f), { force: true });
    removed.push(f);
  }
  return removed;
}

// install({home, config, server, pluginDir, remove, dryRun}) -> {lines: [...]}
function installCodex(o = {}) {
  const home = path.resolve(o.home || codexHome(o.env));
  const config = path.resolve(o.config || path.join(home, 'config.toml'));
  const dry = o.dryRun ? ' [dry-run]' : '';
  const lines = [];
  if (o.remove) {
    const m = removeMcp(config, o);
    lines.push(`codex: ${m.changed ? (m.deleted ? 'removed [mcp_servers.shards] block and deleted file' : 'removed [mcp_servers.shards] block') : 'no shards MCP block'} (${config})${dry}`);
    const p = removeProfiles(home, o);
    lines.push(`codex: ${p.length ? `removed ${p.length} profile file(s)` : 'no shards profile files'} (${home})${dry}`);
    return { lines, config, home };
  }
  const { server, pluginDir } = resolveServer({ home, server: o.server, pluginDir: o.pluginDir });
  const m = applyMcp(config, server, o);
  lines.push(`codex: ${m.changed ? '[mcp_servers.shards] written' : 'no change'} (${config}; server ${server})${dry}`);
  const p = applyProfiles(home, pluginDir, o);
  lines.push(`codex: profiles ${p.written.length} written, ${p.unchanged.length} unchanged${p.skipped.length ? `, skipped ${p.skipped.length} existing file(s) not written by shards: ${p.skipped.join(', ')}` : ''} (${home}; use codex -p shards-<agent>)${dry}`);
  lines.push('codex: the plugin hooks must be trusted; Codex skips untrusted hooks silently (approve them when Codex asks, see docs/release.md). Rerun this after a plugin upgrade (the server path contains the version).');
  return { lines, config, home, server, pluginDir };
}

module.exports = { installCodex, applyMcp, removeMcp, applyProfiles, removeProfiles, resolveServer, findInstalledPlugins, cmpVersion, codexHome, blockText, BEGIN, END };
