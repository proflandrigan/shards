import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const HOOKS = path.resolve(__dirname, '..', 'hooks');
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}

describe('hooks never read the host session log', () => {
  const files = walk(HOOKS).filter((f) => /\.(js|json)$/.test(f));
  it('has files to scan', () => expect(files.length).toBeGreaterThanOrEqual(6));
  for (const f of files) {
    it(`${path.relative(HOOKS, f)} does not reference a transcript path`, () => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/transcript/i);
    });
  }
});
