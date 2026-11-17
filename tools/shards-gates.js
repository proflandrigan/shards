#!/usr/bin/env node
// shards-gates: DEPRECATED alias for `shards gates` (E10.5). Forwards to the v2 operator CLI
// (cli/commands/gates.js) because the commands are exact equivalents, after a one-line stderr notice.
'use strict';

const { run } = require('../cli/commands/gates');

const argv = process.argv.slice(2);
const sub = argv[0] || 'status';
const rest = argv.slice(1);

console.error(`shards-gates is deprecated and will be removed; use \`shards gates ${sub}\` (npx @proflandrigan/shards gates ${sub}).`);

// The legacy `force-close` with no arguments closed every open gate; the
// operator CLI requires an explicit gate id or --all, so map the bare form.
const args = [sub, ...rest];
if (sub === 'force-close' && rest.length === 0) args.push('--all');

run(args).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`shards-gates: ${err.message}`); process.exitCode = 1; },
);
