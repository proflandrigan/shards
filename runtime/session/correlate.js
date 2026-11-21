'use strict';
// E2.11 session correlation. Maps this MCP process to a host session key using the
// SessionStart handshake files written by hooks/session-start.js:
//   <root>/.shards/state/handshake/<hook-pid>.json
//   {session_id, source, cwd, ts, pid, ppid_chain:[parent, grandparent, ...]}
// A handshake matches when our parent (the host) is the hook's parent or grandparent; among
// matches the newest ts wins (a /clear re-keys the session under the same host process). Docs: docs/compat.md, and
// docs/gate-audit-2026-06.md Bug 1 (cross-session gate interference).
const fs = require('fs');
const path = require('path');
const { toSessionKey, detectHost, argvHost, HOSTS } = require('../../hooks/lib/host');
const { ppidChain } = require('../../hooks/lib/common');
const { provisionalSessionKey } = require('../state/store');

const STALE_MS = 24 * 3600 * 1000;

class SessionCorrelationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionCorrelationError';
    this.code = 'SESSION_FALLBACK_REFUSED';
  }
}

// Fallback policy when no handshake matches, keyed by detected host (see docs/compat.md).
const FALLBACK_POLICY = {
  'claude-code': { allowProcessKey: true, reason: 'docs/compat.md: Claude Code runs one stdio MCP process per session, so a per-process key is a safe session key.' },
  codex: { allowProcessKey: false, reason: 'docs/compat.md: a Codex app-server may share one MCP process across threads, so a per-process key could merge sessions.' },
  t3: { allowProcessKey: false, reason: 'docs/compat.md (T3-4 UNKNOWN): T3 may share one MCP process across threads, so a per-process key is refused.' },
  unknown: { allowProcessKey: false, reason: 'docs/compat.md: host not recognised, so one-process-per-session cannot be assumed.' },
};

// Hook point: host-provided session id env var, keyed by host. docs/compat.md documents
// none today, so this is intentionally empty. If one is documented, add e.g. {codex: 'VAR'}.
const HOST_SESSION_ENV = {};

// The MCP server has no hook payload, so this is marker- and env-based. Codex 0.169 starts a config.toml MCP server
// with a scrubbed env (HOME, LANG, LOGNAME, PATH, SHELL, TERM, TMPDIR, USER only; live-verified), so env sniffing
// alone saw claude-code there. The `shards install --codex` entry therefore passes `--host codex` in args and
// SHARDS_HOST=codex in env; either marker wins over env sniffing.
function detectHostName(env = process.env, argv = process.argv.slice(2)) {
  const a = argvHost(argv);
  if (a) return a;
  if (env.SHARDS_HOST && Object.prototype.hasOwnProperty.call(FALLBACK_POLICY, env.SHARDS_HOST) && env.SHARDS_HOST !== 'unknown') return env.SHARDS_HOST;
  return detectHost(null, env, []) === HOSTS.CODEX ? 'codex' : 'claude-code';
}

function handshakeDir(root) { return path.join(root, '.shards', 'state', 'handshake'); }

function dirSignature(root) {
  const dir = handshakeDir(root);
  let names;
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch (_) { return ''; }
  return names.map((f) => {
    try { const st = fs.statSync(path.join(dir, f)); return `${f}:${st.mtimeMs}:${st.size}`; } catch (_) { return `${f}:gone`; }
  }).join('|');
}

// readHandshakes(root, {now}) -> [{key, session_id, source, ts, tsMs, ppid_chain, file}] valid, non-stale only.
function readHandshakes(root, { now = Date.now } = {}) {
  const dir = handshakeDir(root);
  let names;
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (_) { return []; }
  const out = [];
  for (const f of names) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!rec || typeof rec !== 'object') continue;
      const key = toSessionKey(rec.session_id);
      if (!key) continue;
      const tsMs = Date.parse(rec.ts);
      if (!Number.isFinite(tsMs) || now() - tsMs > STALE_MS) continue;
      if (!Array.isArray(rec.ppid_chain)) continue;
      const chain = rec.ppid_chain.filter((p) => Number.isInteger(p) && p > 1);
      if (!chain.length) continue;
      out.push({ key, session_id: rec.session_id, source: rec.source, ts: rec.ts, tsMs, ppid_chain: chain, file: f });
    } catch (_) { /* unparseable: ignore */ }
  }
  return out;
}

