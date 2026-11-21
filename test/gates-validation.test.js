import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { parseValidationSection, checkValidation } = require('../runtime/lib/validation');
const { Registry } = require('../runtime/registry');
const gateTool = require('../runtime/tools/gate_request');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const { section } = require('./gates-fixture.js');

const codes = (c) => checkValidation(parseValidationSection(c)).map((e) => e.code);

describe('validation library (VALIDATION_SPEC test plan)', () => {
  it('good section passes, with and without Mode', () => {
    expect(codes(section())).toEqual([]);
    expect(codes(section({ mode: null }))).toEqual([]);
  });
  it('missing section / empty content', () => {
    expect(codes('# specs\n\nnothing here')).toEqual(['MISSING_SECTION']);
    expect(codes('')).toEqual(['MISSING_SECTION']);
  });
  it('one case per error code', () => {
    expect(codes(section({ track: null }))).toEqual(['MISSING_TRACK']);
    expect(codes(section({ track: '**Track:** sideways' }))).toEqual(['MISSING_TRACK']);
    expect(codes(section({ mode: '**Mode:**' }))).toEqual(['EMPTY_MODE']);
    expect(codes(section({ checklist: null }))).toEqual(['MISSING_CHECKLIST']);
    expect(codes(section({ rows: [] }))).toEqual(['NO_EVIDENCE_ROWS']);
    expect(codes(section({ rows: ['| AE-01 | | 10 | ✓ | |'] }))).toEqual(['INCOMPLETE_EVIDENCE_ROW']);
    expect(codes(section({ rows: ['| AE-01 | 10 | 10 | ? | |'] }))).toEqual(['INVALID_PASS_FAIL']);
    expect(codes(section({ rows: ['| AE-01 | 10 | 10 |  | |'] }))).toEqual(['INVALID_PASS_FAIL']);
    expect(codes(section({ rows: ['| AE-01 | 10 | 10 | n/a | |'] }))).toEqual(['NA_WITHOUT_JUSTIFICATION']);
    expect(codes(section({ artifacts: null }))).toEqual(['NO_ARTIFACTS']);
    expect(codes(section({ downstream: null }))).toEqual(['NO_DOWNSTREAM']);
    expect(codes(section({ summary: 'too short here' }))).toEqual(['SUMMARY_TOO_SHORT']);
  });
  it('n/a with notes ok; all three pass/fail values ok', () => {
    expect(codes(section({ rows: ['| A | 1 | 1 | n/a | not applicable here |'] }))).toEqual([]);
    expect(codes(section({ rows: ['| A | 1 | 1 | ✓ | |', '| B | 1 | 2 | ✗ | known |', '| C | 1 | 1 | n/a | why |'] }))).toEqual([]);
  });
  it('summary boundary: 19 chars fails, 20 passes', () => {
    expect(codes(section({ summary: 'a'.repeat(19) }))).toEqual(['SUMMARY_TOO_SHORT']);
    expect(codes(section({ summary: 'a'.repeat(20) }))).toEqual([]);
  });
  it('last section wins', () => {
    expect(codes(section({ track: null }) + '\n' + section())).toEqual([]);
    expect(codes(section() + '\n' + section({ track: null }))).toEqual(['MISSING_TRACK']);
  });
});

describe('validation through gate_request', () => {
  let root; let state; let reg; let prev; let core;
  const call = (args) => reg.call('gate_request', args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
  const text = (r) => r.content[1].text;
  const base = (extra) => ({ id: 'data-modeller-phase-3', kind: 'phase', phase: 3, summary: 'phase done', record_ref: 'specs/project-specs.md', ...extra });
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-'));
    core = fs.mkdtempSync(path.join(os.tmpdir(), 'gvc-'));
    const d = path.join(core, 'agents', 'data-modeller'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'agent.yaml'), 'id: data-modeller\ndisplay_name: DM\ndescription: d\nrole: specialist\nactivation: [switch]\noutput_dir: null\n');
    fs.writeFileSync(path.join(d, 'persona-summary.md'), 'p');
    prev = process.env.SHARDS_CORE_DIR; process.env.SHARDS_CORE_DIR = core;
    state = new StateStore(root, 's1');
    await pushFrame(state, { agent: 'data-modeller', project: 'p' });
    reg = new Registry([gateTool]);
    fs.mkdirSync(path.join(root, 'specs'));
  });
  afterEach(() => { if (prev === undefined) delete process.env.SHARDS_CORE_DIR; else process.env.SHARDS_CORE_DIR = prev; });
  const rec = (c) => fs.writeFileSync(path.join(root, 'specs', 'project-specs.md'), c);

  it('failing record: isError, no pending gate, no ::GATE-BLOCK::', async () => {
    rec(section({ rows: [] }));
    const r = await call(base({ validates: 'data-modeller' }));
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('NO_EVIDENCE_ROWS');
    expect(text(r)).toContain('data-modeller/validation_checklist.md');
    expect(text(r)).not.toContain('::GATE-BLOCK::');
    expect(text(r)).not.toContain('.claude/');
    expect(state.read('gates').gates).toEqual({});
  });
  it('good record opens the gate', async () => {
    rec(section());
    const r = await call(base({ validates: 'data-modeller', record_ref: 'specs/project-specs.md#validation' }));
    expect(r.isError).toBeFalsy();
    expect(state.read('gates').gates['data-modeller-phase-3'].status).toBe('pending');
  });
  it('missing record or path escape is an error', async () => {
    expect((await call(base({ validates: 'data-modeller', record_ref: 'nope.md' }))).isError).toBe(true);
    const r = await call(base({ validates: 'data-modeller', record_ref: '../outside.md' }));
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('inside the project root');
  });
  it('validates absent: parser not invoked (missing record is fine)', async () => {
    const r = await call(base({ record_ref: 'does-not-exist.md' }));
    expect(r.isError).toBeFalsy();
    expect(state.read('gates').gates['data-modeller-phase-3']).toBeTruthy();
  });
  it('last Validation section in the record wins through the tool', async () => {
    rec(section({ rows: [] }) + '\n' + section());
    expect((await call(base({ validates: 'data-modeller' }))).isError).toBeFalsy();
  });
});
