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
const { loadOrCreateConfig, CONFIG_FILENAME } = require('./config');

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

// Minimum gap between session-index activity bumps for one session key.
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

function createServer({ root, sessionKey, ancestry, env, host, leaseSweepMs, activityThrottleMs, now } = {}) {
  root = path.resolve(root || resolveRoot());
  const registry = new Registry(loadTools());
  let cached = null; let cachedSig = null;
  const configSig = () => {
    try { const st = fs.statSync(path.join(root, CONFIG_FILENAME)); return `${st.mtimeMs}:${st.size}`; } catch (_) { return null; }
  };
  // Lazy; reloaded whenever shards.config.yaml's mtime or size changes, so edits apply on the next
  // tool call. A ConfigError propagates to the handler (never cached, so a fix is picked up too).
  const getConfig = () => {
    const sig = configSig();
    if (cached && sig !== null && sig === cachedSig) return cached;
    cached = null; cachedSig = null;
    const c = loadOrCreateConfig(root);
    cached = c; cachedSig = configSig();
    return c;
  };
  // Session index (docs/sessions.md): the runtime registers each session it serves so
  // sessions_list / sessions_resume work without Studio, and keeps bumping its activity on tool
  // calls (throttled per key) so a long-lived session is not swept as abandoned by another
  // process's startup sweep; a row swept anyway goes back to active. Best effort.
  const touchEveryMs = Number.isFinite(activityThrottleMs) && activityThrottleMs >= 0 ? activityThrottleMs : ACTIVITY_THROTTLE_MS;
  const clock = typeof now === 'function' ? now : Date.now;
  const lastTouch = new Map();
  const registerSession = (key, hostName) => {
    if (!key) return;
    const t = clock();
    const prev = lastTouch.get(key);
    if (prev !== undefined && t - prev < touchEveryMs) return;
    lastTouch.set(key, t);
    try { require('./sessions/ops').registerSession(root, key, hostName); } catch (e) { process.stderr.write(`shards-mcp session index: ${e.message}\n`); }
  };
  try { require('./sessions/ops').sweepStale(root); } catch (e) { process.stderr.write(`shards-mcp session sweep: ${e.message}\n`); }
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
    resolveSession = () => { registerSession(sessionKey, host); return { state: storeFor(sessionKey), sessionKey, sessionSource: 'explicit', host }; };
  } else {
    correlator = createCorrelator({ root, env: env || process.env, ancestry, host });
    resolveSession = () => {
      const r = correlator.resolve();
      registerSession(r.key, r.host || host);
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
    server, registry, root, correlator, sweeper, getConfig,
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
