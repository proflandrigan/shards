'use strict';
// Notebook kernel bridge: discovers python, checks jupyter deps, runs kernel.py one-shot subcommands.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const KERNEL_PY = path.join(__dirname, 'kernel.py');
const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

function findPython(env = process.env, opts = {}) {
  const spawnSync = opts.spawnSync || cp.spawnSync;
  const platform = opts.platform || process.platform;
  const cands = env.SHARDS_PYTHON ? [env.SHARDS_PYTHON] : ['python3', 'python'].concat(platform === 'win32' ? ['py'] : []);
  for (const c of cands) {
    const r = spawnSync(c, ['--version'], { shell: false, encoding: 'utf8', timeout: 10000 });
    if (r && !r.error && r.status === 0) return c;
  }
  return null;
}

function checkDeps(python, opts = {}) {
  const spawnSync = opts.spawnSync || cp.spawnSync;
  if (!python) {
    return { ok: false, hint: 'No Python interpreter found (tried SHARDS_PYTHON, python3, python). Install Python 3, then: pip install jupyter_client ipykernel' };
  }
  const r = spawnSync(python, ['-c', 'import jupyter_client, ipykernel'], { shell: false, encoding: 'utf8', timeout: 30000 });
  if (r && !r.error && r.status === 0) return { ok: true, hint: '' };
  return { ok: false, hint: `Notebook tools need jupyter_client and ipykernel in the interpreter "${python}". Install with: ${python} -m pip install jupyter_client ipykernel (or set SHARDS_PYTHON to an interpreter that has them).` };
}

function validateSession(sid) {
  if (typeof sid !== 'string' || !SESSION_RE.test(sid)) throw new Error(`Invalid session id ${JSON.stringify(sid)}: must match ${SESSION_RE}`);
  return sid;
}

function resolveNotebook(root, nb) {
  if (typeof nb !== 'string' || !nb) throw new Error('notebook path required');
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, nb);
  const rel = path.relative(rootAbs, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Notebook path escapes project root: ${nb}`);
  if (!abs.toLowerCase().endsWith('.ipynb')) throw new Error('Notebook path must end with .ipynb');
  return abs;
}

function ensureShardsDir(root) {
  fs.mkdirSync(path.join(root, '.shards'), { recursive: true });
}

// Runs `python kernel.py <args>` with cwd=root; resolves with the parsed single JSON line.
function runKernel(python, root, args, opts = {}) {
  const spawnImpl = opts.spawnImpl || cp.spawn;
  const timeout = opts.timeout || 120000;
  if (!opts.spawnImpl) ensureShardsDir(root);
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    let child;
    try {
      child = spawnImpl(python, [KERNEL_PY, ...args], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return reject(e); }
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* ignore */ }
      finish(reject, new Error(`kernel command timed out after ${timeout}ms: ${args[0]}`));
    }, timeout);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(reject, new Error(`failed to run ${python}: ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) return finish(reject, new Error(`kernel command exited with code ${code}: ${(err || out).trim().slice(0, 500)}`));
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1];
      let parsed;
      try { parsed = JSON.parse(last); } catch (_) { return finish(reject, new Error(`kernel returned non-JSON output: ${out.trim().slice(0, 300)}`)); }
      finish(resolve, parsed);
    });
  });
}

// Shared by tools: resolves python (opts.python overrides), checking deps first.
function preparePython(opts = {}) {
  const python = opts.python || findPython(process.env, opts);
  const deps = opts.skipDeps ? { ok: true } : checkDeps(python, opts);
  if (!deps.ok) throw new Error(deps.hint);
  return python;
}

module.exports = { KERNEL_PY, SESSION_RE, findPython, checkDeps, validateSession, resolveNotebook, runKernel, preparePython };
