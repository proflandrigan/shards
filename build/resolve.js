'use strict';
// Validates a parsed macro against core/ and returns a normalized model, or { errors }.
// See build/MACROS.md section 3.
const fs = require('fs');
const path = require('path');
const { parseMeta, typeMeta, loadSchema } = require('./meta');

const ENTRIES = ['review', 'advise', 'service', 'final_review', 'arbiter', 'code_review', 'worker'];
const KINDS = ['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm'];
const NON_ADVANCING = new Set(['checkpoint', 'confirm']);
const TRACKS = ['quick', 'deep'];
const PHASE_RE = /^\d+(-\d+)*$/;
const NAMES = ['switch', 'consult', 'fanout', 'return', 'phase', 'protocol', 'template', 'gate', 'auto_verify',
  'record.write', 'tasks.create', 'tasks.update', 'tasks.list', 'tasks.get', 'knowledge.search', 'artifact.emit', 'delegate', 'lead', 'jira_context'];

// Derive enclosing context from a path relative to core/ (posix).
function fileContext(rel) {
  const m = /^agents\/([^/]+)\/(.*)$/.exec(rel);
  if (!m) return { agent: null, phase: null, track: null };
  const pm = /^phases(?:_(quick|deep))?\/phase-(\d+(?:-\d+)*)\.md$/.exec(m[2]);
  return { agent: m[1], phase: pm ? pm[2] : null, track: pm ? pm[1] || null : null };
}

