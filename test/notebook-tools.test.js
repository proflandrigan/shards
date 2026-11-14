import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const cp = require('child_process');
const nb = require('../runtime/notebook');
const { loadTools } = require('../runtime/tools');

const tools = Object.fromEntries(loadTools().filter((t) => t.name.startsWith('notebook_')).map((t) => [t.name, t]));

function fakeSpawn({ stdout = '', code = 0, hang = false, calls = [] } = {}) {
  const impl = (cmd, args, o) => {
    calls.push({ cmd, args, o });
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => { c.killed = true; };
    if (!hang) setImmediate(() => { c.stdout.emit('data', stdout); c.emit('close', code); });
    return c;
  };
  impl.calls = calls;
  return impl;
}
const ctxFor = (root, spawnImpl, extra = {}) => ({ root, notebookOpts: { python: 'py-fake', skipDeps: true, spawnImpl, ...extra } });

describe('notebook mocked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nbt-'));
  it('registers four tools', () => {
    expect(Object.keys(tools).sort()).toEqual(['notebook_exec', 'notebook_run_all', 'notebook_start', 'notebook_stop']);
  });
  it('session id validation', () => {
    expect(() => nb.validateSession('abc-1_x')).not.toThrow();
    for (const bad of ['', '../x', 'a/b', 'a b', 'x'.repeat(65)]) expect(() => nb.validateSession(bad)).toThrow(/Invalid session/);
  });
  it('notebook path must stay in root and be .ipynb', () => {
    expect(nb.resolveNotebook(root, 'a/b.ipynb')).toBe(path.join(root, 'a', 'b.ipynb'));
    expect(() => nb.resolveNotebook(root, '../evil.ipynb')).toThrow(/escapes/);
    expect(() => nb.resolveNotebook(root, '/etc/passwd.ipynb')).toThrow(/escapes/);
    expect(() => nb.resolveNotebook(root, 'a.txt')).toThrow(/ipynb/);
  });
  it('exec builds args and returns kernel JSON', async () => {
    const sp = fakeSpawn({ stdout: '{"ok":true,"x":1}\n' });
    const r = await tools.notebook_exec.handler({ session: 's1', cell: 3 }, ctxFor(root, sp));
    expect(r.data).toEqual({ ok: true, x: 1 });
    expect(sp.calls[0].args.slice(1)).toEqual(['exec', 's1', '3']);
    expect(sp.calls[0].o.cwd).toBe(root);
    expect(sp.calls[0].o.shell).toBe(false);
  });
  it('start generates session when absent', async () => {
    const calls = [];
    const impl = (cmd, args, o) => fakeSpawn({ stdout: args[1] === 'new-session' ? '{"ok":true,"sessionId":"sid-1"}' : '{"ok":true}', calls })(cmd, args, o);
    await tools.notebook_start.handler({ notebook: 'n.ipynb' }, ctxFor(root, impl));
    expect(calls.map((c) => c.args[1])).toEqual(['new-session', 'start']);
    expect(calls[1].args.slice(2)).toEqual(['sid-1', path.join(root, 'n.ipynb')]);
  });
  it('rejects bad session and escaping notebook before spawning', async () => {
    const sp = fakeSpawn();
    await expect(tools.notebook_stop.handler({ session: '../x' }, ctxFor(root, sp))).rejects.toThrow(/Invalid session/);
    await expect(tools.notebook_start.handler({ notebook: '../x.ipynb' }, ctxFor(root, sp))).rejects.toThrow(/escapes/);
    expect(sp.calls.length).toBe(0);
  });
  it('missing deps gives install hint', async () => {
    const spawnSync = () => ({ status: 1 });
    const d = nb.checkDeps('pyx', { spawnSync });
    expect(d.ok).toBe(false);
    expect(d.hint).toMatch(/pip install jupyter_client ipykernel/);
    expect(d.hint).toMatch(/pyx/);
    expect(() => nb.preparePython({ python: 'pyx', spawnSync })).toThrow(/pip install jupyter_client ipykernel/);
  });
  it('findPython order and override', () => {
    const seen = [];
    const spawnSync = (c) => { seen.push(c); return { status: c === 'py' ? 0 : 1 }; };
    expect(nb.findPython({}, { spawnSync, platform: 'win32' })).toBe('py');
    expect(seen).toEqual(['python3', 'python', 'py']);
    expect(nb.findPython({ SHARDS_PYTHON: '/x/py' }, { spawnSync: () => ({ status: 0 }) })).toBe('/x/py');
    expect(nb.findPython({}, { spawnSync: () => ({ status: 1 }), platform: 'linux' })).toBe(null);
  });
  it('timeout', async () => {
    const sp = fakeSpawn({ hang: true });
    await expect(nb.runKernel('p', root, ['status', 's'], { spawnImpl: sp, timeout: 30 })).rejects.toThrow(/timed out/);
  });
  it('non-JSON and non-zero exit', async () => {
    await expect(nb.runKernel('p', root, ['status', 's'], { spawnImpl: fakeSpawn({ stdout: 'hello' }) })).rejects.toThrow(/non-JSON/);
    await expect(nb.runKernel('p', root, ['status', 's'], { spawnImpl: fakeSpawn({ stdout: '', code: 2 }) })).rejects.toThrow(/exited with code 2/);
  });
});

// Real-kernel test: skipped when jupyter_client/ipykernel are absent from python3.
const haveJupyter = (() => {
  const r = cp.spawnSync('python3', ['-c', 'import jupyter_client, ipykernel'], { shell: false });
  return !r.error && r.status === 0;
})();

describe.skipIf(!haveJupyter)('notebook real kernel', () => {
  it('start, exec, run_all, stop', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nbk-'));
    const cell = (src) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: [src] });
    fs.writeFileSync(path.join(root, 't.ipynb'), JSON.stringify({ cells: [cell('x = 40'), cell('print(x + 2)')], metadata: {}, nbformat: 4, nbformat_minor: 5 }));
    const ctx = { root, notebookOpts: { python: 'python3' } };
    const s = await tools.notebook_start.handler({ notebook: 't.ipynb' }, ctx);
    const sid = s.data.sessionId || s.data.session_id;
    expect(sid).toBeTruthy();
    try {
      expect((await tools.notebook_exec.handler({ session: sid, cell: 0 }, ctx)).data.ok).toBe(true);
      expect((await tools.notebook_exec.handler({ session: sid, cell: 1 }, ctx)).data.ok).toBe(true);
      expect((await tools.notebook_run_all.handler({ session: sid }, ctx)).data.ok).toBe(true);
    } finally {
      await tools.notebook_stop.handler({ session: sid }, ctx);
    }
  }, 120000);
});
