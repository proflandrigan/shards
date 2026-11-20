import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  ChatSession,
  buildClaudeArgs,
  STUDIO_ALLOWED_RUNTIME_TOOLS,
  STUDIO_EXCLUDED_RUNTIME_TOOLS,
  SHARDS_MCP_PREFIXES,
} = require('../chat-session.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.resolve(here, '../../../runtime/tools');

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe('buildClaudeArgs', () => {
  it('does not pass --agent for a v2 core agent', () => {
    const args = buildClaudeArgs({ agent: 'data-analyst', agentSource: 'core', sessionId: 's1' });
    expect(args).not.toContain('--agent');
    expect(flagValue(args, '--session-id')).toBe('s1');
    expect(flagValue(args, '--permission-mode')).toBe('acceptEdits');
  });

  it('passes --agent for a legacy v1 agent', () => {
    const args = buildClaudeArgs({ agent: 'data-analyst', agentSource: 'legacy', sessionId: 's1' });
    expect(flagValue(args, '--agent')).toBe('data-analyst');
  });

  it('ChatSession defaults to core (no --agent) when the source is unknown', () => {
    const s = new ChatSession({ agent: 'syn', sessionId: 's2' });
    expect(s.buildArgs()).not.toContain('--agent');
    const legacy = new ChatSession({ agent: 'syn', agentSource: 'legacy', sessionId: 's2' });
    expect(flagValue(legacy.buildArgs(), '--agent')).toBe('syn');
  });

  it('allows activate under both prefixes and never the human-in-the-loop gate tools', () => {
    for (const source of ['core', 'legacy']) {
      const allowed = flagValue(buildClaudeArgs({ agent: 'syn', agentSource: source }), '--allowedTools').split(',');
      expect(allowed).toContain('mcp__plugin_shards_shards__activate');
      expect(allowed).toContain('mcp__shards__activate');
      expect(allowed).toContain('mcp__plugin_shards_shards__gate_request');
      expect(allowed).toContain('mcp__plugin_shards_shards__load_phase');
      for (const t of ['gate_advance', 'gate_confirm', 'gate_force_close']) {
        for (const p of SHARDS_MCP_PREFIXES) expect(allowed).not.toContain(p + t);
      }
    }
  });

  it('forks with --resume and omits --session-id', () => {
    const args = buildClaudeArgs({ agent: 'syn', sessionId: 's1', resumeSessionId: 'old' });
    expect(flagValue(args, '--resume')).toBe('old');
    expect(args).toContain('--fork-session');
    expect(args).not.toContain('--session-id');
  });

  it('every runtime tool is classified exactly once', () => {
    const names = fs.readdirSync(toolsDir)
      .filter((f) => f.endsWith('.js') && f !== 'index.js')
      .flatMap((f) => [...fs.readFileSync(path.join(toolsDir, f), 'utf8').matchAll(/^\s*name:\s*'([a-z_]+)'/gm)].map((m) => m[1]));
    expect(names.length).toBeGreaterThan(0);
    const allowed = new Set(STUDIO_ALLOWED_RUNTIME_TOOLS);
    const excluded = new Set(STUDIO_EXCLUDED_RUNTIME_TOOLS);
    for (const n of names) expect(allowed.has(n) !== excluded.has(n), `${n} must be in exactly one list`).toBe(true);
    for (const n of [...allowed, ...excluded]) expect(names, `${n} is not a runtime tool`).toContain(n);
  });
});

describe('ChatSession._parseLine permission_denied', () => {
  it('emits chat-permission-denied', () => {
    const events = [];
    const s = new ChatSession({ agent: 'syn', sessionId: 'sess-1', onEvent: (e) => events.push(e) });
    s._parseLine(JSON.stringify({
      type: 'system', subtype: 'permission_denied',
      tool_name: 'mcp__plugin_shards_shards__activate',
      message: "you haven't granted it yet",
    }));
    expect(events).toEqual([{
      type: 'chat-permission-denied',
      tool: 'mcp__plugin_shards_shards__activate',
      message: "you haven't granted it yet",
      sessionId: 'sess-1',
    }]);
  });
});
