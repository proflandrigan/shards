import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { toLegacyAgentPath } = require('../tools/legacy-layout.js');
const ROOT = path.resolve(__dirname, '..');

const rows = fs.readFileSync(path.join(ROOT, 'core/INVENTORY.md'), 'utf8')
  .split('\n')
  .map((l) => l.match(/^\| \d+ \| `([^`]+)` \| (`([^`]+)`|\(dropped\)) \|/))
  .filter(Boolean)
  .map((m) => ({ old: m[1], now: m[3] || null }));

describe('core/ inventory (E1.2)', () => {
  it('maps a non-trivial number of legacy files', () => {
    expect(rows.length).toBeGreaterThan(200);
  });

  it('every mapped file exists at its new path', () => {
    const missing = rows.filter((r) => r.now && !fs.existsSync(path.join(ROOT, r.now))).map((r) => r.now);
    expect(missing).toEqual([]);
  });

  it('legacy installer layout maps core paths back to the original agent paths', () => {
    const bad = [];
    for (const r of rows) {
      if (!r.now || !r.old.startsWith('src/agents/')) continue;
      const back = toLegacyAgentPath(r.now.replace(/^core\//, ''));
      if (back !== r.old.replace(/^src\/agents\//, '')) bad.push(`${r.now} -> ${back} (want ${r.old})`);
    }
    // academic service_mode.md is new in core (extracted from academic.md)
    expect(bad).toEqual([]);
  });

  it('v2-only files are not part of the legacy layout', () => {
    expect(toLegacyAgentPath('agents/syn/agent.yaml')).toBeNull();
    expect(toLegacyAgentPath('agents/syn/persona-summary.md')).toBeNull();
  });
});
