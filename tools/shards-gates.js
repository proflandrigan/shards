#!/usr/bin/env node
// shards-gates — alias for `shards gates` (operator CLI lives in cli/commands/gates.js).
'use strict';

const { run } = require('../cli/commands/gates');

const argv = process.argv.slice(2);
const sub = argv[0] || 'status';
const rest = argv.slice(1);

// The legacy `force-close` with no arguments closed every open gate; the
// operator CLI requires an explicit gate id or --all, so map the bare form.
const args = [sub, ...rest];
if (sub === 'force-close' && rest.length === 0) args.push('--all');

run(args).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`shards-gates: ${err.message}`); process.exitCode = 1; },
);
