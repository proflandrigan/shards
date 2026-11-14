import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');
const tool = require('../runtime/tools/list_agents.js');
const YAML = require('yaml');
const { tmpDir } = require('./build-fixture.js');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const yamls = fs.readdirSync(path.join(ROOT, 'core/agents')).sort()
  .map((id) => YAML.parse(read(ROOT, 'core/agents', id, 'agent.yaml')));

async function listed() {
  const r = await tool.handler({}, {});
  return r.data.agents;
}
function build(target) {
  const out = tmpDir();
  expect(compile({ target, outDir: out }).errors).toEqual([]);
  return out;
}

describe('E5.8 list_agents matches the registry', () => {
  it('(a) every agent.yaml is reflected exactly', async () => {
    const agents = await listed();
    expect(agents.map((a) => a.id).sort()).toEqual(yamls.map((y) => y.id).sort());
    for (const y of yamls) {
      const a = agents.find((x) => x.id === y.id);
      expect(a.modes).toEqual(y.activation);
      expect(a.activation).toEqual(y.activation);
      expect(a.consult_entries).toEqual(Object.keys(y.consult_entries || {}));
      const consult = y.activation.includes('consult') ? [y.id, ...Object.keys(y.consult_entries || {}).map((e) => `${y.id}-${e}`)] : [];
      const sw = y.activation.includes('switch');
      expect(a.activate.claude).toEqual({ switch: sw ? `/shards:${y.id}` : null, consult });
      expect(a.activate.codex).toEqual({ switch: sw ? `$${y.id}` : null, profile: `shards-${y.id}`, consult });
    }
  });

  it('(b) named switch skills, subagents and profiles exist in the build output', async () => {
    const agents = await listed();
    const co = build('claude');
    const cx = build('codex');
    const cfg = read(cx, '.codex/config.toml');
    for (const a of agents) {
      if (a.activate.claude.switch) expect(fs.existsSync(path.join(co, 'skills', a.id, 'SKILL.md'))).toBe(true);
      if (a.activate.codex.switch) {
        expect(fs.existsSync(path.join(cx, 'skills', a.id, 'SKILL.md'))).toBe(true);
        expect(cfg).toContain(`[profiles.${a.activate.codex.profile}]`);
      }
      for (const n of a.activate.claude.consult) expect(fs.existsSync(path.join(co, 'agents', `${n}.md`))).toBe(true);
      for (const n of a.activate.codex.consult) expect(fs.existsSync(path.join(cx, '.codex/agents', `${n}.toml`))).toBe(true);
    }
  });

  it('(c) emitted agents skill names the fields for each host', () => {
    const co = read(build('claude'), 'skills/agents/SKILL.md');
    const cx = read(build('codex'), 'skills/agents/SKILL.md');
    for (const t of [co, cx]) {
      for (const f of ['id', 'role', 'modes', 'description', 'switch command', 'consult subagents']) expect(t).toContain(f);
      expect(t).toContain('list_agents');
    }
    expect(co).toContain('activate.claude.switch');
    expect(co).toContain('activate.claude.consult');
    expect(cx).toContain('activate.codex.switch');
    expect(cx).toContain('activate.codex.consult');
    expect(cx).toContain('activate.codex.profile');
  });
});
