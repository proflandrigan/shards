#!/usr/bin/env node
'use strict';
// `shards` CLI dispatcher. Add later subcommands (doctor, gates, sessions, ...) to COMMANDS.
const path = require('path');

const COMMANDS = {
  build: { summary: 'Compile core/ into a target package (claude|codex|skills)', run: runBuild },
  'uninstall-dev': { summary: 'Remove dev build output (adapters/<target>) made by build --dev', run: runUninstallDev },
  gates: { summary: 'Gate status and interim operator confirm (E11.13 replaces this)', run: (argv) => require('./commands/gates').run(argv) },
  doctor: { summary: 'Check prerequisites, config, MCP, hooks, git state and gate permissions', run: (argv) => require('./commands/doctor').run(argv) },
  sessions: { summary: 'List, show, resume and end sessions without the UI', run: (argv) => require('./commands/sessions').run(argv) },
  migrate: { summary: 'Migrate a legacy v1 install to v2 (ledger export, gate-history import, manifest-driven cleanup)', run: (argv) => require('./commands/migrate').run(argv) },
  install: { summary: 'Opt-in project config: skills (--project), permission preset (--permissions), CLAUDE.md conventions (--claude-md) and AGENTS.md section (--agents-md), Codex MCP entry and profiles (--codex)', run: (argv) => require('./commands/install').run(argv) },
  sync: { summary: 'List the external copy queue: pending and stuck copies per gate and target (--status)', run: (argv) => require('./commands/sync').run(argv) },
  research: { summary: 'Autonomous-research run status for overnight shell drivers (status [--json] [--branch <name>]; `done` once converged or ended)', run: (argv) => require('./commands/research').run(argv) },
  connect: { summary: 'Check which MCP servers (Atlassian, Google Drive, GitHub) are registered and print the official add commands', run: (argv) => require('./commands/connect').run(argv) },
  // EXTENSION POINT: register doctor / gates / sessions here, e.g.
  //   doctor: { summary: '...', run: (argv) => require('./doctor').run(argv) },
};

function usage() {
  const lines = ['Usage: shards <command> [options]', '', 'Commands:'];
  for (const [n, c] of Object.entries(COMMANDS)) lines.push(`  ${n.padEnd(14)} ${c.summary}`);
  lines.push('', 'build options: --target <claude|codex|skills> [--dev] [--out dir] [--strict] [--default-agent] [--core dir] [--no-bundle-deps] [--marketplace]');
  lines.push('  release (non-dev) claude builds are a self-contained plugin; --no-bundle-deps skips node_modules; --marketplace writes the plugin at <out>/plugins/shards plus <out>/.claude-plugin/marketplace.json (claude, default out adapters/marketplace) or <out>/.agents/plugins/marketplace.json (codex, default out adapters/codex-marketplace; then: codex plugin marketplace add <out>; codex plugin add shards@shards-local)');
  lines.push('uninstall-dev options: [--target claude|codex|all] [--out dir]  (with --out only that dir is removed, and only if it has the .shards-dev marker)');
  lines.push('gates: gates <status|history|checkpoints|violations|force-close|confirm> [options]');
  lines.push('  gates status [--session k] [--root d]');
  lines.push('  gates history [--session k] [--gate id] [--json] [--root d]');
  lines.push('  gates checkpoints [--session k] [--json] [--root d]');
  lines.push('  gates violations [--json] [--root d]');
  lines.push('  gates force-close <gate-id> | --all [--session k] [--reason "text"] [--root d]');
  lines.push('  gates confirm <gate-id> [--session k] [--changes "note"] [--root d]');
  lines.push('doctor: doctor [--root d] [--json] [--fix]');
  lines.push('sessions: sessions list|show|resume|end [id] [--root d] [--status s] [--limit n] [--json]');
  lines.push('sync: sync --status [--json] [--all] [--root d]');
  lines.push('research: research status [--run id] [--branch b] [--session k] [--json] [--root d]  (read-only; exit 1 when no run is found)');
  lines.push('connect: connect [--host claude|codex] [--only atlassian,drive,github] [--json] [--root d] [--home d]  (read-only; prints commands, never runs them)');
  lines.push('install: install (--project | --permissions | --claude-md | --agents-md | --codex) [--root d] [--preset <file>] [--remove] [--dry-run] [--force]  (--remove is the uninstall: it removes only what install added)');
  lines.push('  --codex: [mcp_servers.shards] in Codex config.toml + shards-<agent> profiles [--codex-home d] [--codex-config file] [--server path | --plugin-dir d]');
  lines.push('migrate: migrate [--export-ledger] [--root d] [--out d] [--dry-run] [--force]  (full legacy migrate; --export-ledger = ledger step only)');
  return lines.join('\n');
}

function parseBuildArgs(argv) {
  const o = { dev: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--target') o.target = val();
    else if (a === '--out') o.out = val();
    else if (a === '--core') o.core = val();
    else if (a === '--dev') o.dev = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--no-bundle-deps') o.bundleDeps = false;
    else if (a === '--marketplace') o.marketplace = true;
    else if (a === '--default-agent') o.defaultAgent = true;
    else throw new Error(`unknown option '${a}'`);
  }
  if (!o.target) throw new Error('--target <claude|codex|skills> is required');
  if (o.marketplace && o.target !== 'claude' && o.target !== 'codex') throw new Error('--marketplace requires --target claude or codex');
  if (o.marketplace && o.dev && o.target === 'claude') throw new Error('--marketplace builds the release plugin; it cannot be combined with --dev');
  return o;
}

