#!/usr/bin/env node
'use strict';
// Tiny MCP stdio client: node mcp-smoke-client.js <server-bin> <project-root> [--sdk-from dir]
// Spawns the server with SHARDS_PROJECT_ROOT, runs initialize + tools/list, asserts activate and gate_request.
const path = require('path');
const [bin, projectRoot] = process.argv.slice(2);
const si = process.argv.indexOf('--sdk-from');
const base = si > -1 ? path.resolve(process.argv[si + 1]) : process.cwd();
const sdk = (p) => require(require.resolve(p, { paths: [base, __dirname] }));

(async () => {
  const { Client } = sdk('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = sdk('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({
    command: bin, args: [],
    env: { ...process.env, SHARDS_PROJECT_ROOT: path.resolve(projectRoot) },
  });
  const client = new Client({ name: 'shards-smoke', version: '0.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log('tools: ' + names.join(', '));
  await client.close();
  const missing = ['activate', 'gate_request'].filter((n) => !names.includes(n));
  if (missing.length) { console.error('missing tools: ' + missing.join(', ')); process.exit(1); }
  console.log('load_phase: ' + (names.includes('load_phase') ? 'present' : 'not present yet'));
  process.exit(0);
})().catch((e) => { console.error('smoke failed: ' + (e && e.stack || e)); process.exit(1); });
