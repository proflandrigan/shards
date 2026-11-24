import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { parseStream, scorePrompt, validatePrompts, buildArgs, parseCli } = require('../scripts/eval/router-eval.js');

const P = 'mcp__plugin_shards_shards__';
const line = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }, { type: 'tool_use', id: 't', name, input }] } });
const stream = (...ls) => ['{"type":"system","subtype":"init"}', 'not json', ...ls, '{"type":"result"}'].join('\n');

describe('parseStream', () => {
  it('extracts shards tool calls only', () => {
    const calls = parseStream(stream(line(P + 'activate', { agent: 'ml-engineer', mode: 'switch' }), line('Bash', { command: 'ls' }), line(P + 'gate_confirm', {}), line(P + 'return', {})));
    expect(calls).toEqual([{ tool: 'activate', input: { agent: 'ml-engineer', mode: 'switch' } }, { tool: 'return', input: {} }]);
  });
  it('tolerates empty and garbage', () => {
    expect(parseStream('')).toEqual([]);
    expect(parseStream(undefined)).toEqual([]);
    expect(parseStream('{broken')).toEqual([]);
  });
});

describe('scorePrompt', () => {
  const act = (agent, mode = 'switch') => ({ tool: 'activate', input: { agent, mode } });
  it('activate matches agent+mode', () => {
    const e = { tool: 'activate', agent: 'data-modeller', mode: 'switch' };
    expect(scorePrompt(e, [act('data-modeller')]).pass).toBe(true);
    expect(scorePrompt(e, [act('data-engineer')]).pass).toBe(false);
    expect(scorePrompt(e, [act('data-modeller', 'consult')]).pass).toBe(false);
    expect(scorePrompt(e, []).pass).toBe(false);
    expect(scorePrompt(e, [act('data-modeller'), act('ml-engineer')]).pass).toBe(false);
  });
  it('return with and without to', () => {
    expect(scorePrompt({ tool: 'return', to: 'syn' }, [{ tool: 'return', input: { to: 'syn' } }]).pass).toBe(true);
    expect(scorePrompt({ tool: 'return', to: 'syn' }, [{ tool: 'return', input: {} }]).pass).toBe(false);
    expect(scorePrompt({ tool: 'return' }, [{ tool: 'return', input: {} }]).pass).toBe(true);
    expect(scorePrompt({ tool: 'return' }, [{ tool: 'return', input: { to: 'syn' } }]).pass).toBe(false);
  });
  it('active and list_agents', () => {
    expect(scorePrompt({ tool: 'active' }, [{ tool: 'active', input: {} }]).pass).toBe(true);
    expect(scorePrompt({ tool: 'list_agents' }, [{ tool: 'active', input: {} }]).pass).toBe(false);
  });
  it('consult-only must not switch', () => {
    const e = { tool: 'none', kind: 'consult' };
    expect(scorePrompt(e, []).pass).toBe(true);
    expect(scorePrompt(e, [act('researcher', 'consult')]).pass).toBe(true);
    expect(scorePrompt(e, [act('researcher')]).pass).toBe(false);
  });
  it('clarify means no routing tool at all', () => {
    const e = { tool: 'none', kind: 'clarify' };
    expect(scorePrompt(e, []).pass).toBe(true);
    expect(scorePrompt(e, [act('ml-engineer')]).pass).toBe(false);
  });
});

describe('prompts.json and cli', () => {
  const prompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'router/prompts.json'), 'utf8'));
  const ids = fs.readdirSync(path.join(__dirname, '../core/agents'));
  it('is valid and covers the required categories', () => {
    expect(validatePrompts(prompts, ids)).toEqual([]);
    const tools = new Set(prompts.map((p) => p.expect.tool));
    for (const t of ['activate', 'return', 'active', 'list_agents', 'none']) expect(tools.has(t)).toBe(true);
    expect(prompts.filter((p) => p.expect.kind === 'consult')).toHaveLength(2);
    expect(prompts.filter((p) => p.expect.kind === 'clarify')).toHaveLength(1);
  });
  it('validation rejects bad data', () => {
    expect(validatePrompts(prompts.slice(1), ids).length).toBeGreaterThan(0);
  });
  it('builds scoped args without dangerous flags', () => {
    const a = buildArgs('hi', '/p', 'agent');
    expect(a).toContain('--allowedTools');
    expect(a.join(' ')).not.toMatch(/dangerously/);
    expect(a.join(' ')).toContain('--output-format stream-json --verbose');
    expect(buildArgs('hi', '/p', 'skill')[1]).toBe('/shards:syn hi');
  });
  it('parses cli', () => {
    expect(parseCli(['--runs', '3', '--limit', '5', '--dry-run'])).toMatchObject({ runs: 3, limit: 5, dryRun: true });
    expect(() => parseCli(['--bogus'])).toThrow();
  });
});
