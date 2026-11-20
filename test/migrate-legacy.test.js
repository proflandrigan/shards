import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const { run } = require('../cli/commands/migrate');
const { importLegacyGateHistory, NOTES_REF } = require('../runtime/gates/legacy-import');
const { stripClaudeMd, filterHooks } = require('../cli/commands/migrate-legacy');
const { buildLegacyProject, MANIFEST_FILES, HOOK_ENTRIES } = require('./fixtures/legacy-install');
const { StateStore } = require('../runtime/state/store');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-legacy-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function migrate(args = []) {
  const out = []; const err = [];
  const lo = console.log; const le = console.error;
  console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => err.push(a.join(' '));
  try { const code = await run(['--root', tmp, ...args]); return { code, out: out.join('\n'), err: err.join('\n') }; } finally { console.log = lo; console.error = le; }
}
const exists = (rel) => fs.existsSync(path.join(tmp, rel));
const read = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
function tree(dir = tmp, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) tree(f, acc); else acc.push(path.relative(tmp, f) + ':' + fs.readFileSync(f, 'utf8').length);
  }
  return acc.sort();
}
const gates = () => new StateStore(tmp, 'legacy-import').read('gates').gates;

describe('stripClaudeMd fences', () => {
  it('a heading inside a code fence does not end the skip; a following h1 survives', () => {
    const md = ['# P', '', '## Shards — Agent Suite', 'text', '```', '## not a heading', '```', 'more v1 text', '~~~', '# also not', '~~~', '', '# Keep me', 'user content', ''].join('\n');
    const r = stripClaudeMd(md);
    expect(r.removed).toBe(1);
    expect(r.text).not.toContain('not a heading');
    expect(r.text).not.toContain('more v1 text');
    expect(r.text).not.toContain('also not');
    expect(r.text).toContain('# Keep me\nuser content');
  });

  it('an unclosed fence in a v1 block does not swallow the following heading, user text or v2 markers', () => {
    const md = ['# Project', '', '## Shards — Agent Suite', 'some text', '```bash', 'npx shards', '', '## My own notes', 'keep me', '<!-- shards:begin x -->', 'v2', '<!-- shards:end x -->'].join('\n');
    const r = stripClaudeMd(md);
    expect(r.removed).toBe(1);
    expect(r.text).not.toContain('some text');
    expect(r.text).toContain('## My own notes\nkeep me');
    expect(r.text).toContain('<!-- shards:begin x -->\nv2\n<!-- shards:end x -->');
  });

  it('an unclosed fence open at EOF falls back to ending the block at the next heading', () => {
    const md = ['# P', '## Shards — Agent Suite', '```bash', 'npx x', '', '## notes', 'keep'].join('\n');
    const r = stripClaudeMd(md);
    expect(r.removed).toBe(1);
    expect(r.text).not.toContain('npx x');
    expect(r.text).toContain('## notes\nkeep');
  });
});

