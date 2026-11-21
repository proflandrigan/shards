import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { StateStore, provisionalSessionKey } = require('../runtime/state/store.js');
const { lockedAppend } = require('../runtime/state/append.js');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-state-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const inc = (c) => ({ ...c, counter: (c.counter || 0) + 1 });
const writer = path.join(__dirname, 'fixtures', 'runtime-writer.js');
function runWriter(key, n) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [writer, dir, key, String(n)], { stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('writer exit ' + c))));
  });
}

describe('StateStore', () => {
  it('8 concurrent in-process writers x25', async () => {
    const s = new StateStore(dir, 'a');
    await Promise.all(Array.from({ length: 8 }, async () => { for (let i = 0; i < 25; i++) await s.update('frames', inc); }));
    expect(s.read('frames').counter).toBe(200);
    expect(s.getVersion()).toBe(200);
    JSON.parse(fs.readFileSync(s.file('frames'), 'utf8'));
  }, 60000);

  it('multi-process writers do not lose updates', async () => {
    await Promise.all([runWriter('p', 25), runWriter('p', 25), runWriter('p', 25)]);
    const s = new StateStore(dir, 'p');
    expect(s.read('frames').counter).toBe(75);
    expect(s.getVersion()).toBe(75);
  }, 60000);

  it('throws on corrupt JSON and does not overwrite', async () => {
    const s = new StateStore(dir, 'c');
    await s.update('gates', (g) => g);
    fs.writeFileSync(s.file('gates'), '{not json');
    expect(() => s.read('gates')).toThrow(/Corrupt/);
    await expect(s.update('gates', inc)).rejects.toThrow(/Corrupt/);
    expect(fs.readFileSync(s.file('gates'), 'utf8')).toBe('{not json');
  });

  it('rejects bad session keys', () => {
    for (const k of ['../x', 'a/b', 'a\\b', '', '..', 'a b', undefined]) expect(() => new StateStore(dir, k)).toThrow(/Invalid sessionKey/);
  });

  it('sessions are isolated; provisional key is valid', async () => {
    const a = new StateStore(dir, 'one'), b = new StateStore(dir, 'two');
    await a.update('frames', inc);
    expect(b.read('frames').counter).toBeUndefined();
    expect(a.file('frames')).not.toBe(b.file('frames'));
    expect(() => new StateStore(dir, provisionalSessionKey())).not.toThrow();
  });

  it('lockedAppend appends lines concurrently', async () => {
    const f = path.join(dir, 'x', 'log.jsonl');
    await Promise.all(Array.from({ length: 20 }, (_, i) => lockedAppend(f, JSON.stringify({ i }))));
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
    expect(lines.length).toBe(20);
    lines.forEach((l) => JSON.parse(l));
  });
});
