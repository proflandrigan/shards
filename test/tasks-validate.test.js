import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('../runtime/tasks');
const { loadAgents } = require('../runtime/agents');

const task = (id, o = {}) => ({ id, goal: 'g', plan_ref: 'project-specs.md#p', inputs: [], owned_paths: [`${id}/`], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const m = (...tasks) => ({ version: 1, tasks });
const errs = (obj, o) => T.validateManifest(obj, o).errors.join('\n');

describe('validateManifest', () => {
  it('accepts a valid manifest', () => { expect(T.validateManifest(m(task('a'), task('b', { depends_on: ['a'] })))).toEqual({ ok: true, errors: [] }); });
  it('rejects duplicate ids and unknown deps', () => {
    expect(errs(m(task('a'), task('a')))).toMatch(/duplicate task id "a"/);
    expect(errs(m(task('a', { depends_on: ['zz'] })))).toMatch(/unknown task "zz"/);
  });
  it('rejects self and cyclic dependencies, reporting the cycle', () => {
    expect(errs(m(task('a', { depends_on: ['a'] })))).toMatch(/depends on itself/);
    expect(errs(m(task('a', { depends_on: ['c'] }), task('b', { depends_on: ['a'] }), task('c', { depends_on: ['b'] })))).toMatch(/cycle: .*a.*b.*c|cycle: .*->/);
  });
  it('rejects missing/empty acceptance', () => {
    expect(T.validateManifest(m(task('a', { acceptance: { command: '', expected: 'x' } }))).ok).toBe(false);
    expect(errs(m(task('a', { acceptance: { command: '  ', expected: 'x' } })))).toMatch(/acceptance/);
    expect(T.validateManifest(m(task('a', { acceptance: undefined }))).ok).toBe(false);
  });
  it('rejects unsafe paths', () => {
    expect(errs(m(task('a', { owned_paths: ['/etc'] })))).toMatch(/unsafe/);
    expect(errs(m(task('a', { owned_paths: ['x/../../y'] })))).toMatch(/unsafe/);
  });
  it('rejects overlapping paths only between parallel tasks', () => {
    expect(errs(m(task('a', { owned_paths: ['src/'] }), task('b', { owned_paths: ['src/x.js'] })))).toMatch(/overlapping/);
    expect(T.validateManifest(m(task('a', { owned_paths: ['src/'] }), task('b', { owned_paths: ['src/x.js'], depends_on: ['a'] }))).ok).toBe(true);
    // transitive
    expect(T.validateManifest(m(task('a', { owned_paths: ['src/'] }), task('b', { owned_paths: ['other'], depends_on: ['a'] }), task('c', { owned_paths: ['src/y'], depends_on: ['b'] }))).ok).toBe(true);
    // not a segment prefix
    expect(T.validateManifest(m(task('a', { owned_paths: ['src'] }), task('b', { owned_paths: ['srcx'] }))).ok).toBe(true);
  });
  it('inline only when phase has <= 2 tasks', () => {
    expect(T.validateManifest(m(task('a', { delegate: 'inline', phase: 1 }), task('b', { phase: 1 }))).ok).toBe(true);
    expect(errs(m(task('a', { delegate: 'inline', phase: 1 }), task('b', { phase: 1 }), task('c', { phase: 1 })))).toMatch(/inline/);
    expect(errs(m(task('a', { delegate: 'inline' }), task('b', { phase: 1 }), task('c'), task('d')))).toMatch(/inline/);
    expect(T.validateManifest(m(task('a', { delegate: 'inline' }), task('b', { phase: 1 }), task('c', { phase: 1 }), task('d', { phase: 1 }))).ok).toBe(true);
  });
  it('checks worker against known agents (skippable)', () => {
    const agents = loadAgents();
    expect(T.validateManifest(m(task('a')), { knownAgents: agents }).ok).toBe(true);
    expect(errs(m(task('a', { worker: 'nope' })), { knownAgents: agents })).toMatch(/not a known agent/);
    expect(errs(m(task('a', { worker: 'nope' })), { knownAgents: ['x'] })).toMatch(/not a known agent/);
    expect(T.validateManifest(m(task('a', { worker: 'nope' }))).ok).toBe(true);
  });
  it('lists schema violations', () => { expect(T.validateManifest({ version: 1 }).ok).toBe(false); });
});
