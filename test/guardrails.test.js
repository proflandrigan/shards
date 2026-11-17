import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(ROOT, 'hooks', 'pre-tool-use.js');
const gr = require('../runtime/guardrails');
const { parseBinding } = require('../runtime/config/bindings');
const { StateStore } = require('../runtime/state/store');

const S = '22222222-2222-4222-8222-222222222222';
const WRITE = 'mcp__claude_ai_Atlassian__createConfluencePage';
const READ = 'mcp__claude_ai_Atlassian__getConfluencePage';
const CFG = 'version: 1\njobs:\n  record: git\nguardrails:\n  write_tools: [createConfluencePage, "mcp__other__post_*"]\n';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-guard-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

async function setGates(gates) {
  await new StateStore(tmp, S).update('gates', (cur) => { cur.gates = gates; return cur; });
}
function run(tool, input, { host = 'claude-code', env = {} } = {}) {
  const e = { ...process.env, SHARDS_HOST: host, ...env };
  for (const k of ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDECODE', 'CODEX_HOME', 'SHARDS_PROJECT_ROOT']) delete e[k];
  const payload = { session_id: S, cwd: tmp, hook_event_name: 'PreToolUse', permission_mode: 'default', tool_use_id: 't1', tool_name: tool, tool_input: input };
  const r = spawnSync('node', [SHIM], { input: JSON.stringify(payload), cwd: tmp, env: e, encoding: 'utf8' });
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null };
}
const withCfg = (text = CFG) => fs.writeFileSync(path.join(tmp, 'shards.config.yaml'), text);

describe('guardrails policy (unit)', () => {
  it('matches bare names against any server prefix, and globs', () => {
    expect(gr.matchesTool(WRITE, 'createConfluencePage')).toBe(true);
    expect(gr.matchesTool(WRITE, WRITE)).toBe(true);
    expect(gr.matchesTool(READ, 'createConfluencePage')).toBe(false);
    expect(gr.matchesTool('mcp__other__post_comment', 'mcp__other__post_*')).toBe(true);
    expect(gr.matchesTool('Bash', 'Bash')).toBe(true);
  });
  it('loadPolicy reads config write_tools and the configured bindings write_tools, never creating the config', () => {
    const dir = path.join(tmp, 'b'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'wiki.md'), '---\nname: wiki\njobs: [record]\nrequired_settings: []\nexpected_tools: [wiki_get, wiki_put]\nwrite_tools: [wiki_put]\nverbs:\n  record: [record.write]\n---\n## verb: record.write\nx\n');
    expect(gr.loadPolicy(tmp).writeTools).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'shards.config.yaml'))).toBe(false);
    withCfg('version: 1\njobs:\n  record: wiki\nguardrails:\n  write_tools: [extra]\n');
    expect(gr.loadPolicy(tmp, { bindingsDir: dir }).writeTools.sort()).toEqual(['extra', 'wiki_put']);
  });
  it('binding write_tools must be a subset of expected_tools', () => {
    const t = (wt) => `---\nname: wiki\njobs: [record]\nrequired_settings: []\nexpected_tools: [a]\nwrite_tools: [${wt}]\nverbs:\n  record: [record.write]\n---\n## verb: record.write\nx\n`;
    expect(parseBinding(t('a'), 'wiki').ok).toBe(true);
    const bad = parseBinding(t('zzz'), 'wiki');
    expect(bad.ok).toBe(false);
    expect(bad.errors.join()).toMatch(/write_tools entry "zzz"/);
  });
  it('raw-data heuristic: large tables flagged, short summaries not', () => {
    const rows = Array.from({ length: 30 }, (_, i) => `| ${i} | user${i} | ${i * 3} |`).join('\n');
    expect(gr.looksLikeRawData({ body: `| id | name | n |\n|---|---|---|\n${rows}` })).toBe(true);
    expect(gr.looksLikeRawData({ body: Array.from({ length: 30 }, (_, i) => `${i},a,b`).join('\n') })).toBe(true);
    expect(gr.looksLikeRawData({ body: '| a | b |\n|--|--|\n| 1 | 2 |\n| 3 | 4 |' })).toBe(false);
  });
});

