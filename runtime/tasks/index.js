'use strict';
// Task manifests (E12.1): schema + semantic validation, per-session state, TASKS.md mirror.
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const YAML = require('yaml');
const manifestSchema = require('../../core/schema/tasks.schema.json');
const resultSchema = require('../../core/schema/task-result.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(manifestSchema);
const validateResultSchema = ajv.compile(resultSchema);

const STATE_NAME = 'tasks';
const DEFAULT_TTL_MS = 900000;
const SATISFIED = ['reported', 'done'];

function pathsOverlap(a, b) {
  try { return require('../leases').pathsOverlap(a, b); } catch (e) {
    if (!e || e.code !== 'MODULE_NOT_FOUND') throw e;
    const n = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    const x = n(a); const y = n(b);
    return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
  }
}

function ajvMessages(errors) {
  return (errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
}

function unsafePath(p) {
  const s = String(p).replace(/\\/g, '/');
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(s) || s.startsWith('/')) return 'absolute';
  if (s.split('/').includes('..')) return 'contains ".."';
  return null;
}

function findCycle(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, (t.depends_on || [])]));
  const state = new Map(); // 1 visiting, 2 done
  const stack = [];
  let found = null;
  const visit = (id) => {
    if (found) return;
    state.set(id, 1); stack.push(id);
    for (const d of deps.get(id) || []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) { found = [...stack.slice(stack.indexOf(d)), d]; return; }
      if (!state.get(d)) visit(d);
      if (found) return;
    }
    stack.pop(); state.set(id, 2);
  };
  for (const id of deps.keys()) { if (!state.get(id)) visit(id); if (found) break; }
  return found;
}

function ancestors(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, t.depends_on || []]));
  const memo = new Map();
  const get = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const out = new Set();
    for (const d of deps.get(id) || []) {
      if (!deps.has(d) || seen.has(d)) continue;
      out.add(d);
      for (const a of get(d, new Set([...seen, id]))) out.add(a);
    }
    memo.set(id, out);
    return out;
  };
  for (const id of deps.keys()) get(id);
  return memo;
}

function workerAgentProblem(agents, worker) {
  const a = agents.get(worker);
  if (!a) return `worker "${worker}" is not a known agent`;
  if (a.error) return `worker "${worker}" has a malformed agent.yaml`;
  const act = Array.isArray(a.activation) ? a.activation : [];
  const hasEntry = a.consult_entries && Object.prototype.hasOwnProperty.call(a.consult_entries, 'worker');
  if (!act.includes('fanout_worker') && !hasEntry) return `worker "${worker}" does not declare activation fanout_worker or consult_entries.worker`;
  return null;
}

