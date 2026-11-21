import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { detectProjectFromRelPath } = require('../packages/studio/server.js');

describe('studio detectProjectFromRelPath', () => {
  it('detects shards/<project>/ and legacy layouts', () => {
    expect(detectProjectFromRelPath('shards/churn/project-specs.md')).toEqual({ projectDir: 'shards/churn', projectName: 'churn' });
    expect(detectProjectFromRelPath('analysis/churn/q.sql')).toEqual({ projectDir: 'analysis/churn', projectName: 'churn' });
  });
  it("ignores Syn's shared folders under shards/", () => {
    for (const p of ['shards/brainstorm/brainstorm_x.md', 'shards/fixes/fix_y.md', 'shards/panels/repo/report.md', 'shards/academic_reports/r.md']) {
      expect(detectProjectFromRelPath(p)).toBeNull();
    }
  });
});
