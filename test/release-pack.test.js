import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('release packaging (E2.10)', () => {
  it('root package is a scoped 2.0.0-next package published to the next tag', () => {
    expect(pkg.name).toBe('@proflandrigan/shards');
    expect(pkg.version).toMatch(/^2\.0\.0-next\.\d+$/);
    expect(pkg.publishConfig).toEqual({ access: 'public', tag: 'next' });
    expect(pkg.bin.shards).toBe('cli/shards.js');
  });

  it('every bin target exists and is covered by files', () => {
    for (const target of Object.values(pkg.bin)) {
      expect(fs.existsSync(path.join(ROOT, target)), target).toBe(true);
      expect(pkg.files.some((f) => target === f || target.startsWith(f)), target).toBe(true);
    }
  });

  it('stages a self-contained shards-mcp package', () => {
    const { stage } = require('../scripts/stage-runtime-package.js');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-stage-test-'));
    try {
      stage(out);
      const sp = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
      expect(sp.name).toBe('@proflandrigan/shards-mcp');
      expect(sp.version).toBe(pkg.version);
      expect(sp.bin['shards-mcp']).toBe('runtime/server.js');
      expect(sp.publishConfig.tag).toBe('next');
      expect(Object.keys(sp.dependencies).sort()).toEqual(Object.keys(pkg.dependencies).sort());
      for (const p of ['runtime/server.js', 'core/schema', 'hooks/lib/host.js', 'build/core.js', 'scripts/validate-agents.js', 'bindings']) {
        expect(fs.existsSync(path.join(out, p)), p).toBe(true);
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