// matchHandshake(handshakes, ancestry, {startTimeMs}) -> handshake | null.
// The shared ancestor must be the host process itself: our direct parent (ancestry[0], the host
// spawns the stdio MCP server) and the hook's parent or grandparent (ppid_chain[0] or [1]: the host
// may run the hook through a shell). A match only through a farther ancestor (a shared login shell,
// tmux, terminal) would bind this server to another session's handshake, so it is refused.
function matchHandshake(handshakes, ancestry, { startTimeMs } = {}) {
  let best = null;
  const hostPid = ancestry[0];
  if (!Number.isInteger(hostPid)) return null;
  for (const h of handshakes) {
    if (!h.ppid_chain.slice(0, 2).includes(hostPid)) continue;
    if (typeof startTimeMs === 'function') { // PID-reuse guard
      let started;
      try { started = startTimeMs(hostPid); } catch (_) { started = undefined; }
      if (Number.isFinite(started) && h.tsMs < started) continue;
    }
    if (!best || h.tsMs > best.tsMs) best = h;
  }
  return best;
}

function createCorrelator({ root, env = process.env, argv = process.argv.slice(2), ancestry, host, now = Date.now, processKey } = {}) {
  if (!root) throw new Error('createCorrelator requires a root');
  root = path.resolve(root);
  let defaultChain;
  const getAncestry = typeof ancestry === 'function' ? ancestry
    : () => (defaultChain || (defaultChain = ppidChain(process.ppid)));
  const hostName = host || detectHostName(env, argv);
  let procKey = processKey;
  let cache = null; // {sig, chainSig, result}

  function resolve() {
    const chain = getAncestry() || [];
    const chainSig = chain.join(',');
    const sig = dirSignature(root);
    if (cache && cache.sig === sig && cache.chainSig === chainSig && cache.result) return cache.result;
    const h = matchHandshake(readHandshakes(root, { now }), chain, { startTimeMs: getAncestry.startTimeMs });
    let result;
    if (h) {
      result = { key: h.key, source: 'handshake', host: hostName };
    } else {
      // HOST_SESSION_ENV hook point: none documented, nothing to read yet.
      const envVar = HOST_SESSION_ENV[hostName];
      const envId = envVar && env[envVar] ? toSessionKey(env[envVar]) : null;
      if (envId) {
        result = { key: envId, source: 'host-env', host: hostName };
      } else {
        const policy = FALLBACK_POLICY[hostName] || FALLBACK_POLICY.unknown;
        const override = env.SHARDS_ASSUME_ONE_PROCESS_PER_SESSION === '1';
        if (!policy.allowProcessKey && !override) {
          cache = null;
          throw new SessionCorrelationError(
            `Cannot determine which ${hostName} session this MCP process belongs to: no SessionStart handshake in ${handshakeDir(root)} matches this process's ancestry. ` +
            `A per-process session key is refused because ${policy.reason} ` +
            'Fix: enable the Shards SessionStart hook so it writes a handshake, or set SHARDS_ASSUME_ONE_PROCESS_PER_SESSION=1 if you know this host runs one MCP process per session.');
        }
        if (!procKey) procKey = provisionalSessionKey();
        result = { key: procKey, source: 'process', host: hostName };
      }
    }
    cache = { sig, chainSig, result };
    return result;
  }

  return { resolve, host: hostName, root };
}

module.exports = { createCorrelator, SessionCorrelationError, FALLBACK_POLICY, HOST_SESSION_ENV, readHandshakes, matchHandshake, detectHostName, STALE_MS };
