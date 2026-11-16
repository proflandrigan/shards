#!/usr/bin/env node
'use strict';
// shards-mcp: stdio MCP server. NEVER write to stdout except via the transport (logs -> stderr).
const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { Registry } = require('./registry');
const { loadTools } = require('./tools');
const { StateStore } = require('./state/store');
const { createCorrelator } = require('./session/correlate');
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

// Lease sweep (E5.9): periodically expire stale leases for every session dir that has leases state.
// Interval is unref()'d so it never keeps the process alive; ms<=0 disables. Returns {sweep, stop}.
function startLeaseSweep({ root, ms, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const leases = require('./leases');
  const dir = path.join(root, '.shards', 'state', 'sessions');
  const sweep = async () => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return []; }
    const out = [];
    for (const k of names) {
      try {
        if (!fs.existsSync(path.join(dir, k, 'leases.json'))) continue;
        out.push(...await leases.expireStale({ root, sessionKey: k }));
      } catch (e) { process.stderr.write(`shards-mcp lease sweep ${k}: ${e.message}\n`); }
    }
    return out;
  };
  let t = null;
  if (Number.isFinite(ms) && ms > 0) {
    t = setIntervalFn(() => { sweep(); }, ms);
    if (t && typeof t.unref === 'function') t.unref();
  }
  return { sweep, stop() { if (t) { clearIntervalFn(t); t = null; } } };
}

function createServer({ root, sessionKey, ancestry, env, host, leaseSweepMs } = {}) {
  root = path.resolve(root || resolveRoot());
  const registry = new Registry(loadTools());
  let cached;
  // Lazy + cached. A ConfigError propagates to the handler, which becomes isError.
  const getConfig = () => (cached || (cached = loadOrCreateConfig(root)));
  const stores = new Map();
  const storeFor = (key) => {
    let s = stores.get(key);
    if (!s) { s = new StateStore(root, key); stores.set(key, s); }
    return s;
  };

  let correlator = null;
  let resolveSession;
  if (sessionKey) {
    // Explicit fixed key: behave exactly as before.
    resolveSession = () => ({ state: storeFor(sessionKey), sessionKey, sessionSource: 'explicit', host });
  } else {
    correlator = createCorrelator({ root, env: env || process.env, ancestry, host });
    resolveSession = () => {
      const r = correlator.resolve();
      return { state: storeFor(r.key), sessionKey: r.key, sessionSource: r.source, host: r.host || host };
    };
  }

  const server = new Server({ name: 'shards-mcp', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    registry.call(req.params.name, req.params.arguments, {
      root, getConfig, resolveSession,
      elicit: (params, opts) => server.elicitInput(params, opts),
      clientCapabilities: () => server.getClientCapabilities(),
    }));
  const envMs = (env || process.env).SHARDS_LEASE_SWEEP_MS;
  const ms = leaseSweepMs !== undefined ? leaseSweepMs : (envMs !== undefined && envMs !== '' ? Number(envMs) : 30000);
  const sweeper = startLeaseSweep({ root, ms });
  server.onclose = () => sweeper.stop();
  return {
    server, registry, root, correlator, sweeper,
    get state() { return resolveSession().state; },
    get sessionKey() { return resolveSession().sessionKey; },
  };
}

async function main() {
  const { server } = createServer({ root: resolveRoot() });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write(`shards-mcp fatal: ${e && e.stack || e}\n`); process.exit(1); });
}

module.exports = { createServer, resolveRoot, startLeaseSweep };