function resolveMacro(macro, core, ctx) {
  const errors = [];
  const err = (m) => errors.push(m);
  const { name, args } = macro;
  if (!NAMES.includes(name)) return { errors: [`unknown macro '${name}'`] };
  if (macro.argError) return { errors: [`${macro.argError} in {{${name} ...}}`] };
  const { positional, named } = args;

  // generic argument checks
  const spec = SPECS[name];
  if (positional.length > spec.positional.length) err(`unexpected positional argument '${positional[spec.positional.length]}' in {{${name}}}`);
  const vals = {};
  spec.positional.forEach((p, i) => { if (positional[i] !== undefined) vals[p] = positional[i]; });
  for (const [k, v] of Object.entries(named)) {
    if (!spec.named.includes(k) && !spec.positional.includes(k)) err(`unknown argument '${k}' in {{${name}}}`);
    else vals[k] = v;
  }
  for (const r of spec.required) if (vals[r] === undefined) err(`missing required argument '${r}' in {{${name}}}`);
  if (errors.length) return { errors };

  const agentOf = (id, what) => {
    const a = core.agents.get(id);
    if (!a) { err(`unknown agent '${id}' in {{${name}}} (${what}); known: ${[...core.agents.keys()].join(', ')}`); return null; }
    return a;
  };
  const model = { macro: name };

  switch (name) {
    case 'switch': {
      const a = agentOf(vals.agent, 'agent');
      if (a && !(a.doc.activation || []).includes('switch')) err(`agent '${a.id}' does not support switch activation`);
      model.agent = vals.agent;
      break;
    }
    case 'consult':
    case 'fanout': {
      const a = agentOf(vals.agent, 'agent');
      const entry = name === 'fanout' ? vals.entry || 'worker' : vals.entry;
      if (!ENTRIES.includes(entry)) { err(`invalid entry '${entry}' in {{${name}}}; expected one of ${ENTRIES.join('|')}`); break; }
      if (name === 'fanout') {
        if (!/^(\d*[1-9]\d*|[a-z0-9_-]+(,[a-z0-9_-]+)*)$/.test(vals.slices)) err(`invalid value for slices '${vals.slices}': expected positive integer or comma list`);
      }
      if (a) {
        const need = name === 'fanout' ? 'fanout_worker' : entry === 'worker' ? ['consult', 'fanout_worker'] : 'consult';
        const ok = (Array.isArray(need) ? need : [need]).some((x) => (a.doc.activation || []).includes(x));
        if (name === 'fanout' && !(a.doc.activation || []).includes('fanout_worker')) err(`agent '${a.id}' does not support fanout_worker activation`);
        else if (name === 'consult' && !ok) err(`agent '${a.id}' does not support consult activation`);
        const rel = (a.doc.consult_entries || {})[entry];
        if (!rel) err(`unknown entry '${entry}' for agent '${a.id}'; its consult_entries: ${Object.keys(a.doc.consult_entries || {}).join(', ') || '(none)'}`);
        else {
          model.file = rel;
          if (!fs.existsSync(path.join(a.dir, rel)) && !(entry === 'worker' && rel === 'modes/worker.md')) err(`entry '${entry}' file '${rel}' for agent '${a.id}' does not exist`);
        }
      }
      Object.assign(model, { agent: vals.agent, entry, slices: vals.slices, task: vals.task });
      break;
    }
    case 'lead': {
      const a = agentOf(vals.agent, 'agent');
      if (a) {
        const act = a.doc.activation || [];
        if (!act.includes('consult')) err(`agent '${a.id}' does not support consult activation (required to run as a workstream lead)`);
        if (!act.includes('fanout_worker')) err(`agent '${a.id}' does not support fanout_worker activation (a lead needs its own workers)`);
        if (!(a.doc.consult_entries || {}).worker) err(`agent '${a.id}' has no worker consult entry; a lead needs one to dispatch workers (its consult_entries: ${Object.keys(a.doc.consult_entries || {}).join(', ') || '(none)'})`);
      }
      Object.assign(model, { agent: vals.agent, task: vals.task });
      break;
    }
    case 'delegate': {
      if (vals.tasks !== undefined && !vals.tasks.trim()) err('tasks must be a non-empty path in {{delegate}}');
      if (vals.max_parallel !== undefined && !/^[1-9]\d*$/.test(vals.max_parallel)) err(`invalid value for max_parallel '${vals.max_parallel}': expected positive integer`);
      if (vals.mode !== undefined && !['parallel', 'sequential', 'inline'].includes(vals.mode)) err(`invalid value for mode '${vals.mode}': expected parallel|sequential|inline`);
      Object.assign(model, { tasks: vals.tasks, max_parallel: vals.max_parallel, mode: vals.mode });
      break;
    }
    case 'return':
      if (vals.to !== undefined) agentOf(vals.to, 'to');
      model.to = vals.to;
      break;
    case 'phase': {
      if (!PHASE_RE.test(vals.n)) { err(`invalid phase number '${vals.n}'`); break; }
      if (vals.track && !TRACKS.includes(vals.track)) { err(`invalid track '${vals.track}'; expected quick|deep`); break; }
      const id = vals.agent || ctx.agent;
      if (!id) { err('{{phase}} outside an agent file requires agent=<agent>'); break; }
      const a = agentOf(id, 'agent');
      if (!a) break;
      const track = vals.track || (vals.agent && vals.agent !== ctx.agent ? null : ctx.track);
      const dual = fs.existsSync(path.join(a.dir, 'phases_quick')) || fs.existsSync(path.join(a.dir, 'phases_deep'));
      let dirName;
      if (dual) {
        if (!track) { err(`agent '${id}' is dual-track; {{phase ${vals.n}}} requires track=quick|deep`); break; }
        dirName = `phases_${track}`;
      } else {
        if (vals.track) { err(`agent '${id}' is single-track; track= is not allowed`); break; }
        dirName = 'phases';
      }
      if (!fs.existsSync(path.join(a.dir, dirName, `phase-${vals.n}.md`))) { err(`unknown phase '${vals.n}' for agent '${id}' (no ${dirName}/phase-${vals.n}.md)`); break; }
      Object.assign(model, { agent: id, n: vals.n, track: dual ? track : null, file: `${dirName}/phase-${vals.n}.md` });
      break;
    }
    case 'protocol': {
      const file = `${vals.name}.md`;
      if (!core.protocols.has(file)) err(`unknown protocol '${vals.name}'; known: ${[...core.protocols].map((f) => f.replace(/\.md$/, '')).join(', ')}`);
      model.name = vals.name; model.file = file;
      break;
    }
    case 'template': {
      const file = core.templates.has(vals.name) ? vals.name : `${vals.name}.md`;
      if (!core.templates.has(file)) err(`unknown template '${vals.name}'; known: ${[...core.templates].join(', ')}`);
      model.name = vals.name; model.file = file;
      break;
    }
    case 'gate': {
      if (!KINDS.includes(vals.kind)) { err(`invalid gate kind '${vals.kind}'; expected one of ${KINDS.join('|')}`); break; }
      if (vals.track && !TRACKS.includes(vals.track)) { err(`invalid track '${vals.track}'`); break; }
      if (vals.phase !== undefined && !PHASE_RE.test(vals.phase)) { err(`invalid phase '${vals.phase}'`); break; }
      if (vals.name !== undefined && !/^[a-z0-9-]+$/.test(vals.name)) { err(`invalid gate name '${vals.name}'`); break; }
      if (vals.validates !== undefined) {
        agentOf(vals.validates, 'validates');
        if (NON_ADVANCING.has(vals.kind)) err(`validates= is not allowed on kind=${vals.kind}`);
      }
      if (NON_ADVANCING.has(vals.kind) && !vals.name) err(`kind=${vals.kind} requires name=<s> (it repeats within a phase)`);
      if (vals.requires_human !== undefined && vals.requires_human !== 'true') err(`requires_human= must be 'true' (omit it otherwise), got '${vals.requires_human}'`);
      const agent = vals.agent || ctx.agent;
      if (!agent) { err('{{gate}} outside an agent file requires agent=<agent>'); break; }
      agentOf(agent, 'agent');
      const phase = vals.phase || ctx.phase;
      if (!phase) { err('{{gate}} outside a phase file requires phase=N'); break; }
      if (ctx.phase && vals.phase && vals.phase !== ctx.phase) { err(`gate phase=${vals.phase} does not match enclosing phase file (phase ${ctx.phase})`); break; }
      const track = vals.track || ctx.track;
      if (ctx.track && vals.track && vals.track !== ctx.track) { err(`gate track=${vals.track} does not match enclosing file track '${ctx.track}'`); break; }
      let id = vals.id || `${agent}${track ? `-${track}` : ''}-phase-${phase}`;
      if (vals.name && !vals.id) id += `.${vals.name}`;
      Object.assign(model, { id, kind: vals.kind, phase, track: track || null, agent, validates: vals.validates, requires_human: vals.requires_human === 'true', advancing: !NON_ADVANCING.has(vals.kind) });
      break;
    }
    case 'auto_verify': {
      if (!['start', 'end'].includes(vals.action)) { err(`{{auto_verify}} first argument must be start|end`); break; }
      if (vals.action === 'start') {
        for (const k of ['tool_budget', 'ttl']) if (!/^[1-9]\d*$/.test(vals[k] || '')) err(`{{auto_verify start}} requires ${k}=<positive integer>`);
        // Bounds of the runtime tool's inputSchema (tool_budget 1-200, ttl_s 30-3600).
        if (/^\d+$/.test(vals.tool_budget || '') && Number(vals.tool_budget) > 200) err('{{auto_verify start}} tool_budget must be at most 200');
        if (/^\d+$/.test(vals.ttl || '') && (Number(vals.ttl) < 30 || Number(vals.ttl) > 3600)) err('{{auto_verify start}} ttl must be 30-3600 seconds');
      } else if (vals.tool_budget !== undefined || vals.ttl !== undefined) err('{{auto_verify end}} takes no arguments');
      Object.assign(model, { action: vals.action, tool_budget: vals.tool_budget, ttl: vals.ttl, agent: ctx.agent, phase: ctx.phase });
      break;
    }
    case 'record.write':
      Object.assign(model, { section: vals.section, file: vals.file || 'project-specs.md' });
      break;
    case 'tasks.update':
      if (!['todo', 'doing', 'done', 'blocked'].includes(vals.status)) err(`invalid status '${vals.status}'; expected todo|doing|done|blocked`);
      Object.assign(model, vals);
      break;
    case 'tasks.list':
      if (vals.status !== undefined && !['todo', 'doing', 'done', 'blocked'].includes(vals.status)) err(`invalid status '${vals.status}'`);
      Object.assign(model, vals);
      break;
    case 'tasks.create':
    case 'tasks.get':
    case 'knowledge.search':
      Object.assign(model, vals);
      break;
    case 'artifact.emit':
      if (!/^[a-z][a-z0-9_-]*$/.test(vals.type)) { err(`invalid artifact type '${vals.type}'`); break; }
      Object.assign(model, { type: vals.type, path: vals.path });
      if (vals.meta !== undefined) {
        let raw;
        try { raw = parseMeta(vals.meta); } catch (e) { err(`${e.message} in {{artifact.emit}}`); break; }
        const typed = typeMeta(raw, loadSchema(core.coreDir, vals.type));
        for (const e of typed.errors) err(`${e} in {{artifact.emit type=${vals.type}}}`);
        model.meta = typed.meta;
      }
      break;
    default:
      break;
  }
  return errors.length ? { errors } : { model };
}

