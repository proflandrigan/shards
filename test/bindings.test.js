import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadBinding, listBindings, parseBinding, BindingError } = require('../runtime/config/bindings.js');

const GOOD = `---
name: demo
jobs: [record]
required_settings: [space]
expected_tools: [mcp__demo__write]
verbs:
  record: [record.write]
---
## verb: record.write
Do it.
`;

describe('bindings', () => {
  it('lists git and validates git.md', () => {
    expect(listBindings()).toContain('git');
    const b = loadBinding('git');
    expect(b.name).toBe('git');
    expect(b.expected_tools).toEqual([]);
    expect(b.jobs).toEqual(['record', 'tasks', 'knowledge', 'review', 'artifacts', 'presentation']);
    expect(b.verbs.artifacts).toContain('artifact.emit');
  });
  it('accepts a well-formed binding', () => {
    expect(parseBinding(GOOD, 'demo').ok).toBe(true);
  });
  it('rejects missing frontmatter and bad YAML', () => {
    expect(parseBinding('# nothing').ok).toBe(false);
    expect(parseBinding('---\nname: [x\n---\nbody').ok).toBe(false);
  });
  it('rejects schema violations (missing field, unknown job, bad verb)', () => {
    expect(parseBinding(GOOD.replace('expected_tools: [mcp__demo__write]\n', '')).ok).toBe(false);
    expect(parseBinding(GOOD.replace('jobs: [record]', 'jobs: [bogus]')).ok).toBe(false);
    expect(parseBinding(GOOD.replace('record.write]', 'writeit]')).ok).toBe(false);
  });
  it('rejects verbs/jobs mismatch, wrong prefix, missing body section, name mismatch', () => {
    expect(parseBinding(GOOD.replace('jobs: [record]', 'jobs: [record, tasks]')).errors.join()).toContain('tasks');
    expect(parseBinding(GOOD.replace('record: [record.write]', 'record: [tasks.create]')).ok).toBe(false);
    expect(parseBinding(GOOD.replace('## verb: record.write', '## other')).errors.join()).toContain('record.write');
    expect(parseBinding(GOOD, 'other').errors.join()).toContain('file name');
  });
  it('loadBinding throws BindingError for unknown or malformed names', () => {
    expect(() => loadBinding('nope-nope')).toThrow(BindingError);
    expect(() => loadBinding('../etc')).toThrow(BindingError);
  });
});