describe('shards migrate (full)', () => {
  for (const fmt of ['single-slot', 'v2-sessions']) {
    it(`migrates a legacy fixture cleanly (${fmt} gate state) and re-run is a no-op`, async () => {
      buildLegacyProject(tmp, { gateState: fmt });
      const r = await migrate();
      expect(r.code).toBe(0);

      // manifest-recorded files gone, manifest gone
      for (const f of MANIFEST_FILES) expect(exists(f)).toBe(false);
      expect(exists('.claude/.shards-manifest.json')).toBe(false);
      expect(exists('.shards/hooks')).toBe(false);
      // unknown / user files kept
      expect(exists('.claude/agents/my-own-agent.md')).toBe(true);
      expect(exists('.shards/ui/user-notes.txt')).toBe(true);
      expect(exists('analysis/churn/project-specs.md')).toBe(true);
      expect(exists('studies/s1/report.md')).toBe(true);
      // empty dirs pruned, non-empty kept
      expect(exists('.claude/commands')).toBe(false);
      expect(exists('.shards/ui/js')).toBe(false);
      // ledger kept + exported
      expect(exists('.shards/knowledge/INDEX.md')).toBe(true);
      expect(exists('docs/knowledge/INDEX.md')).toBe(true);

      // settings: legacy hooks gone, user hooks and permissions preserved
      const s = JSON.parse(read('.claude/settings.json'));
      const cmds = JSON.stringify(s.hooks);
      expect(cmds).not.toMatch(/gate-hook|ui-push|relay/);
      expect(cmds).toContain('user-stop-hook');
      expect(cmds).toContain('user-prompt-hook');
      expect(s.hooks.PreToolUse).toBeUndefined();
      expect(s.hooks.PostToolUse).toBeUndefined();
      expect(s.permissions.allow).toEqual(['Bash(git status:*)']);

      // CLAUDE.md: Shards blocks gone, user content kept
      const md = read('CLAUDE.md');
      expect(md).not.toContain('Shards —');
      expect(md).toContain('User notes that must survive');
      expect(md).toContain('## My Own Section');
      expect(md).toContain('Keep me too.');

      // gate history preserved in runtime state
      const g = gates();
      expect(Object.keys(g)).toHaveLength(5);
      expect(g['ml-engineer-phase-0'].status).toBe('confirmed'); // from gates.jsonl only
      expect(g['ml-engineer-phase-0'].proof.tier).toBe('legacy-import');
      if (fmt === 'single-slot') {
        expect(g['data-analyst-phase-1'].status).toBe('confirmed');
        expect(g['data-analyst-phase-2'].kind).toBe('final');
        expect(g['data-analyst-phase-2'].requested_at).toBe('2026-05-03T09:10:00.000Z');
        expect(g['data-analyst-phase-2'].decided_at).toBe('2026-05-03T09:20:00.000Z');
        expect(g['data-analyst-phase-3'].status).toBe('changes_requested'); // was open
        expect(g['syn-phase-0'].status).toBe('confirmed'); // from gates.jsonl only
      } else {
        expect(g['ml-engineer-phase-1'].status).toBe('confirmed');
        expect(g['ml-engineer-phase-1.2'].status).toBe('confirmed'); // duplicate id kept
        expect(g['syn-phase-0'].kind).toBe('phase'); // unknown kind normalized
        expect(g['syn-phase-0'].proof.user).toBe('force-close');
        expect(g['ml-engineer-phase-2'].status).toBe('changes_requested');
        expect(g['ml-engineer-phase-2'].legacy.session).toBe('sess-a');
      }
      // verbatim event log + archive
      expect(exists('.shards/state/sessions/legacy-import/legacy-gates.jsonl')).toBe(true);
      expect(exists('.shards/gates/state.json')).toBe(false);
      expect(exists('.shards/archive/legacy-gates/state.json')).toBe(true);
      expect(exists('.shards/archive/legacy-gates/gates.jsonl')).toBe(true);
      expect(exists('.shards/archive/legacy-gates/violations.jsonl')).toBe(true);
      // git note on HEAD, branch untouched
      const note = execFileSync('git', ['notes', '--ref', NOTES_REF, 'show', 'HEAD'], { cwd: tmp, encoding: 'utf8' });
      expect(note).toContain('Shards-Legacy-Gate: ml-engineer-phase-0');
      expect(note.match(/Shards-Legacy-Gate:/g)).toHaveLength(5);
      expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim()).toBe('1');

      // skipped report mentions nothing destructive; re-run is a no-op
      const before = tree();
      const stateBefore = JSON.stringify(gates());
      const r2 = await migrate();
      expect(r2.code).toBe(0);
      expect(r2.out).toContain('nothing to do');
      expect(tree()).toEqual(before);
      expect(JSON.stringify(gates())).toBe(stateBefore);
    });
  }

  it('--dry-run reports the plan and writes nothing', async () => {
    buildLegacyProject(tmp, { gateState: 'v2-sessions' });
    const before = tree();
    const r = await migrate(['--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('would remove .claude/agents/syn.md');
    expect(r.out).toContain('would import 5 gate(s)');
    expect(tree()).toEqual(before);
    expect(exists('.shards/state')).toBe(false);
    expect(exists('docs/knowledge')).toBe(false);
  });

  it('never deletes user-modified manifest files and reports them as skipped', async () => {
    buildLegacyProject(tmp, { gateState: 'none' });
    const f = path.join(tmp, '.claude/commands/shards.md');
    fs.writeFileSync(f, 'my customised command\n');
    const future = new Date(Date.parse('2026-05-01T00:00:00.000Z') + 3600e3);
    fs.utimesSync(f, future, future);
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIPPED \.claude\/commands\/shards\.md: modified after install/);
    expect(read('.claude/commands/shards.md')).toBe('my customised command\n');
    // manifest rewritten to keep the skipped file; second run still safe and stable
    const m = JSON.parse(read('.claude/.shards-manifest.json'));
    expect(m.files).toEqual(['.claude/commands/shards.md']);
    const before = tree();
    const r2 = await migrate();
    expect(r2.code).toBe(0);
    expect(tree()).toEqual(before);
    expect(read('.claude/commands/shards.md')).toBe('my customised command\n');
  });

  it('fresh clone (all mtimes reset): git provenance shows files are pristine, so they are removed', async () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-src-'));
    try {
      buildLegacyProject(src, { gateState: 'none' });
      // a file the user edited and committed after install must still be kept
      fs.writeFileSync(path.join(src, 'templates/project-specs.md'), 'my edited template\n');
      execFileSync('git', ['commit', '-qam', 'edit template'], { cwd: src });
      fs.rmSync(tmp, { recursive: true, force: true });
      execFileSync('git', ['clone', '-q', src, tmp]);
      const r = await migrate();
      expect(r.code).toBe(0);
      for (const f of MANIFEST_FILES.filter((x) => x !== 'templates/project-specs.md')) expect(exists(f)).toBe(false);
      expect(read('templates/project-specs.md').replace(/\r\n/g, '\n')).toBe('my edited template\n'); // git may check out CRLF on Windows
      expect(r.out).toMatch(/SKIPPED templates\/project-specs\.md: modified after install/);
      expect(r.err).not.toContain('WARNING');
    } finally { fs.rmSync(src, { recursive: true, force: true }); }
  });

  it('copy without git (all mtimes new): warns loudly, removes nothing; --force removes them', async () => {
    buildLegacyProject(tmp, { gateState: 'none', git: false });
    const now = new Date();
    for (const f of MANIFEST_FILES) fs.utimesSync(path.join(tmp, f), now, now);
    const r = await migrate();
    expect(r.code).toBe(0);
    for (const f of MANIFEST_FILES) expect(exists(f)).toBe(true);
    expect(r.err).toContain(`WARNING: all ${MANIFEST_FILES.length} file(s)`);
    expect(r.err).toContain('--force');
    expect(r.out).not.toContain('already migrated');
    const r2 = await migrate(['--force']);
    expect(r2.code).toBe(0);
    for (const f of MANIFEST_FILES) expect(exists(f)).toBe(false);
    expect(r2.out).toContain('(changed after install; --force)');
    expect(exists('.claude/.shards-manifest.json')).toBe(false);
  });

  it('keeps user hooks that merely look similar (manifest hookEntries are exact)', async () => {
    buildLegacyProject(tmp, { gateState: 'none' });
    const sf = path.join(tmp, '.claude/settings.json');
    const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
    s.hooks.Stop.push({ hooks: [{ type: 'command', command: 'node scripts/webhook-relay.js' }, { type: 'command', command: 'bash ui-push-notify.sh' }] });
    fs.writeFileSync(sf, JSON.stringify(s));
    const r = await migrate();
    expect(r.code).toBe(0);
    const cmds = JSON.stringify(JSON.parse(read('.claude/settings.json')).hooks);
    expect(cmds).toContain('webhook-relay.js');
    expect(cmds).toContain('ui-push-notify.sh');
    expect(cmds).not.toContain('.shards/hooks/gate-hook.js');
  });

  it('re-run keeps an unrecorded v1-looking hook the first run kept (rewritten manifest keeps hookEntries)', async () => {
    buildLegacyProject(tmp, { gateState: 'none' });
    // one edited file keeps the manifest alive (rewritten) after the first run
    const f = path.join(tmp, '.claude/commands/shards.md');
    fs.writeFileSync(f, 'my customised command\n');
    const future = new Date(Date.parse('2026-05-01T00:00:00.000Z') + 3600e3);
    fs.utimesSync(f, future, future);
    const sf = path.join(tmp, '.claude/settings.json');
    const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const mine = 'node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js my-notifier';
    s.hooks.Stop.push({ hooks: [{ type: 'command', command: mine }] });
    fs.writeFileSync(sf, JSON.stringify(s));
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toContain('hook not recorded in the install manifest, kept');
    expect(read('.claude/settings.json')).toContain(mine);
    const before = tree();
    const r2 = await migrate();
    expect(r2.code).toBe(0);
    expect(read('.claude/settings.json')).toContain(mine);
    expect(tree()).toEqual(before);
  });

  it('ignores manifest paths that escape the project root', async () => {
    buildLegacyProject(tmp, { gateState: 'none' });
    const outside = path.join(os.tmpdir(), `migrate-outside-${process.pid}.txt`);
    fs.writeFileSync(outside, 'keep');
    try {
      const mf = path.join(tmp, '.claude/.shards-manifest.json');
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      m.files.push('../' + path.basename(outside), outside);
      fs.writeFileSync(mf, JSON.stringify(m));
      const r = await migrate();
      expect(r.out).toContain('unsafe path in manifest');
      expect(fs.readFileSync(outside, 'utf8')).toBe('keep');
    } finally { fs.rmSync(outside, { force: true }); }
  });

  it('works without a manifest: gate import and CLAUDE.md still run, nothing else is deleted', async () => {
    buildLegacyProject(tmp, { gateState: 'single-slot' });
    fs.rmSync(path.join(tmp, '.claude/.shards-manifest.json'));
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toContain('no readable install manifest');
    expect(exists('.claude/agents/syn.md')).toBe(true);
    expect(Object.keys(gates())).toHaveLength(5);
    expect(read('CLAUDE.md')).not.toContain('Shards —');
    expect(JSON.stringify(JSON.parse(read('.claude/settings.json')).hooks)).not.toMatch(/gate-hook/);
  });

  it('imports gate history without a git repo (note skipped, state still written)', async () => {
    buildLegacyProject(tmp, { gateState: 'v2-sessions', git: false });
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toContain('git note: skipped');
    expect(Object.keys(gates())).toHaveLength(5);
  });

  it('corrupt state.json is left in place and fails loudly', async () => {
    buildLegacyProject(tmp, { gateState: 'single-slot' });
    fs.writeFileSync(path.join(tmp, '.shards/gates/state.json'), '{ not json');
    const r = await migrate();
    expect(r.code).toBe(1);
    expect(r.err).toContain('state.json: corrupt JSON');
    expect(read('.shards/gates/state.json')).toBe('{ not json');
    expect(exists('.shards/state')).toBe(false);
  });

  it('refuses to run in the shards source repo', async () => {
    fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'core', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'tools/install.js'), '');
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    const r = await migrate();
    expect(r.code).toBe(2);
    expect(r.err).toContain('source repository');
  });

  it('a project with nothing legacy is a clean no-op', async () => {
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toContain('nothing to do');
  });

  it('--export-ledger alone still only exports the ledger', async () => {
    buildLegacyProject(tmp, { gateState: 'single-slot' });
    const r = await migrate(['--export-ledger']);
    expect(r.code).toBe(0);
    expect(exists('docs/knowledge/INDEX.md')).toBe(true);
    expect(exists('.claude/agents/syn.md')).toBe(true);
    expect(exists('.shards/gates/state.json')).toBe(true);
  });
});

