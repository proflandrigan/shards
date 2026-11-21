import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const tasksSchema = require('../core/schema/tasks.schema.json');
const resultSchema = require('../core/schema/task-result.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
const vt = ajv.compile(tasksSchema);
const vr = ajv.compile(resultSchema);
const task = (o = {}) => ({ id: 't1', goal: 'g', plan_ref: 'project-specs.md#p', inputs: [], owned_paths: ['a/'], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const result = (o = {}) => ({ status: 'done', files_changed: [], check: { command: 'c', exit_code: 0, output_excerpt: '' }, deviations: [], open_questions: [], ...o });

describe('tasks.schema.json', () => {
  it('accepts a minimal manifest', () => { expect(vt({ version: 1, tasks: [task()] })).toBe(true); });
  it('accepts optional fields', () => { expect(vt({ version: 1, tasks: [task({ phase: 5, delegate: 'inline', depends_on: [] })] })).toBe(true); });
  it('rejects bad shapes', () => {
    for (const bad of [
      { version: 2, tasks: [task()] }, { version: 1, tasks: [] }, { version: 1, tasks: [task({ id: 'T1' })] },
      { version: 1, tasks: [task({ size: 61 })] }, { version: 1, tasks: [task({ size: 0 })] },
      { version: 1, tasks: [task({ owned_paths: [] })] }, { version: 1, tasks: [task({ acceptance: { command: '', expected: 'x' } })] },
      { version: 1, tasks: [task({ acceptance: { command: 'x' } })] }, { version: 1, tasks: [task({ delegate: 'x' })] },
      { version: 1, tasks: [task({ extra: 1 })] }, { version: 1, tasks: [{ ...task(), goal: undefined }] }, { version: 1, tasks: [task()], x: 1 },
    ]) expect(vt(bad)).toBe(false);
  });
});

describe('task-result.schema.json', () => {
  it('accepts a valid result', () => { expect(vr(result())).toBe(true); });
  it('rejects bad results', () => {
    for (const bad of [result({ status: 'ok' }), result({ deviations: [''] }), result({ extra: 1 }), result({ check: { command: 'c', exit_code: '0', output_excerpt: '' } }), (() => { const r = result(); delete r.open_questions; return r; })()]) expect(vr(bad)).toBe(false);
  });
});
