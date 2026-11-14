#!/usr/bin/env node
'use strict';
// shards-mcp: stdio MCP server. NEVER write to stdout except via the transport (logs -> stderr).
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { Registry } = require('./registry');
const { loadTools } = require('./tools');
const { StateStore, provisionalSessionKey } = require('./state/store');
const { loadOrCreateConfig } = require('./config');

const VERSION = require('../package.json').version;

function resolveRoot(argv = process.argv.slice(2), env = process.env) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) return path.resolve(argv[i + 1]);
    if (argv[i].startsWith('--root=') && argv[i].length > 7) return path.resolve(argv[i].slice(7));
  }
  if (env.SHARDS_PROJECT_ROOT) return path.resolve(env.SHARDS_PROJECT_ROOT);
  return process.cwd();
}

function createServer({ root, sessionKey } = {}) {
  root = path.resolve(root || resolveRoot());
  sessionKey = sessionKey || provisionalSessionKey();
  const state = new StateStore(root, sessionKey);
  const registry = new Registry(loadTools());
  let cached;
  // Lazy + cached. A ConfigError propagates to the handler, which becomes isError.
  const getConfig = () => (cached || (cached = loadOrCreateConfig(root)));

  const server = new Server({ name: 'shards-mcp', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    registry.call(req.params.name, req.params.arguments, { root, getConfig, state, sessionKey }));
  return { server, registry, state, root, sessionKey };
}

async function main() {
  const { server } = createServer({ root: resolveRoot() });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write(`shards-mcp fatal: ${e && e.stack || e}\n`); process.exit(1); });
}

module.exports = { createServer, resolveRoot };