const SPECS = {
  jira_context: { positional: [], named: [], required: [] },
  switch: { positional: ['agent'], named: [], required: ['agent'] },
  consult: { positional: ['agent'], named: ['entry', 'task'], required: ['agent', 'entry'] },
  fanout: { positional: ['agent'], named: ['slices', 'entry', 'task'], required: ['agent', 'slices'] },
  return: { positional: [], named: ['to'], required: [] },
  phase: { positional: ['n'], named: ['track', 'agent'], required: ['n'] },
  protocol: { positional: ['name'], named: [], required: ['name'] },
  template: { positional: ['name'], named: [], required: ['name'] },
  gate: { positional: [], named: ['kind', 'phase', 'track', 'validates', 'name', 'agent', 'id', 'requires_human'], required: ['kind'] },
  auto_verify: { positional: ['action'], named: ['tool_budget', 'ttl'], required: ['action'] },
  'record.write': { positional: [], named: ['section', 'file'], required: ['section'] },
  'tasks.create': { positional: [], named: ['title', 'owns', 'accept'], required: ['title'] },
  'tasks.update': { positional: [], named: ['id', 'status'], required: ['id', 'status'] },
  'tasks.list': { positional: [], named: ['status'], required: [] },
  'tasks.get': { positional: [], named: ['id'], required: ['id'] },
  'knowledge.search': { positional: [], named: ['query', 'scope'], required: ['query'] },
  'artifact.emit': { positional: [], named: ['type', 'path', 'meta'], required: ['type', 'path'] },
  lead: { positional: ['agent'], named: ['task'], required: ['agent'] },
  delegate: { positional: [], named: ['tasks', 'max_parallel', 'mode'], required: [] },
};

module.exports = { resolveMacro, fileContext, NAMES, ENTRIES, KINDS };