// Default out dir: adapters/<claude-code|codex|skills>.
const OUT_NAMES = { claude: 'claude-code', codex: 'codex', skills: 'skills' };
function defaultOutDir(target) { return path.join(process.cwd(), 'adapters', OUT_NAMES[target] || target); }

function printDevHint(target, outDir) {
  if (target === 'claude') console.log(`\nInstall (dev): claude --plugin-dir ${outDir}\n  skills: /shards:agents`);
  else if (target === 'codex') {
    console.log(`\nInstall (dev; Codex 0.169.0 checked, docs/release.md):\n  - plugin (skills + hooks): shards build --target codex --dev --marketplace, then codex plugin marketplace add <out>; codex plugin add shards@shards-local\n  - MCP server + profiles: shards install --codex --plugin-dir ${outDir}   (or append the [mcp_servers.shards] block from ${path.join(outDir, '.codex', 'config.toml')} to $CODEX_HOME/config.toml)\n  - trust the hooks when Codex asks (untrusted hooks are skipped silently)\n  skills: $shards:agents`);
  }
}

function runUninstallDev(argv) {
  let target = 'all'; let out;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) target = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) out = argv[++i];
    else { console.error(`shards uninstall-dev: unknown option '${argv[i]}'\n\n${usage()}`); return 2; }
  }
  if (!['claude', 'codex', 'all'].includes(target)) { console.error(`shards uninstall-dev: --target must be claude|codex|all`); return 2; }
  if (out && target === 'all') { console.error('shards uninstall-dev: --out names one directory; pass --target claude or --target codex with it'); return 2; }
  // --out names exactly one dir (whatever its target); never fall back to the default adapters/<target> dirs.
  const dirs = out ? [path.resolve(out)] : (target === 'all' ? ['claude', 'codex'] : [target]).map(defaultOutDir);
  const fs = require('fs');
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(dir, '.shards-dev'))) { console.log(`skip ${dir} (no .shards-dev marker)`); continue; }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
  }
  console.log('Reminders: claude --plugin-dir is not persistent (just stop passing it). Codex: codex plugin remove shards@shards-local and shards install --codex --remove.');
  return 0;
}

// v1 had `npx shards uninstall` (tools/install.js). v2 has no global install to undo; point at the replacements.
function runUninstall() {
  console.error([
    'shards uninstall: removed in v2.',
    '  Legacy v1 install in this project:  shards migrate --dry-run   then   shards migrate',
    '  Project opt-ins (install --project | --permissions | --claude-md | --agents-md):  shards install <flag> --remove',
    '  Codex MCP entry and profiles (install --codex):  shards install --codex --remove  (same --codex-home/--codex-config as install)',
    '  Dev build output:  shards uninstall-dev',
    '  Plugin:  /plugin uninstall shards@shards  (Claude Code)',
  ].join('\n'));
  return 1;
}

function runBuild(argv) {
  let o;
  try { o = parseBuildArgs(argv); } catch (e) { console.error(`shards build: ${e.message}\n\n${usage()}`); return 2; }
  const { compile } = require('../build/compile');
  const mktRoot = o.marketplace ? path.resolve(o.out || path.join(process.cwd(), 'adapters', o.target === 'codex' ? 'codex-marketplace' : 'marketplace')) : null;
  const outDir = mktRoot ? path.join(mktRoot, 'plugins', 'shards') : (o.out || defaultOutDir(o.target));
  const r = compile({ target: o.target, coreDir: o.core, outDir, dev: o.dev, strict: o.strict, defaultAgent: o.defaultAgent, bundleDeps: o.bundleDeps });
  if (r.errors.length) {
    for (const e of r.errors) console.error(e);
    console.error(`build failed: ${r.errors.length} error(s)`);
    return 1;
  }
  console.log(r.table);
  console.log(`\nbuilt ${o.target} -> ${outDir} (${r.files.length} files)`);
  if (mktRoot) {
    const fs = require('fs');
    const pk = require('../build/package');
    const mf = path.join(mktRoot, o.target === 'codex' ? '.agents/plugins' : '.claude-plugin', 'marketplace.json');
    fs.mkdirSync(path.dirname(mf), { recursive: true });
    fs.writeFileSync(mf, o.target === 'codex' ? `${JSON.stringify(pk.codexMarketplaceManifest(), null, 2)}\n` : pk.marketplaceText({ local: true }));
    console.log(`marketplace -> ${mf}`);
  }
  if (o.dev) printDevHint(o.target, path.resolve(outDir));
  return 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { console.log(usage()); return cmd ? 0 : 2; }
  if (cmd === 'uninstall') return runUninstall(); // removed v1 command: not listed, prints its replacements
  const c = COMMANDS[cmd];
  if (!c) { console.error(`shards: unknown command '${cmd}'\n\n${usage()}`); return 2; }
  return c.run(rest);
}

if (require.main === module) Promise.resolve(main(process.argv.slice(2))).then((c) => process.exit(c), (e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
module.exports = { main, COMMANDS, usage };
