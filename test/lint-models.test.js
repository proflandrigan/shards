import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lint, lintCore, lintAdapters } = require('../scripts/lint-models.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'lintm-')); }
function put(root, rel, text) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }

describe('lint-models', () => {
  it('passes on the real core/', () => {
    expect(lintCore(path.resolve(__dirname, '../core'))).toEqual([]);
  });
  it('flags model: and literal ids in AGENT.md frontmatter, not in the body', () => {
    const r = tmp();
    put(r, 'agents/a/AGENT.md', '---\nname: a\nmodel: opus-4.8\n---\nBody mentions claude-sonnet-4-6 as an example.\n');
    const f = lintCore(r);
    expect(f.length).toBeGreaterThanOrEqual(2);
    expect(f.every((x) => x.line === 3)).toBe(true);
  });
  it('flags ids in agent.yaml but allows model_tier', () => {
    const r = tmp();
    put(r, 'agents/a/agent.yaml', 'id: a\nmodel_tier: fast\n');
    expect(lintCore(r)).toEqual([]);
    put(r, 'agents/a/agent.yaml', 'id: a\nmodel: gpt-4o\n');
    expect(lintCore(r).length).toBeGreaterThan(0);
  });
  it('flags gemini and dated ids', () => {
    const r = tmp();
    put(r, 'agents/a/agent.yaml', 'id: a\nx: gemini-2.5-pro\ny: foo-20250101\n');
    expect(lintCore(r).length).toBe(2);
  });
  it('scans adapter manifests and frontmatter but not content/ prose', () => {
    const r = tmp();
    put(r, 'agents/a.md', '---\nname: a\n---\nprose with haiku example\n');
    put(r, 'content/agents/a/AGENT.md', 'claude-sonnet-4-6 example\n');
    put(r, '.codex/agents/a.toml', 'name = "a"\nmodel = "gpt-5"\n');
    const f = lintAdapters(r);
    expect(f.every((x) => x.file.endsWith('a.toml'))).toBe(true);
    expect(f.length).toBeGreaterThan(0);
  });
  it('lint() with both roots is clean for a clean tree', () => {
    const r = tmp();
    put(r, 'core/agents/a/AGENT.md', '---\nname: a\n---\nhi\n');
    expect(lint({ core: path.join(r, 'core'), adapters: path.join(r, 'adapters') })).toEqual([]);
  });
  it('does not treat path components as model ids (e.g. a /tmp/claude-502/ checkout)', () => {
    const r = tmp();
    put(r, '.mcp.json', JSON.stringify({ mcpServers: { shards: { command: 'node', args: ['/private/tmp/claude-502/x/runtime/server.js'] } } }, null, 2));
    put(r, '.codex/config.toml', 'command = "node"\nargs = ["/tmp/claude-502/runtime/server.js", "C:\\\\Users\\\\gpt-dev\\\\server.js"]\ncwd = "./opus-dir/x"\n');
    put(r, 'hooks/hooks.json', JSON.stringify({ hooks: { Stop: [{ command: 'node "/Users/me/claude-sonnet-4/hooks/x.js" --host codex' }] } }, null, 2));
    expect(lintAdapters(r)).toEqual([]);
    // a bare id, or a vendor/model token that is not path-shaped, is still caught
    put(r, 'hooks/hooks.json', '{"x": "anthropic/claude-sonnet-4", "y": "/tmp/ok"}\n');
    put(r, '.mcp.json', '{"env": {"M": "claude-opus-4"}}\n');
    const files = new Set(lintAdapters(r).map((x) => path.basename(x.file)));
    expect([...files].sort()).toEqual(['.mcp.json', 'hooks.json']);
  });
});
