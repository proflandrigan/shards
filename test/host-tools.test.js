import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { claudeToolsOf, CAPABILITIES } = require('../build/host-tools.js');
const { loadAgents, frontmatterToolsErrors } = require('../scripts/validate-agents.js');

describe('host tool mapping', () => {
  it('maps capabilities to Claude tools in order, dropping delegate', () => {
    expect(claudeToolsOf({ capabilities: ['read', 'write', 'edit', 'search', 'shell', 'notebook', 'delegate', 'web', 'skill'] }))
      .toEqual(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'NotebookEdit', 'WebSearch', 'WebFetch', 'Skill']);
  });
  it('defaults to read-only when capabilities are absent', () => {
    expect(claudeToolsOf({})).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
  });
  it('every shipped agent uses known capabilities and no frontmatter tools line', () => {
    for (const { doc } of loadAgents()) for (const c of doc.capabilities || []) expect(CAPABILITIES).toContain(c);
    expect(frontmatterToolsErrors()).toEqual([]);
  });
});
