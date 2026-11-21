'use strict';
// Tier 2 (E11.4): gate_advance is honoured only when the host showed the user a permission
// prompt for THIS call. The PreToolUse shim records each gate call at call time in
// <session>/hooks.json gateCalls ({tool, permission_mode, ts, host, decision, consumed?}).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StateStore, atomicWrite } = require('../state/store');

// Live check by the captain decides whether PreToolUse `ask` overrides allow rules (CC-6).
// Conservative default: an allow rule covering the tool refuses the call.
const ASK_OVERRIDES_ALLOW = false;
const MAX_AGE_MS = 120000;
const SUPERVISED_MODES = ['default', 'plan'];
const CODEX_TEXT = 'gate_advance is unavailable on Codex; use tier 1 (form) or tier 3 (reply in chat then gate_confirm).';
const GUIDE = 'Use tier 1 (the confirmation form) or tier 3 (the user replies in chat, then call gate_confirm).';

function globRe(rule) { return new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); }

function ruleCovers(rule, toolNames) {
  if (typeof rule !== 'string') return false;
  const r = rule.trim().replace(/\(\s*\)$/, '').replace(/\(\*\)$/, '');
  if (!r.startsWith('mcp__')) return false;
  const re = globRe(r);
  return toolNames.some((n) => n === r || re.test(n) || n.startsWith(`${r}__`));
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

// roots: {root, home} (home defaults to os.homedir()). Returns [{file, rule}] of covering allow rules.
function allowRuleCoversTool(roots, toolNames) {
  const r = roots || {};
  const names = (Array.isArray(toolNames) ? toolNames : [toolNames]).filter(Boolean);
  const home = r.home || os.homedir();
  const files = [];
  if (r.root) files.push(path.join(r.root, '.claude', 'settings.json'), path.join(r.root, '.claude', 'settings.local.json'));
  files.push(path.join(home, '.claude', 'settings.json'));
  const hits = [];
  for (const file of files) {
    const j = readJson(file);
    const allow = j && j.permissions && Array.isArray(j.permissions.allow) ? j.permissions.allow : [];
    for (const rule of allow) if (ruleCovers(rule, names)) hits.push({ file, rule });
  }
  return hits;
}

function lastPromptMode(session) {
  try {
    const f = path.join(new StateStore(session.root, session.sessionKey).sessionDir, 'prompts.jsonl');
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { const o = JSON.parse(lines[i]); return o.permission_mode === undefined ? undefined : o.permission_mode; } catch (_) { /* skip */ }
    }
  } catch (_) { /* none */ }
  return undefined;
}

const refuse = (reason) => ({ ok: false, reason: `${reason} ${GUIDE}` });

async function verifySupervisedCall(session, { tool = 'gate_advance', host, settingsRoots, now } = {}) {
  if (host === 'codex') return { ok: false, reason: CODEX_TEXT };
  const store = session.state || new StateStore(session.root, session.sessionKey);
  const nowMs = now !== undefined ? now : Date.now();
  const suffix = `__${tool}`;
  return store.withLock(() => {
    const file = store.file('hooks');
    const hooks = store.read('hooks');
    const calls = Array.isArray(hooks.gateCalls) ? hooks.gateCalls : [];
    let idx = -1;
    for (let i = calls.length - 1; i >= 0; i--) {
      const t = calls[i] && calls[i].tool;
      if (typeof t === 'string' && (t === tool || t.endsWith(suffix))) { idx = i; break; }
    }
    if (idx < 0) return refuse(`${tool} refused: no host permission prompt was recorded for this call.`);
    const rec = calls[idx];
    if (rec.host === 'codex') return { ok: false, reason: CODEX_TEXT };
    if (rec.consumed) return refuse(`${tool} refused: the latest host prompt was already used.`);
    const ts = Date.parse(rec.ts);
    if (!Number.isFinite(ts) || nowMs - ts > MAX_AGE_MS || ts - nowMs > MAX_AGE_MS) return refuse(`${tool} refused: the recorded host prompt is stale.`);
    if (!SUPERVISED_MODES.includes(rec.permission_mode)) return refuse(`${tool} refused: permission mode ${JSON.stringify(rec.permission_mode || null)} is unsupervised, so the host prompt cannot count as a human decision.`);
    if (rec.decision !== 'ask') return refuse(`${tool} refused: the host was not forced to ask the user for this call.`);
    const pm = lastPromptMode(session);
    if (pm !== undefined && pm !== null && !SUPERVISED_MODES.includes(pm)) return refuse(`${tool} refused: the session permission mode (${pm}) is unsupervised.`);
    if (!ASK_OVERRIDES_ALLOW) {
      const names = [rec.tool, `mcp__plugin_shards_shards__${tool}`, `mcp__shards__${tool}`];
      const hits = allowRuleCoversTool(settingsRoots || { root: session.root }, names);
      if (hits.length) return refuse(`${tool} refused: an allow rule (${hits[0].rule} in ${hits[0].file}) may let this call skip the prompt.`);
    }
    const next = calls.map((c, i) => (i === idx ? { ...c, consumed: true } : c));
    const last = hooks.lastGateCall && hooks.lastGateCall.ts === rec.ts && hooks.lastGateCall.tool === rec.tool ? { ...hooks.lastGateCall, consumed: true } : hooks.lastGateCall;
    atomicWrite(file, JSON.stringify({ ...hooks, gateCalls: next, ...(last ? { lastGateCall: last } : {}) }, null, 2));
    const proof = { tier: 'host-prompt', level: 2, ts: new Date(nowMs).toISOString(), permission_mode: rec.permission_mode, hook_ts: rec.ts };
    if (rec.tool_use_id) proof.tool_use_id = rec.tool_use_id;
    return { ok: true, proof };
  });
}

module.exports = { verifySupervisedCall, allowRuleCoversTool, ASK_OVERRIDES_ALLOW, CODEX_TEXT, SUPERVISED_MODES, MAX_AGE_MS };
