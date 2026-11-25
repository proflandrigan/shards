'use strict';
// tasks_set (E12.1): the lead registers the task manifest (tasks.yaml) for the session.
const fs = require('fs');
const path = require('path');
const { defineTool } = require('../registry');
const { loadAgents } = require('../agents');
const T = require('../tasks');

function inside(root, rel) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  const r = path.relative(rootAbs, abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`path must stay inside the project root: ${rel}`);
  return { abs, rel: r.split(path.sep).join('/') };
}

function resolveOutputDir(ctx, args, scope) {
  if (args.output_dir) return args.output_dir;
  if (scope) return scope;
  const frames = ctx.state.read('frames').frames || [];
  const frame = frames[frames.length - 1];
  const agent = frame ? loadAgents().get(frame.agent) : null;
  if (frame && agent && agent.output_dir && frame.project) return agent.output_dir.replace('{project}', frame.project);
  throw new Error('tasks_set cannot resolve output_dir: no active specialist frame with a project. Pass output_dir (project-root-relative, e.g. "shards/<project>") or use `path` to an existing tasks.yaml.');
}

// Append AR iteration cards (task.ar) to the registered manifest. An AR branch lead learns each hypothesis only
// after the previous iteration, so its cards arrive one at a time; existing states are kept.
async function appendArCards(ctx, args, scope) {
  if (args.manifest === undefined) throw new Error('tasks_set: append needs `manifest` (the new cards), not `path`.');
  const existing = T.readTasksState(ctx.state, scope);
  if (!existing.manifest) throw new Error('tasks_set: append needs a registered manifest; call tasks_set without append first.');
  if (existing.drift && existing.drift.open) throw new Error('tasks_set: append refused: a worker reported deviations; follow plan_drift.');
  const add = (args.manifest && Array.isArray(args.manifest.tasks)) ? args.manifest.tasks : [];
  if (!add.length) throw new Error('tasks_set: append needs manifest.tasks with at least one card.');
  const notAr = add.filter((t) => !t || !t.ar).map((t) => (t && t.id) || '?');
  if (notAr.length) throw new Error(`tasks_set: append is only for AR iteration cards (tasks with \`ar\`); not AR: ${notAr.join(', ')}. Other manifest changes go through plan_drift.`);
  const manifest = { ...existing.manifest, tasks: [...existing.manifest.tasks, ...add] };
  let agents;
  try { agents = loadAgents(); if (!agents.size) agents = undefined; } catch (_) { agents = undefined; }
  const v = T.validateManifest(manifest, { knownAgents: agents });
  if (!v.ok) throw new Error(`Task manifest rejected (${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}):\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);
  const f = inside(ctx.root, existing.path);
  const fresh = T.initialTasksState({ version: 1, tasks: add }, existing.path).tasks;
  // State first (it can refuse a concurrent change), then tasks.yaml, so a refusal leaves the file untouched.
  const next = await ctx.state.update(T.stateNameFor(scope), (cur) => {
    if (!cur.manifest || cur.manifest.tasks.length !== existing.manifest.tasks.length) throw new Error('tasks_set: the manifest changed concurrently; nothing was appended.');
    cur.manifest = manifest;
    cur.tasks = { ...cur.tasks, ...fresh };
    return cur;
  });
  fs.mkdirSync(path.dirname(f.abs), { recursive: true });
  fs.writeFileSync(f.abs, T.stringifyYaml(manifest));
  const mirror = T.mirrorTasksMd(ctx, next, scope);
  const data = {
    ...(scope ? { scope } : {}), manifest_path: existing.path, appended: add.map((t) => t.id), total: manifest.tasks.length,
    counts: T.countsOf(next), ready: T.readyIds(next), mirror: mirror.mirrored ? mirror.path : null, ...(mirror.note ? { mirror_note: mirror.note } : {}),
  };
  return { text: `Appended ${add.length} AR iteration card(s) (ready: ${data.ready.join(', ') || 'none'}). Next: task_dispatch with the ready ids.\n\n${JSON.stringify(data, null, 2)}` };
}

module.exports = defineTool({
  name: 'tasks_set',
  description: 'Register the task manifest for this session. Pass exactly one of `manifest` (object: {version:1, tasks:[{id, goal, plan_ref, inputs, owned_paths, acceptance:{command,expected}, depends_on, worker, size (1-60 min), phase?, delegate?}]}; written to <output_dir>/tasks.yaml) or `path` (an existing tasks.yaml). The manifest is validated (schema, unique ids, no cycles, real acceptance checks, safe owned_paths, no overlapping owned_paths between tasks that could run in parallel, inline only for phases with <= 2 tasks); ALL problems are listed in one error and nothing is stored. All tasks start pending; TASKS.md is mirrored. Then call task_dispatch with ready task ids. Optional `scope`: when you are a workstream lead under PM mode, pass the same `scope` (your workstream dir, given by the lead contract) on EVERY task_* call so parallel leads keep separate manifests; with `scope` and a `manifest`, output_dir defaults to `scope` and TASKS.md is mirrored to <scope>/TASKS.md. Omit `scope` otherwise.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      manifest: { type: 'object' },
      path: { type: 'string', minLength: 1 },
      output_dir: { type: 'string', minLength: 1 },
      amendment_gate: { type: 'string', minLength: 1 },
      append: { type: 'boolean', description: 'AR iteration cards only (issue #91, H4): add the tasks in `manifest` to the registered manifest, keeping every existing task state. Each appended task must carry `ar` (an autonomous-research iteration card) and depend on the previous iteration card when they own the same paths. No amendment gate is needed; any other change goes through plan_drift.' },
      scope: T.SCOPE_PROP,
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('tasks_set requires a resolved session');
    const scope = T.normalizeScope(args.scope);
    if ((args.manifest === undefined) === (args.path === undefined)) throw new Error('tasks_set: pass exactly one of `manifest` or `path`.');
    if (args.append) return appendArCards(ctx, args, scope);
    let manifest; let manifestPath; let toWrite = null;
    if (args.manifest !== undefined) {
      const dir = inside(ctx.root, resolveOutputDir(ctx, args, scope));
      manifest = args.manifest;
      manifestPath = `${dir.rel}/tasks.yaml`;
      toWrite = path.join(dir.abs, 'tasks.yaml');
    } else {
      const f = inside(ctx.root, args.path);
      if (!fs.existsSync(f.abs)) throw new Error(`tasks_set: file not found: ${args.path}`);
      try { manifest = T.parseYaml(fs.readFileSync(f.abs, 'utf8')); } catch (e) { throw new Error(`tasks_set: ${args.path} is not valid YAML: ${e.message}`); }
      manifestPath = f.rel;
    }
    let agents;
    try { agents = loadAgents(); if (!agents.size) agents = undefined; } catch (_) { agents = undefined; }
    const v = T.validateManifest(manifest, { knownAgents: agents });
    if (!v.ok) throw new Error(`Task manifest rejected (${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}):\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);

    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const existing = T.readTasksState(ctx.state, scope);
    let verdict;
    if (existing.manifest) verdict = await T.assertMayReplace(session, existing, manifest, args);

    if (toWrite) {
      fs.mkdirSync(path.dirname(toWrite), { recursive: true });
      fs.writeFileSync(toWrite, T.stringifyYaml(manifest));
    }
    const next = T.initialTasksState(manifest, manifestPath);
    const consumed = [...(existing.consumed_amendments || [])];
    if (verdict && verdict.consume) consumed.push(verdict.consume);
    if (consumed.length) next.consumed_amendments = consumed;
    await ctx.state.update(T.stateNameFor(scope), () => next);
    const mirror = T.mirrorTasksMd(ctx, next, scope);
    const data = {
      ...(scope ? { scope } : {}),
      manifest_path: manifestPath, total: manifest.tasks.length, counts: T.countsOf(next), ready: T.readyIds(next),
      mirror: mirror.mirrored ? mirror.path : null, ...(mirror.note ? { mirror_note: mirror.note } : {}),
    };
    return { text: `Task manifest accepted (${data.total} tasks, ready: ${data.ready.join(', ') || 'none'}). Next: task_dispatch with the ready ids.\n\n${JSON.stringify(data, null, 2)}` };
  },
});
