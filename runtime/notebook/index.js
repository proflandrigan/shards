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

const PIP_DEPS = 'jupyter_client ipykernel';

// Homebrew and other PEP 668 Pythons refuse `pip install` ("externally-managed-environment"),
// so the hint also gives the project-venv route. SHARDS_PYTHON is read from the MCP server's own
// environment on every notebook tool call (findPython), so it must be an absolute path set where
// the host launches the server.
function venvHint(platform = process.platform) {
  const win = platform === 'win32';
  const vpip = win ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
  const vpy = win ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';
  const setEnv = win ? `set SHARDS_PYTHON=%CD%\\${vpy}` : `export SHARDS_PYTHON="$PWD/${vpy}"`;
  return `If pip reports "externally-managed-environment" (Homebrew or another PEP 668 Python), create a project virtual environment instead: `
    + `${win ? 'py' : 'python3'} -m venv .venv && ${vpip} install ${PIP_DEPS} - then point Shards at it with the absolute path, `
    + `e.g. ${setEnv}, in the environment the host (and so the Shards MCP server) is launched from, and restart the session.`;
}

function checkDeps(python, opts = {}) {
  const spawnSync = opts.spawnSync || cp.spawnSync;
  const platform = opts.platform || process.platform;
  if (!python) {
    return { ok: false, hint: `No Python interpreter found (tried SHARDS_PYTHON, python3, python). Install Python 3, then: pip install ${PIP_DEPS}. ${venvHint(platform)}` };
  }
  const r = spawnSync(python, ['-c', 'import jupyter_client, ipykernel'], { shell: false, encoding: 'utf8', timeout: 30000 });
  if (r && !r.error && r.status === 0) return { ok: true, hint: '' };
  return { ok: false, hint: `Notebook tools need jupyter_client and ipykernel in the interpreter "${python}". Install with: ${python} -m pip install ${PIP_DEPS} (or set SHARDS_PYTHON to an interpreter that has them). ${venvHint(platform)}` };
}

// kernel.py reports failures as {ok:false, error, ...}. Tools surface those as MCP errors
// (isError) instead of a successful result carrying ok:false.
function unwrap(tool, result) {
  if (result && result.ok === false) {
    const { ok, error, ...extra } = result;
    const more = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    throw new Error(`${tool} failed: ${error || 'unknown kernel error'}${more}`);
  }
  return result;
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
      // Force UTF-8 stdio: on Windows Python defaults to the ANSI code page (cp1252), which garbles non-ASCII in the JSON we parse.
      child = spawnImpl(python, [KERNEL_PY, ...args], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
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

module.exports = { KERNEL_PY, SESSION_RE, findPython, checkDeps, venvHint, unwrap, validateSession, resolveNotebook, runKernel, preparePython };
