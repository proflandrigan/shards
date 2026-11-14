import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['runtime', 'hooks', 'cli', 'build', 'bindings'];
const BANNED = ['packages/studio', 'src/ui', 'permission-pattern', 'cc-readonly'];
const SPEC = /(?:require\(\s*|from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(c|m)?js$/.test(e.name)) out.push(f);
  }
  return out;
}

describe('runtime must not import Studio/UI', () => {
  it('has no banned import specifiers', () => {
    const bad = [];
    for (const dir of DIRS) {
      for (const f of walk(path.join(ROOT, dir))) {
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(SPEC)) {
          if (BANNED.some((b) => m[1].includes(b))) bad.push(`${path.relative(ROOT, f)} -> ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
