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

const crypto = require('crypto');
const STATE_NAME = 'tasks';

// Scope = project-root-relative workstream dir (PM-mode leads). Returns null when unscoped.
function normalizeScope(scope) {
  if (scope === undefined || scope === null || scope === '') return null;
  if (typeof scope !== 'string') throw new Error('scope must be a string (a project-root-relative directory)');
  const bad = (why) => new Error(`scope "${scope}" is invalid (${why}); use a project-root-relative directory such as "shards/<workstream>"`);
  const s = scope.replace(/\\/g, '/');
  if (path.isAbsolute(scope) || /^[A-Za-z]:/.test(s) || s.startsWith('/')) throw bad('absolute');
  if (s.split('/').includes('..')) throw bad('contains ".."');
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  if (!n || n === '.') throw bad('empty or the project root');
  return n;
}

// StateStore names must match /^[a-z]+(-[a-z]+)*$/ (no digits), so encode a hash of the scope as letters a-p.
function stateNameFor(scope) {
  const n = normalizeScope(scope);
  if (!n) return STATE_NAME;
  const h = crypto.createHash('sha1').update(n).digest('hex').slice(0, 16);
  return `${STATE_NAME}-scope-${h.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)))}`;
}

const SCOPE_DESC = 'Pass the same `scope` (project-root-relative workstream dir, e.g. "shards/churn_model") on every task_* call when you are a workstream lead under PM mode (the lead contract gives it), or when your instructions give you a scope because another lead\'s manifest is already registered in this session (an Analytics Engineer after a Data Modeller handoff, Syn Free Form); omit otherwise. Each scope has its own manifest, task states, drift state and TASKS.md (<scope>/TASKS.md).';
const SCOPE_PROP = { type: 'string', minLength: 1, description: SCOPE_DESC };
const DEFAULT_TTL_MS = 900000;
const SATISFIED = ['done'];
const MAX_ATTEMPTS = 3; // 1 dispatch + 2 retries

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
    if (t.acceptance && t.acceptance.cwd) {
      const bad = unsafePath(t.acceptance.cwd);
      if (bad) errors.push(`task "${t.id}": unsafe acceptance.cwd "${t.acceptance.cwd}" (${bad}); use a project-root-relative directory`);
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

function readTasksState(store, scope) {
  const s = store.read(stateNameFor(scope)) || {};
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

function mirrorTasksMd(ctx, st, scope) {
  const sc = normalizeScope(scope);
  let cfg = null;
  try { cfg = ctx.getConfig ? ctx.getConfig() : null; } catch (_) { cfg = null; }
  const job = (cfg && cfg.config && cfg.config.jobs && cfg.config.jobs.tasks) || { binding: 'git', options: { path: 'TASKS.md' } };
  const binding = typeof job === 'string' ? job : job.binding;
  if (binding !== 'git') return { mirrored: false, path: null, note: `tasks binding is "${binding}": TASKS.md mirror skipped; sync the checklist via the host tool.` };
  const rel = sc ? `${sc}/TASKS.md` : ((job.options && job.options.path) || 'TASKS.md');
  const rootAbs = path.resolve(ctx.root);
  const abs = path.resolve(rootAbs, rel);
  const r = path.relative(rootAbs, abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`tasks mirror path escapes project root: ${rel}`);
  const lines = [`<!-- generated from ${st.path || 'tasks.yaml'} by shards; edit tasks.yaml, not this file -->`, ''];
  for (const t of st.manifest.tasks) {
    const s = st.tasks[t.id] || { status: 'pending' };
    const box = s.status === 'done' ? 'x' : ' ';
    const suffix = s.status === 'done' ? '' : ` (${s.status}${s.paused_reason ? `: ${s.paused_reason}` : ''})`;
    const ar = s.status === 'done' && s.ar_outcome ? ` (AR ${s.ar_outcome.metric_outcome}: ${s.ar_outcome.result})` : '';
    lines.push(s.status === 'done' ? `- [x] ${t.id} (${t.worker}): ${t.goal}${ar}` : `- [${box}] ${t.id} (${t.worker}): ${t.goal}${suffix}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${lines.join('\n')}\n`);
  return { mirrored: true, path: r.split(path.sep).join('/') };
}

// Append a row to the last `## Validation` section's `### Evidence` table of <output_dir>/project-specs.md.
function appendEvidence(ctx, st, { check, expected, observed, pass, notes }) {
  const cell = (v) => String(v === undefined || v === null ? '' : v).replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim();
  const row = `| ${cell(check)} | ${cell(expected)} | ${cell(observed)} | ${pass ? '\u2713' : '\u2717'} | ${cell(notes)} |`;
  const header = '| Check | Expected | Observed | Pass/Fail | Notes |\n|---|---|---|---|---|';
  const rootAbs = path.resolve(ctx.root);
  const dir = path.dirname(path.resolve(rootAbs, st.path || 'tasks.yaml'));
  const file = path.join(dir, 'project-specs.md');
  fs.mkdirSync(dir, { recursive: true });
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.split('\n');
  let vi = -1;
  lines.forEach((l, i) => { if (/^## Validation\s*$/.test(l)) vi = i; });
  if (vi < 0) {
    text = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}## Validation\n\n### Evidence\n\n${header}\n${row}\n`;
    fs.writeFileSync(file, text);
    return path.relative(rootAbs, file).split(path.sep).join('/');
  }
  let end = lines.length;
  for (let i = vi + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  let ei = -1;
  for (let i = vi + 1; i < end; i++) if (/^### Evidence\s*$/.test(lines[i])) ei = i;
  if (ei < 0) {
    let at = end; while (at > vi + 1 && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, '', '### Evidence', '', ...header.split('\n'), row);
  } else {
    let secEnd = end;
    for (let i = ei + 1; i < end; i++) if (/^#{1,3} /.test(lines[i])) { secEnd = i; break; }
    let last = -1;
    for (let i = ei + 1; i < secEnd; i++) if (/^\s*\|/.test(lines[i])) last = i;
    if (last < 0) { let at = ei + 1; lines.splice(at, 0, '', ...header.split('\n'), row); }
    else lines.splice(last + 1, 0, row);
  }
  fs.writeFileSync(file, lines.join('\n'));
  return path.relative(rootAbs, file).split(path.sep).join('/');
}

function parseYaml(text) { return YAML.parse(text); }
function stringifyYaml(obj) { return YAML.stringify(obj); }

module.exports = {
  validateManifest, validateResult, readTasksState, initialTasksState, readyIds, countsOf,
  assertMayReplace, onDeviations, setHooks, mirrorTasksMd, appendEvidence, MAX_ATTEMPTS, parseYaml, stringifyYaml,
  STATE_NAME, normalizeScope, stateNameFor, SCOPE_PROP, SCOPE_DESC, DEFAULT_TTL_MS, SATISFIED, manifestSchema, resultSchema,
};
