import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// E10.6: `shards --help` must document every registered command, every flag the commands parse, and every
// subcommand of the multi-verb commands (gates, sessions). Flags/subcommands are scraped from the sources, so a
// new flag or subcommand that is not added to usage() fails here.
const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, '..');
const CLI = path.join(root, 'cli', 'shards.js');
const help = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' }).stdout;
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const flagsIn = (text) => [...new Set([...text.matchAll(/\ba === '(--[a-z][a-z-]*)'/g)].map((m) => m[1]))].sort();
const subsIn = (text) => [...new Set([...text.matchAll(/\bsub === '([a-z-]+)'/g)].map((m) => m[1]))].sort();
// command -> source files whose parser defines its flags (a new command must be added here)
const COMMAND_FILES = { build: 'cli/shards.js', 'uninstall-dev': 'cli/shards.js', gates: 'cli/commands/gates.js', doctor: 'cli/commands/doctor.js', sessions: 'cli/commands/sessions.js', migrate: 'cli/commands/migrate.js', install: 'cli/commands/install.js' };

describe('shards --help completeness', () => {
  it('lists every registered command', () => {
    const { COMMANDS } = require(CLI);
    expect(Object.keys(COMMANDS).sort()).toEqual(Object.keys(COMMAND_FILES).sort());
    for (const name of Object.keys(COMMANDS)) expect(help, name).toMatch(new RegExp(`^  ${name}\\s`, 'm'));
  });

  it('documents install --project and install --agents-md', () => {
    const line = help.split('\n').find((l) => l.startsWith('install:'));
    expect(line).toContain('--project');
    expect(line).toContain('--agents-md');
  });

  it('every flag each command parses appears in help', () => {
    for (const [name, file] of Object.entries(COMMAND_FILES)) {
      for (const f of flagsIn(src(file))) {
        if (f === '--help') continue; // implicit on every command
        expect(help, `${name} ${f}`).toContain(f);
      }
    }
  });

  it('lists every gates subcommand and every sessions subcommand', () => {
    const gateSubs = subsIn(src('cli/commands/gates.js'));
    expect(gateSubs).toEqual(expect.arrayContaining(['status', 'history', 'checkpoints', 'violations', 'force-close', 'confirm']));
    for (const s of gateSubs) expect(help, `gates ${s}`).toContain(`gates ${s}`);
    const sessSubs = subsIn(src('cli/commands/sessions.js'));
    expect(sessSubs.length).toBeGreaterThan(0);
    for (const s of sessSubs) expect(help, `sessions ${s}`).toMatch(new RegExp(`sessions[^\\n]*\\b${s}\\b`));
  });
});
