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
  install: { summary: 'Opt-in project config: permission preset (--permissions) and CLAUDE.md conventions (--claude-md)', run: (argv) => require('./commands/install').run(argv) },
  // EXTENSION POINT: register doctor / gates / sessions here, e.g.
  //   doctor: { summary: '...', run: (argv) => require('./doctor').run(argv) },
};

function usage() {
  const lines = ['Usage: shards <command> [options]', '', 'Commands:'];
  for (const [n, c] of Object.entries(COMMANDS)) lines.push(`  ${n.padEnd(14)} ${c.summary}`);
  lines.push('', 'build options: --target <claude|codex|skills> [--dev] [--out dir] [--strict] [--default-agent] [--core dir] [--no-bundle-deps] [--marketplace]');
  lines.push('  release (non-dev) claude builds are a self-contained plugin; --no-bundle-deps skips node_modules; --marketplace writes <out>/.claude-plugin/marketplace.json and the plugin at <out>/plugins/shards (claude only, default out adapters/marketplace)');
  lines.push('uninstall-dev options: [--target claude|codex|all] [--out dir]');
  lines.push('gates: gates status [--session k] [--root d] | gates confirm <gate-id> [--session k] [--changes "note"] [--root d]');
  lines.push('doctor: doctor [--root d] [--json] [--fix]');
  lines.push('sessions: sessions list|show|resume|end [id] [--root d] [--status s] [--limit n] [--json]');
  lines.push('install: install (--permissions | --claude-md) [--root d] [--remove] [--dry-run] [--force]  (--remove is the uninstall: it removes only what install added)');
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
  if (o.marketplace && o.target !== 'claude') throw new Error('--marketplace requires --target claude');
  if (o.marketplace && o.dev) throw new Error('--marketplace builds the release plugin; it cannot be combined with --dev');
  return o;
}

// Default out dir: adapters/<claude-code|codex|skills>.
const OUT_NAMES = { claude: 'claude-code', codex: 'codex', skills: 'skills' };
function defaultOutDir(target) { return path.join(process.cwd(), 'adapters', OUT_NAMES[target] || target); }

function printDevHint(target, outDir) {
  if (target === 'claude') console.log(`\nInstall (dev): claude --plugin-dir ${outDir}\n  skills: /shards:agents`);
  else if (target === 'codex') {
    console.log(`\nInstall (dev, UNVERIFIED, docs-only): Codex plugin loading is not confirmed. Options:\n  - add the MCP entry: cat ${path.join(outDir, '.codex', 'config.toml')} >> ~/.codex/config.toml\n  - copy or symlink hooks: ${path.join(outDir, '.codex', 'hooks.json')} -> <project>/.codex/hooks.json\n  - copy or symlink skills: ${path.join(outDir, 'skills')} -> ~/.codex/skills (or a local plugin marketplace pointing at ${outDir})\n  skills: $agents`);
  }
}

function runUninstallDev(argv) {
  let target = 'all'; let out;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) target = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) out = argv[++i];
    else { console.error(`shards uninstall-dev: unknown option '${argv[i]}'\n\n${usage()}`); return 2; }
  }
  const targets = target === 'all' ? ['claude', 'codex'] : [target];
  if (!targets.every((t) => t === 'claude' || t === 'codex')) { console.error(`shards uninstall-dev: --target must be claude|codex|all`); return 2; }
  const fs = require('fs');
  for (const t of targets) {
    const dir = out && targets.length === 1 ? path.resolve(out) : defaultOutDir(t);
    if (!fs.existsSync(path.join(dir, '.shards-dev'))) { console.log(`skip ${dir} (no .shards-dev marker)`); continue; }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
  }
  console.log('Reminders: claude --plugin-dir is not persistent (just stop passing it). Codex: remove any symlink or copied files and the [mcp_servers.shards] entry you added to ~/.codex/config.toml.');
  return 0;
}

function runBuild(argv) {
  let o;
  try { o = parseBuildArgs(argv); } catch (e) { console.error(`shards build: ${e.message}\n\n${usage()}`); return 2; }
  const { compile } = require('../build/compile');
  const mktRoot = o.marketplace ? path.resolve(o.out || path.join(process.cwd(), 'adapters', 'marketplace')) : null;
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
    const mf = path.join(mktRoot, '.claude-plugin', 'marketplace.json');
    fs.mkdirSync(path.dirname(mf), { recursive: true });
    fs.writeFileSync(mf, require('../build/package').marketplaceText());
    console.log(`marketplace -> ${mf}`);
  }
  if (o.dev) printDevHint(o.target, path.resolve(outDir));
  return 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { console.log(usage()); return cmd ? 0 : 2; }
  const c = COMMANDS[cmd];
  if (!c) { console.error(`shards: unknown command '${cmd}'\n\n${usage()}`); return 2; }
  return c.run(rest);
}

if (require.main === module) Promise.resolve(main(process.argv.slice(2))).then((c) => process.exit(c), (e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
module.exports = { main, COMMANDS };
