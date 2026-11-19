import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const relpkg = require('../build/package');

// Simulates an npm install of the CLI tarball: the package lives at <proj>/node_modules/@proflandrigan/shards and its
// dependencies are hoisted to <proj>/node_modules (one conflicting version nested under the package itself).
let tmp;
const pj = (dir, o) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(o)); };
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-hoisted-'));
  const nm = path.join(tmp, 'proj', 'node_modules');
  pj(path.join(nm, '@proflandrigan', 'shards'), { name: '@proflandrigan/shards', dependencies: { yaml: '*', '@scope/sdk': '*', dup: '*' } });
  pj(path.join(nm, 'yaml'), { name: 'yaml' });
  pj(path.join(nm, '@scope', 'sdk'), { name: '@scope/sdk', dependencies: { zod: '*', dup: '*' } });
  pj(path.join(nm, 'zod'), { name: 'zod' });
  // sdk needs dup@1 (hoisted); the shards package needs dup@2 (nested under it)
  pj(path.join(nm, '@scope', 'sdk', 'node_modules', 'dup'), { name: 'dup', version: '1.0.0' });
  pj(path.join(nm, '@proflandrigan', 'shards', 'node_modules', 'dup'), { name: 'dup', version: '2.0.0' });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('depClosure / copyRuntime with a hoisted npm layout', () => {
  it('maps hoisted and nested deps under node_modules/, never ../', () => {
    const root = path.join(tmp, 'proj', 'node_modules', '@proflandrigan', 'shards');
    const rels = relpkg.depClosure(root).map((d) => d.rel.split(path.sep).join('/'));
    expect(rels).toEqual(['node_modules/@scope/sdk', 'node_modules/@scope/sdk/node_modules/dup', 'node_modules/dup', 'node_modules/yaml', 'node_modules/zod']);
    for (const r of rels) expect(r.startsWith('..')).toBe(false);
  });

  it('copyRuntime bundles every dep inside <out>/node_modules and writes nothing outside out', () => {
    const root = path.join(tmp, 'proj', 'node_modules', '@proflandrigan', 'shards');
    const out = path.join(tmp, 'build', 'plugin');
    fs.mkdirSync(out, { recursive: true });
    relpkg.copyRuntime(out, { depRoot: root });
    expect(fs.readdirSync(path.join(tmp, 'build'))).toEqual(['plugin']);
    expect(fs.readdirSync(tmp).sort()).toEqual(['build', 'proj']);
    const ver = (rel) => JSON.parse(fs.readFileSync(path.join(out, rel, 'package.json'), 'utf8')).version;
    expect(fs.existsSync(path.join(out, 'node_modules', 'yaml', 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'node_modules', '@scope', 'sdk', 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'node_modules', 'zod', 'package.json'))).toBe(true);
    expect(ver('node_modules/dup')).toBe('2.0.0');
    expect(ver('node_modules/@scope/sdk/node_modules/dup')).toBe('1.0.0');
  });

  it('bundleRel keeps repo-checkout paths unchanged', () => {
    expect(relpkg.bundleRel('/repo', '/repo/node_modules/a/node_modules/b')).toBe(path.join('node_modules', 'a', 'node_modules', 'b'));
    expect(relpkg.bundleRel('/p/node_modules/@x/shards', '/p/node_modules/@m/sdk')).toBe(path.join('node_modules', '@m', 'sdk'));
  });
});
