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

function resolveOutputDir(ctx, args) {
  if (args.output_dir) return args.output_dir;
  const frames = ctx.state.read('frames').frames || [];
  const frame = frames[frames.length - 1];
  const agent = frame ? loadAgents().get(frame.agent) : null;
  if (frame && agent && agent.output_dir && frame.project) return agent.output_dir.replace('{project}', frame.project);
  throw new Error('tasks_set cannot resolve output_dir: no active specialist frame with a project. Pass output_dir (project-root-relative, e.g. "shards/<project>") or use `path` to an existing tasks.yaml.');
}

module.exports = defineTool({
  name: 'tasks_set',
  description: 'Register the task manifest for this session. Pass exactly one of `manifest` (object: {version:1, tasks:[{id, goal, plan_ref, inputs, owned_paths, acceptance:{command,expected}, depends_on, worker, size (1-60 min), phase?, delegate?}]}; written to <output_dir>/tasks.yaml) or `path` (an existing tasks.yaml). The manifest is validated (schema, unique ids, no cycles, real acceptance checks, safe owned_paths, no overlapping owned_paths between tasks that could run in parallel, inline only for phases with <= 2 tasks); ALL problems are listed in one error and nothing is stored. All tasks start pending; TASKS.md is mirrored. Then call task_dispatch with ready task ids.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      manifest: { type: 'object' },
      path: { type: 'string', minLength: 1 },
      output_dir: { type: 'string', minLength: 1 },
      amendment_gate: { type: 'string', minLength: 1 },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('tasks_set requires a resolved session');
    if ((args.manifest === undefined) === (args.path === undefined)) throw new Error('tasks_set: pass exactly one of `manifest` or `path`.');
    let manifest; let manifestPath; let toWrite = null;
    if (args.manifest !== undefined) {
      const dir = inside(ctx.root, resolveOutputDir(ctx, args));
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
    const existing = T.readTasksState(ctx.state);
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
    await ctx.state.update(T.STATE_NAME, () => next);
    const mirror = T.mirrorTasksMd(ctx, next);
    const data = {
      manifest_path: manifestPath, total: manifest.tasks.length, counts: T.countsOf(next), ready: T.readyIds(next),
      mirror: mirror.mirrored ? mirror.path : null, ...(mirror.note ? { mirror_note: mirror.note } : {}),
    };
    return { text: `Task manifest accepted (${data.total} tasks, ready: ${data.ready.join(', ') || 'none'}). Next: task_dispatch with the ready ids.\n\n${JSON.stringify(data, null, 2)}` };
  },
});
