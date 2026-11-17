#!/usr/bin/env node
// shards-sessions: DEPRECATED alias for `shards sessions` (E10.5). The v1 INDEX.json implementation was
// removed; list|show|resume|end forward to the v2 CLI (cli/commands/sessions.js) after a stderr notice.
// v1-only flags (--project, --agent) are rejected by the v2 CLI with exit 2.
'use strict';

const { run } = require('../cli/commands/sessions');

const argv = process.argv.slice(2);
const sub = argv[0] || 'list';
console.error(`shards-sessions is deprecated and will be removed; use \`shards sessions ${sub}\` (npx @proflandrigan/shards sessions ${sub}).`);

run(argv.length ? argv : [sub]).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`shards-sessions: ${err.message}`); process.exitCode = 1; },
);