describe('PreToolUse external-write guardrail', () => {
  it('config validates guardrails keys', () => {
    const { validateConfig } = require('../runtime/config');
    expect(validateConfig({ version: 1, guardrails: { write_tools: ['x'], allow_raw_data: false } }).ok).toBe(true);
    expect(validateConfig({ version: 1, guardrails: { nope: 1 } }).ok).toBe(false);
  });
  it('does nothing when no write tools are configured (git-only)', () => {
    expect(run(WRITE, { body: 'x' }).out).toBeNull();
  });
  it('claude: write with no gate asks (explicit confirmation); codex: denies', () => {
    withCfg();
    const c = run(WRITE, { body: 'summary' });
    expect(c.out).toMatchObject({ permissionDecision: 'ask' });
    expect(c.out.permissionDecisionReason).toMatch(/explicitly want/);
    const x = run(WRITE, { body: 'summary' }, { host: 'codex' });
    expect(x.out).toMatchObject({ permissionDecision: 'deny' });
  });
  it('marker for a pending or unknown gate is not enough', async () => {
    withCfg();
    await setGates({ g1: { id: 'g1', status: 'pending' } });
    expect(run(WRITE, { body: 'x [shards-gate:g1]' }).out.permissionDecision).toBe('ask');
    expect(run(WRITE, { body: 'x [shards-gate:g1]' }, { host: 'codex' }).out.permissionDecision).toBe('deny');
    expect(run(WRITE, { body: 'x [shards-gate:nope]' }, { host: 'codex' }).out.permissionDecision).toBe('deny');
  });
  it('allowed after a confirmed gate, on both hosts; a mixed marker set still fails', async () => {
    withCfg();
    await setGates({ g1: { id: 'g1', status: 'confirmed' }, g2: { id: 'g2', status: 'pending' } });
    const ok = { title: 'P [shards-gate:g1]', body: 'Decisions: use model A.' };
    expect(run(WRITE, ok).out).toBeNull();
    expect(run(WRITE, ok, { host: 'codex' }).out).toBeNull();
    expect(run('mcp__other__post_comment', { text: '[shards-gate:g1]' }, { host: 'codex' }).out).toBeNull();
    expect(run(WRITE, { body: '[shards-gate:g1] [shards-gate:g2]' }, { host: 'codex' }).out.permissionDecision).toBe('deny');
  });
  it('read tools and non-matching tools are untouched', () => {
    withCfg();
    expect(run(READ, {}).out).toBeNull();
    expect(run('mcp__x__other', {}).out).toBeNull();
  });
  it('raw query results are denied even with a confirmed gate; allow_raw_data lifts it', async () => {
    withCfg();
    await setGates({ g1: { id: 'g1', status: 'confirmed' } });
    const rows = Array.from({ length: 40 }, (_, i) => `| ${i} | user${i} | ${i} |`).join('\n');
    const input = { body: `[shards-gate:g1]\n${rows}` };
    const r = run(WRITE, input);
    expect(r.out.permissionDecision).toBe('deny');
    expect(r.out.permissionDecisionReason).toMatch(/summary/);
    withCfg(`${CFG}  allow_raw_data: true\n`);
    expect(run(WRITE, input).out).toBeNull();
  });
  it('denials are logged as violations; SHARDS_GUARDRAILS=0 disables', () => {
    withCfg();
    run(WRITE, { body: 'x' }, { host: 'codex' });
    const log = fs.readFileSync(path.join(tmp, '.shards', 'state', 'gate-violations.jsonl'), 'utf8');
    expect(log).toMatch(/external_write_no_gate/);
    expect(run(WRITE, { body: 'x' }, { host: 'codex', env: { SHARDS_GUARDRAILS: '0' } }).out).toBeNull();
  });
});