describe('importLegacyGateHistory (E11.11)', () => {
  it('is repeatable when the archive step is bypassed: second import adds nothing', async () => {
    buildLegacyProject(tmp, { gateState: 'v2-sessions' });
    const first = await importLegacyGateHistory({ root: tmp, notes: false });
    expect(first.imported).toBe(5);
    // restore sources from the archive and import again
    fs.mkdirSync(path.join(tmp, '.shards/gates'), { recursive: true });
    for (const f of ['state.json', 'gates.jsonl']) fs.copyFileSync(path.join(tmp, '.shards/archive/legacy-gates', f), path.join(tmp, '.shards/gates', f));
    const second = await importLegacyGateHistory({ root: tmp, notes: false });
    expect(second.imported).toBe(0);
    expect(second.skippedExisting).toBe(5);
    expect(Object.keys(gates())).toHaveLength(5);
  });

  it('returns found:false when there are no legacy gate files', async () => {
    const r = await importLegacyGateHistory({ root: tmp });
    expect(r.found).toBe(false);
  });
});

describe('stripClaudeMd', () => {
  it('removes only the Shards blocks', () => {
    const { text, removed } = stripClaudeMd('# A\n\n## Shards — Agent Suite\nx\n### sub\ny\n\n## Keep\nz\n\n## Shards — Tool-call conventions\nq\n');
    expect(removed).toBe(2);
    expect(text).toContain('## Keep\nz');
    expect(text).not.toContain('sub');
    expect(text).not.toContain('q');
  });

  it('keeps user content after a block that ends at a "# " heading', () => {
    const { text, removed } = stripClaudeMd('# A\n\n## Shards — Agent Suite\nx\n### sub\ny\n\n# Appendix\nuser text\n');
    expect(removed).toBe(1);
    expect(text).toContain('# Appendix\nuser text');
    expect(text).not.toContain('sub');
  });

  it('keeps plain text appended after the v1 block\'s known last line', () => {
    const md = '# A\n\n## Shards — Tool-call conventions\n\n### What is unusual\n- x\n\nThese cases are not part of routine Shards workflow and should prompt for\nexplicit user approval regardless of permission mode.\n\nMy own trailing note.\n';
    const { text, removed } = stripClaudeMd(md);
    expect(removed).toBe(1);
    expect(text).toContain('My own trailing note.');
    expect(text).not.toContain('What is unusual');
    expect(text).not.toContain('regardless of permission mode');
  });

  it('never touches a v2 marker region (shards install --claude-md), so --remove still works', () => {
    const v2 = '<!-- shards:begin conventions v1 -->\n## Shards — Tool-call conventions\n\n### File writes\nbody\n<!-- shards:end conventions -->';
    const md = `# A\n\n## Shards — Agent Suite\nold v1\n\n${v2}\n\nafter\n`;
    const { text, removed } = stripClaudeMd(md);
    expect(removed).toBe(1);
    expect(text).not.toContain('old v1');
    expect(text).toContain(v2);
    expect(text).toContain('after');
    // the v2 block remover still finds a complete region
    expect(/<!-- shards:begin conventions[^>]*-->[\s\S]*?<!-- shards:end conventions -->/.test(text)).toBe(true);
  });
});

