'use strict';
// Builds a legacy (v1 / v-legacy tag) Shards install inside `dir` for migrate tests.
// Mirrors what tools/install.js at v-legacy wrote: manifest with files + hookEntries,
// gate/relay hooks in .claude/settings.json, .shards/ui, .shards/hooks/gate-hook*, CLAUDE.md blocks,
// a Knowledge Ledger, and legacy gate files (state.json in either format + gates.jsonl).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GATES = path.join(__dirname, 'legacy-gates');
const LEDGER = path.join(__dirname, 'ledger');

const MANIFEST_FILES = [
  '.claude/agents/syn.md',
  '.claude/agents/specific_instructions/data_analyst/phases/phase-1.md',
  '.claude/commands/shards.md',
  '.shards/ui/index.html',
  '.shards/ui/js/app.js',
  '.shards/ui/docs/README.md',
  'templates/project-specs.md',
  'docs/shards-guide/README.md',
];

const HOOK_ENTRIES = [
  { event: 'Stop', matcher: '', command: 'node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js stop' },
  { event: 'PreToolUse', matcher: 'Bash', command: 'node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js pre-tool-use' },
  { event: 'PostToolUse', matcher: '', command: 'node $CLAUDE_PROJECT_DIR/.shards/ui/ui-push.js tool' },
];

const CLAUDE_MD = `# My Project

User notes that must survive migration.

## Shards — Agent Suite

This project uses **Shards**, a suite of data-focused agents.

### Specialists

| Command | Agent |
|---------|-------|
| \`/data-analyst\` | Data Analyst |

## Shards — Tool-call conventions

Phase transitions are paced by gates.

### What is unusual

Writes outside the output directories.

## My Own Section

Keep me too.
`;

function w(dir, rel, text) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
}

// opts.gateState: 'single-slot' | 'v2-sessions' | 'none'; opts.git: init a repo with one commit (default true)
function buildLegacyProject(dir, opts = {}) {
  const gateState = opts.gateState || 'single-slot';
  const installedAt = opts.installedAt || '2026-05-01T00:00:00.000Z';
  const past = new Date(installedAt);
  fs.mkdirSync(dir, { recursive: true });

  for (const rel of MANIFEST_FILES) {
    const f = w(dir, rel, `legacy ${rel}\n`);
    fs.utimesSync(f, past, past);
  }
  w(dir, '.claude/.shards-manifest.json', JSON.stringify({ version: '0.1.6', installedAt, files: MANIFEST_FILES, hookEntries: HOOK_ENTRIES }, null, 2));

  const hook = (command) => ({ type: 'command', command });
  w(dir, '.claude/settings.json', JSON.stringify({
    permissions: { allow: ['Bash(git status:*)'], deny: ['Read(./.env)'] },
    hooks: {
      Stop: [{ hooks: [hook(HOOK_ENTRIES[0].command)] }, { hooks: [hook('echo user-stop-hook')] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [hook(HOOK_ENTRIES[1].command)] }],
      PostToolUse: [{ hooks: [hook(HOOK_ENTRIES[2].command)] }],
      UserPromptSubmit: [{ hooks: [hook('node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js user-prompt-submit'), hook('echo user-prompt-hook')] }],
    },
  }, null, 2));

  w(dir, '.shards/hooks/gate-hook.js', '// legacy gate hook\n');
  w(dir, '.shards/hooks/gate-hook/log.js', '// legacy\n');
  w(dir, 'CLAUDE.md', CLAUDE_MD);

  // user-owned files that must survive
  w(dir, '.claude/agents/my-own-agent.md', 'user agent\n');
  w(dir, '.shards/ui/user-notes.txt', 'unknown file inside .shards/ui\n');
  w(dir, 'analysis/churn/project-specs.md', '# churn\n');
  w(dir, 'studies/s1/report.md', '# study\n');

  if (gateState !== 'none') {
    fs.mkdirSync(path.join(dir, '.shards', 'gates'), { recursive: true });
    fs.copyFileSync(path.join(GATES, `${gateState}.state.json`), path.join(dir, '.shards', 'gates', 'state.json'));
    fs.copyFileSync(path.join(GATES, 'gates.jsonl'), path.join(dir, '.shards', 'gates', 'gates.jsonl'));
    w(dir, '.shards/gates/violations.jsonl', '{"type":"x","ts":"2026-05-04T00:00:00Z"}\n');
  }
  if (opts.ledger !== false) fs.cpSync(path.join(LEDGER, '.shards'), path.join(dir, '.shards'), { recursive: true });

  if (opts.git !== false) {
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    g('init', '-q');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 'T');
    g('config', 'commit.gpgsign', 'false');
    g('add', '-A');
    g('commit', '-q', '-m', 'legacy install');
  }
  return dir;
}

module.exports = { buildLegacyProject, MANIFEST_FILES, HOOK_ENTRIES, CLAUDE_MD };
