import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseStream, scoreSwitch, summarize, plan, ALLOWED } = require('../scripts/eval/switch-eval.js');

const P = 'mcp__plugin_shards_shards__';
const ev = (o) => JSON.stringify(o);
const asst = (...blocks) => ev({ type: 'assistant', message: { content: blocks } });
const use = (name, input) => ({ type: 'tool_use', id: 'x', name, input });
const good = ['not json', ev({ type: 'system' }), asst({ type: 'text', text: 'hi' }), asst(use(`${P}activate`, { agent: 'data-analyst', mode: 'switch' })), ev({ type: 'result', is_error: false, subtype: 'success' })].join('\n');

describe('switch-eval', () => {
  it('parses activate calls', () => {
    const p = parseStream(good);
    expect(p.activations).toEqual([{ name: `${P}activate`, agent: 'data-analyst', mode: 'switch' }]);
    expect(p.result).toEqual({ is_error: false, subtype: 'success' });
  });
  it('scores pass, wrong agent, wrong mode and no call', () => {
    expect(scoreSwitch(parseStream(good), 'data-analyst').pass).toBe(true);
    const wrong = scoreSwitch(parseStream(good), 'syn');
    expect(wrong.pass).toBe(false);
    expect(wrong.wrongAgent).toEqual(['data-analyst']);
    const consult = asst(use(`${P}activate`, { agent: 'syn', mode: 'consult' }));
    expect(scoreSwitch(parseStream(consult), 'syn').pass).toBe(false);
    const none = scoreSwitch(parseStream(asst(use('Bash', {}))), 'syn');
    expect(none.activated).toBe(false);
  });
  it('first call must be right for firstCallCorrect', () => {
    const t = [asst(use(`${P}activate`, { agent: 'x', mode: 'switch' })), asst(use(`${P}activate`, { agent: 'syn', mode: 'switch' }))].join('\n');
    const s = scoreSwitch(parseStream(t), 'syn');
    expect(s.pass).toBe(true);
    expect(s.firstCallCorrect).toBe(false);
    expect(summarize([s, scoreSwitch(parseStream(good), 'data-analyst')])).toEqual({ syn: { runs: 1, pass: 1, firstCallCorrect: 0 }, 'data-analyst': { runs: 1, pass: 1, firstCallCorrect: 1 } });
  });
  it('plan scopes tools and never skips permissions', () => {
    const r = plan({ agents: ['syn'], runs: 2, pluginDir: '/p' });
    expect(r).toHaveLength(2);
    expect(r[0].args).toContain('/shards:syn');
    expect(r[0].args.join(' ')).not.toMatch(/dangerously/);
    expect(r[0].args[r[0].args.indexOf('--allowedTools') + 1]).toBe(ALLOWED.join(','));
    expect(ALLOWED).toEqual([`${P}activate`, `${P}active`, `${P}return`]);
  });
});
