'use strict';
// Drives the REAL runtime tools in-process to build a synthetic finished state in <dir>.
// usage: node dry-run.js <dir>   (dir already holds the copied fixture)
const path = require('path');
const fs = require('fs');
const repo = path.resolve(__dirname, '..', '..', '..');
const { Registry } = require(path.join(repo, 'runtime/registry'));
const { loadTools } = require(path.join(repo, 'runtime/tools'));
const { StateStore } = require(path.join(repo, 'runtime/state/store'));

(async () => {
  const root = path.resolve(process.argv[2]);
  const state = new StateStore(root, 'synthetic');
  const reg = new Registry(loadTools());
  const call = async (name, args) => {
    const r = await reg.call(name, args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 'synthetic' });
    if (r.isError) throw new Error(`${name}: ${r.content.map((c) => c.text).join(' ')}`);
    return r;
  };
  const result = () => ({ status: 'done', files_changed: [], check: { command: 'test -f x', exit_code: 0, output_excerpt: 'ok' }, deviations: [], open_questions: [] });
  const make = (id) => {
    const t = state.read('tasks').manifest.tasks.find((x) => x.id === id);
    const dir = path.join(root, t.owned_paths[0]);
    fs.mkdirSync(dir, { recursive: true });
    const f = id === 't1' ? 'stg_orders.sql' : id === 't2' ? 'stg_customers.sql' : id === 't3' ? 'fct_orders.sql' : 'schema.yml';
    fs.writeFileSync(path.join(dir, f), `-- ${id}\n`);
  };
  const run = async (id, { failFirst = false } = {}) => {
    await call('task_dispatch', { ids: [id] });
    make(id);
    await call('task_report', { id, result: result() });
    if (failFirst) {
      await call('task_verify', { id, pass: false, expected: 'exit 0', observed: 'exit 1: file missing' });
      await call('task_dispatch', { ids: [id] });
      await call('task_report', { id, result: result() });
    }
    await call('task_verify', { id, pass: true, expected: 'exit 0', observed: 'exit 0' });
  };
  await call('tasks_set', { path: 'shards/dbuild/tasks.yaml' });
  await run('t1'); await run('t2', { failFirst: true }); await run('t3'); await run('t4');
  console.log('synthetic state built in ' + root);
})().catch((e) => { console.error(e.message); process.exit(1); });
