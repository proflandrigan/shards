#!/usr/bin/env node
'use strict';
// `shards` CLI dispatcher. Add later subcommands (doctor, gates, sessions, ...) to COMMANDS.
const path = require('path');

const COMMANDS = {
  build: { summary: 'Compile core/ into a target package (claude|codex|skills)', run: runBuild },
  // EXTENSION POINT: register doctor / gates / sessions here, e.g.
  //   doctor: { summary: '...', run: (argv) => require('./doctor').run(argv) },
};

function usage() {
  const lines = ['Usage: shards <command> [options]', '', 'Commands:'];
  for (const [n, c] of Object.entries(COMMANDS)) lines.push(`  ${n.padEnd(8)} ${c.summary}`);
  lines.push('', 'build options: --target <claude|codex|skills> [--dev] [--out dir] [--strict] [--core dir]');
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
    else throw new Error(`unknown option '${a}'`);
  }
  if (!o.target) throw new Error('--target <claude|codex|skills> is required');
  return o;
}

function runBuild(argv) {
  let o;
  try { o = parseBuildArgs(argv); } catch (e) { console.error(`shards build: ${e.message}\n\n${usage()}`); return 2; }
  const { compile } = require('../build/compile');
  const outDir = o.out || path.join(process.cwd(), 'adapters', o.target);
  const r = compile({ target: o.target, coreDir: o.core, outDir, dev: o.dev, strict: o.strict });
  if (r.errors.length) {
    for (const e of r.errors) console.error(e);
    console.error(`build failed: ${r.errors.length} error(s)`);
    return 1;
  }
  console.log(r.table);
  console.log(`\nbuilt ${o.target} -> ${outDir} (${r.files.length} files)`);
  return 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { console.log(usage()); return cmd ? 0 : 2; }
  const c = COMMANDS[cmd];
  if (!c) { console.error(`shards: unknown command '${cmd}'\n\n${usage()}`); return 2; }
  return c.run(rest);
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, COMMANDS };
