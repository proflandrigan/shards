'use strict';
// External-write guardrails (E6.11). The runtime never writes externally (D4); the AGENT calls the host's
// MCP tools. What the runtime CAN do is decide, from the PreToolUse hook, whether such a call may proceed:
//   1. Only MCP tools declared as write tools are policed: a binding's `write_tools` frontmatter (for bindings
//      configured under `jobs`) plus `guardrails.write_tools` in shards.config.yaml.
//   2. A write must carry a `[shards-gate:<id>]` marker (binding principle 6) naming a CONFIRMED gate of the
//      session. A missing marker, an unknown gate or a gate that is not confirmed is NOT allowed outright:
//      the caller turns it into an explicit-confirmation prompt (Claude `ask`) or a deny (Codex cannot ask).
//   3. Raw query results (large tabular dumps) are refused unless `guardrails.allow_raw_data: true`.
// Pure decision logic here; the hook (hooks/lib/enforce.js) maps the outcome to the host.
const fs = require('fs');
const path = require('path');

const MARKER_RE = /\[shards-gate:([A-Za-z0-9][A-Za-z0-9._-]*)\]/g;
const RAW_ROW_THRESHOLD = 25;

function globToRe(p) {
  return new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

// A pattern is a full MCP tool name (mcp__server__tool), or a bare tool name that matches the tail of any
// server's tool (so one entry works for every host/packaging prefix). `*` is a wildcard.
function matchesTool(toolName, pattern) {
  if (typeof toolName !== 'string' || typeof pattern !== 'string' || !pattern) return false;
  const re = globToRe(pattern);
  if (re.test(toolName)) return true;
  return toolName.startsWith('mcp__') && re.test(toolName.split('__').slice(2).join('__'));
}

function isShardsTool(toolName) { return /^mcp__.*shards.*__/i.test(toolName || ''); }

// Read-only view of the policy: never creates shards.config.yaml. Never throws.
function loadPolicy(root, { bindingsDir } = {}) {
  const pol = { writeTools: [], allowRawData: false };
  let cfg = {};
  try {
    const text = fs.readFileSync(path.join(root, 'shards.config.yaml'), 'utf8');
    const parsed = require('yaml').parse(text);
    if (parsed && typeof parsed === 'object') cfg = parsed;
  } catch (_) { /* no config: git-only defaults, nothing external */ }
  const g = cfg.guardrails && typeof cfg.guardrails === 'object' ? cfg.guardrails : {};
  if (Array.isArray(g.write_tools)) for (const t of g.write_tools) if (typeof t === 'string') pol.writeTools.push(t);
  pol.allowRawData = g.allow_raw_data === true;
  const names = new Set();
  const jobs = cfg.jobs && typeof cfg.jobs === 'object' ? cfg.jobs : {};
  for (const v of Object.values(jobs)) {
    const n = typeof v === 'string' ? v : (v && v.binding);
    if (typeof n === 'string' && n !== 'git') names.add(n);
  }
  if (names.size) {
    const { loadBinding } = require('../config/bindings');
    for (const n of names) {
      try {
        const b = bindingsDir ? loadBinding(n, bindingsDir) : loadBinding(n);
        for (const t of b.write_tools || []) pol.writeTools.push(t);
      } catch (_) { /* unknown binding: doctor reports it */ }
    }
  }
  return pol;
}

function isWriteTool(policy, toolName) {
  return policy.writeTools.some((p) => matchesTool(toolName, p));
}

function payloadText(input) {
  try { return typeof input === 'string' ? input : JSON.stringify(input) || ''; } catch (_) { return ''; }
}

// Heuristic for raw query output: many markdown-table / TSV / CSV-shaped rows in one string.
function looksLikeRawData(input, threshold = RAW_ROW_THRESHOLD) {
  const strings = [];
  (function walk(v) {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(input);
  for (const s of strings) {
    let table = 0; let tsv = 0; const csv = new Map();
    for (const line of s.split(/\r?\n/)) {
      if (/^\s*\|.*\|\s*$/.test(line)) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table++; }
      else if (/\t.*\t/.test(line)) tsv++;
      else {
        const c = (line.match(/,/g) || []).length;
        if (c >= 2) csv.set(c, (csv.get(c) || 0) + 1);
      }
    }
    if (table >= threshold || tsv >= threshold || [...csv.values()].some((n) => n >= threshold)) return true;
  }
  return false;
}

// -> { allow: true, gates } | { allow: false, kind: 'raw_data'|'no_gate'|'gate_not_confirmed', reason, gates }
// gatesById: { <id>: {status} } from the session's gates.json.
function evaluateWrite({ toolInput, gatesById, policy }) {
  if (!policy.allowRawData && looksLikeRawData(toolInput)) {
    return { allow: false, kind: 'raw_data', reason: 'the payload looks like raw query results (tabular rows). Send a summary instead (counts, findings, decisions), or set guardrails.allow_raw_data: true in shards.config.yaml' };
  }
  const ids = [...new Set([...payloadText(toolInput).matchAll(MARKER_RE)].map((m) => m[1]))];
  if (!ids.length) {
    return { allow: false, kind: 'no_gate', gates: [], reason: 'no [shards-gate:<id>] marker names a confirmed gate for this content' };
  }
  const gates = gatesById || {};
  const bad = ids.filter((id) => !(gates[id] && gates[id].status === 'confirmed'));
  if (bad.length) {
    return { allow: false, kind: 'gate_not_confirmed', gates: bad, reason: `gate ${bad.join(', ')} is not confirmed (unknown, pending or changes requested)` };
  }
  return { allow: true, gates: ids };
}

module.exports = { loadPolicy, isWriteTool, isShardsTool, matchesTool, evaluateWrite, looksLikeRawData, MARKER_RE };