// knownAgents: Map (loadAgents result) | array of ids | omitted (skip check).
function validateManifest(obj, { knownAgents } = {}) {
  const errors = [];
  if (!validateSchema(obj)) return { ok: false, errors: ajvMessages(validateSchema.errors) };
  const tasks = obj.tasks;
  const ids = new Set();
  for (const t of tasks) {
    if (ids.has(t.id)) errors.push(`duplicate task id "${t.id}"`);
    ids.add(t.id);
  }
  for (const t of tasks) {
    if (!t.acceptance || !String(t.acceptance.command || '').trim() || !String(t.acceptance.expected || '').trim()) {
      errors.push(`task "${t.id}": acceptance needs a non-empty command and expected result`);
    }
    for (const d of t.depends_on || []) {
      if (d === t.id) errors.push(`task "${t.id}" depends on itself`);
      else if (!ids.has(d)) errors.push(`task "${t.id}": depends_on unknown task "${d}"`);
    }
    for (const p of t.owned_paths) {
      const bad = unsafePath(p);
      if (bad) errors.push(`task "${t.id}": unsafe owned_path "${p}" (${bad}); use project-root-relative paths`);
    }
  }
  const cycle = findCycle(tasks);
  if (cycle && !(cycle.length === 2 && cycle[0] === cycle[1])) errors.push(`dependency cycle: ${cycle.join(' -> ')}`);

  if (!cycle) {
    const anc = ancestors(tasks);
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i]; const b = tasks[j];
        if (anc.get(a.id).has(b.id) || anc.get(b.id).has(a.id)) continue;
        for (const pa of a.owned_paths) for (const pb of b.owned_paths) {
          if (!unsafePath(pa) && !unsafePath(pb) && pathsOverlap(pa, pb)) {
            errors.push(`tasks "${a.id}" and "${b.id}" could run in parallel but own overlapping paths ("${pa}" vs "${pb}"); add depends_on or split the paths`);
          }
        }
      }
    }
  }

  const groups = new Map();
  for (const t of tasks) { const k = t.phase === undefined ? '' : String(t.phase); groups.set(k, (groups.get(k) || 0) + 1); }
  for (const t of tasks) {
    if (t.delegate === 'inline') {
      const k = t.phase === undefined ? '' : String(t.phase);
      if (groups.get(k) > 2) errors.push(`task "${t.id}": delegate "inline" is only allowed when its phase has <= 2 tasks (phase ${k === '' ? '(none)' : k} has ${groups.get(k)})`);
    }
  }

  if (knownAgents) {
    const agents = knownAgents instanceof Map ? knownAgents : null;
    const idList = Array.isArray(knownAgents) ? knownAgents : null;
    for (const t of tasks) {
      if (t.delegate === 'inline') continue;
      if (agents) { const p = workerAgentProblem(agents, t.worker); if (p) errors.push(`task "${t.id}": ${p}`); }
      else if (idList && !idList.includes(t.worker)) errors.push(`task "${t.id}": worker "${t.worker}" is not a known agent`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateResult(result) {
  const ok = validateResultSchema(result);
  return { ok, errors: ok ? [] : ajvMessages(validateResultSchema.errors) };
}

function readTasksState(store) {
  const s = store.read(STATE_NAME) || {};
  return { manifest: s.manifest || null, path: s.path || null, tasks: s.tasks || {}, drift: s.drift || null, consumed_amendments: s.consumed_amendments || [] };
}

function initialTasksState(manifest, manifestPath) {
  const tasks = {};
  const now = new Date().toISOString();
  for (const t of manifest.tasks) tasks[t.id] = { status: 'pending', lease_id: null, attempts: 0, result: null, paused_reason: null, updated_at: now };
  return { manifest, path: manifestPath, tasks };
}

function dependsOf(t) { return t.depends_on || []; }

function readyIds(st) {
  if (!st.manifest) return [];
  return st.manifest.tasks.filter((t) => {
    const s = st.tasks[t.id];
    return s && s.status === 'pending' && !s.paused_reason && dependsOf(t).every((d) => st.tasks[d] && SATISFIED.includes(st.tasks[d].status));
  }).map((t) => t.id);
}

function countsOf(st) {
  const c = { pending: 0, dispatched: 0, reported: 0, done: 0, failed: 0, blocked: 0, paused: 0 };
  for (const s of Object.values(st.tasks)) c[s.status] = (c[s.status] || 0) + 1;
  return c;
}

// Replaceable hook (a later worker adds plan-amendment refusal). Throw to refuse.
const drift = require('./drift');
const hooks = {
  assertMayReplace: drift.assertMayReplace,
  onDeviations: drift.onDeviations,
};
function assertMayReplace(...a) { return hooks.assertMayReplace(...a); }
function onDeviations(...a) { return hooks.onDeviations(...a); }
function setHooks(h) { Object.assign(hooks, h); }

function mirrorTasksMd(ctx, st) {
  let cfg = null;
  try { cfg = ctx.getConfig ? ctx.getConfig() : null; } catch (_) { cfg = null; }
  const job = (cfg && cfg.config && cfg.config.jobs && cfg.config.jobs.tasks) || { binding: 'git', options: { path: 'TASKS.md' } };
  const binding = typeof job === 'string' ? job : job.binding;
  if (binding !== 'git') return { mirrored: false, path: null, note: `tasks binding is "${binding}": TASKS.md mirror skipped; sync the checklist via the host tool.` };
  const rel = (job.options && job.options.path) || 'TASKS.md';
  const rootAbs = path.resolve(ctx.root);
  const abs = path.resolve(rootAbs, rel);
  const r = path.relative(rootAbs, abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`tasks mirror path escapes project root: ${rel}`);
  const lines = [`<!-- generated from ${st.path || 'tasks.yaml'} by shards; edit tasks.yaml, not this file -->`, ''];
  for (const t of st.manifest.tasks) {
    const s = st.tasks[t.id] || { status: 'pending' };
    const box = s.status === 'done' ? 'x' : ' ';
    const suffix = s.status === 'done' ? '' : ` (${s.status}${s.paused_reason ? `: ${s.paused_reason}` : ''})`;
    lines.push(s.status === 'done' ? `- [x] ${t.id} (${t.worker}): ${t.goal}` : `- [${box}] ${t.id} (${t.worker}): ${t.goal}${suffix}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${lines.join('\n')}\n`);
  return { mirrored: true, path: r.split(path.sep).join('/') };
}

function parseYaml(text) { return YAML.parse(text); }
function stringifyYaml(obj) { return YAML.stringify(obj); }

module.exports = {
  validateManifest, validateResult, readTasksState, initialTasksState, readyIds, countsOf,
  assertMayReplace, onDeviations, setHooks, mirrorTasksMd, parseYaml, stringifyYaml,
  STATE_NAME, DEFAULT_TTL_MS, SATISFIED, manifestSchema, resultSchema,
};