describe('filterHooks', () => {
  const settings = () => ({ hooks: {
    Stop: [{ hooks: [
      { type: 'command', command: 'node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js stop' },
      { type: 'command', command: 'node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js stop' },
      { type: 'command', command: 'node scripts/webhook-relay.js' },
      { type: 'command', command: 'node tools/gate-hook.js' },
    ] }],
  } });
  it('uses only the recorded entries when the manifest has hookEntries; reports unrecorded v1-looking hooks', () => {
    const s = settings();
    const dropped = filterHooks(s, { hookEntries: [{ event: 'Stop', matcher: '', command: 'node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js stop' }] });
    expect([...dropped]).toEqual(['Stop: node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js stop']);
    expect(dropped.unrecorded).toEqual(['Stop: node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js stop']);
    expect(s.hooks.Stop[0].hooks.map((h) => h.command)).toEqual(['node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js stop', 'node scripts/webhook-relay.js', 'node tools/gate-hook.js']);
  });
  it('falls back to the anchored v1 paths only without hookEntries', () => {
    const s = settings();
    const dropped = filterHooks(s, null);
    expect(dropped).toHaveLength(2);
    expect(s.hooks.Stop[0].hooks.map((h) => h.command)).toEqual(['node scripts/webhook-relay.js', 'node tools/gate-hook.js']);
    expect(HOOK_ENTRIES.length).toBeGreaterThan(0);
  });
});
