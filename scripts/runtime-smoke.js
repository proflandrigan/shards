#!/usr/bin/env node
'use strict';
// Dependency-free smoke test: spawn runtime/server.js over stdio, do the MCP initialize handshake and check
// tools/list. Runs on any Node >= 18 (vitest 4 needs Node 20+, so CI uses this to prove Node 18 support).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-smoke-'));
const server = path.resolve(__dirname, '..', 'runtime', 'server.js');
const child = spawn(process.execPath, [server, '--root', root], { stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
let errText = '';
const pending = new Map();
child.stderr.on('data', (d) => { errText += d; });
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let nextId = 1;
const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
const request = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 20000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  send({ jsonrpc: '2.0', id, method, params });
});

function finish(code, msg) {
  if (msg) (code ? console.error : console.log)(msg);
  try { child.kill(); } catch (_) { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  process.exit(code);
}

child.on('error', (e) => finish(1, `spawn failed: ${e.message}`));
child.on('exit', (c) => { if (pending.size) finish(1, `server exited early (code ${c})\n${errText}`); });

(async () => {
  const init = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'runtime-smoke', version: '0' } });
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const list = await request('tools/list', {});
  if (list.error) throw new Error(`tools/list failed: ${JSON.stringify(list.error)}`);
  const names = (list.result.tools || []).map((t) => t.name);
  if (!names.includes('shards_status')) throw new Error(`tool shards_status missing; got ${names.join(', ')}`);
  finish(0, `runtime smoke ok on node ${process.version}: ${names.length} tools`);
})().catch((e) => finish(1, `runtime smoke FAILED on node ${process.version}: ${e.message}\n${errText}`));
