import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const L = require('../runtime/leases');
const { StateStore } = require('../runtime/state/store');
const host = require('../hooks/lib/host');
const { handler } = require('../hooks/pre-tool-use');
const { destructiveGit } = require('../hooks/lib/ar-guard');
const { gitInvocations } = require('../hooks/lib/writes');
const { getLeasedPaths } = require('../runtime/git/leases');

const SID = '33333333-3333-4333-8333-333333333333';
let tmp; let sess;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shards-ar-')));
  sess = { root: tmp, sessionKey: SID };
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.SHARDS_GATE_ENFORCE; });

const call = async (tool, input, extra = {}, cwd = tmp) => {
  const n = host.normalize({ session_id: SID, cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
  const out = await handler(n, tmp);
  return out ? JSON.parse(out).hookSpecificOutput : null;
};
const denied = (o) => !!o && o.permissionDecision === 'deny';
const W = (file, extra) => call('Write', { file_path: path.isAbsolute(file) ? file : path.join(tmp, file), content: 'x' }, extra);
const B = (command, extra) => call('Bash', { command }, extra);

const open = (over = {}) => L.openArLease(sess, {
  runId: 'run-1', project: 'projects/churn', mutable: ['src/model/**', 'src/features.py', 'configs/*.yaml'],
  immutable: ['src/model/eval_harness.py', 'tests', 'data/**'], ...over,
});

describe('AR lease API', () => {
  it('opens, reports and closes; one active AR lease per session', async () => {
    const l = await open();
    expect(l.owner).toBe('ar');
    expect(l.slices).toEqual([]);
    expect(l.ar).toMatchObject({ run_id: 'run-1', project: 'projects/churn', allow: ['projects/churn'] });
    expect(L.getActiveArLease(sess).id).toBe(l.id);
    await expect(open({ runId: 'run-2' })).rejects.toThrow(/already active/);
    expect((await L.closeArLease(sess, 'run-1')).status).toBe('closed');
    expect(L.getActiveArLease(sess)).toBeNull();
    expect(await L.closeArLease(sess, 'run-1')).toBeNull();
    const l2 = await open({ runId: 'run-2' });
    expect((await L.closeArLease(sess, l2.id)).status).toBe('closed');
  });
  it('validates input', async () => {
    await expect(L.openArLease(sess, { mutable: ['a'] })).rejects.toThrow(/runId/);
    await expect(L.openArLease(sess, { runId: 'r', mutable: [] })).rejects.toThrow(/mutable/);
    await expect(L.openArLease(sess, { runId: 'r', mutable: ['../x'] })).rejects.toThrow(/\.\./);
    await expect(L.openArLease(sess, { runId: 'r', mutable: ['/abs'] })).rejects.toThrow(/absolute/);
  });
  it('does not exclude mutable paths from gate commits and cannot be bound by a worker', async () => {
    const l = await open();
    expect(await getLeasedPaths(sess)).toEqual([]);
    await expect(L.bindWorker(sess, { agentId: 'a1', leaseId: l.id, sliceId: 's1' })).rejects.toThrow();
  });
  it('expires without a heartbeat; the hook touch refreshes it', async () => {
    const l = await open({ ttl_ms: 1000 });
    const st = new StateStore(tmp, SID);
    const cur = st.read('leases'); cur.leases[l.id].heartbeat_at = new Date(Date.now() - 600).toISOString();
    fs.writeFileSync(st.file('leases'), JSON.stringify(cur));
    expect(await L.touchArLease(sess)).toBe(true);
    expect(L.getActiveArLease(sess, Date.now() + 900)).not.toBeNull();
    expect(L.getActiveArLease(sess, Date.now() + 5000)).toBeNull();
  });
});

describe('AR scope enforcement (writes)', () => {
  it('allows mutable, project, .shards and temp writes', async () => {
    await open();
    for (const f of ['src/model/net.py', 'src/model/sub/layer.py', 'src/features.py', 'configs/a.yaml', 'projects/churn/experiments/iter_1.json', '.shards/tmp/x.json']) {
      expect(await W(f), f).toBeNull();
    }
    expect(await W(path.join(os.tmpdir(), 'scratch-ar.txt'))).toBeNull();
    expect(await call('Edit', { file_path: path.join(tmp, 'src/model/net.py'), old_string: 'a', new_string: 'b' })).toBeNull();
    expect(await B('echo 1 > src/model/out.txt && python train.py && pytest -q')).toBeNull();
  });
  it('denies immutable paths even when a mutable glob or the allow list covers them', async () => {
    await open({ immutable: ['src/model/eval_harness.py', 'tests', 'data/**', 'projects/churn/holdout'] });
    for (const f of ['src/model/eval_harness.py', 'tests/test_eval.py', 'data/train.csv', 'data/raw/x.parquet', 'projects/churn/holdout/y.csv']) {
      const d = await W(f);
      expect(denied(d), f).toBe(true);
      expect(d.permissionDecisionReason).toMatch(/immutable/);
    }
    expect(denied(await call('NotebookEdit', { notebook_path: path.join(tmp, 'tests/n.ipynb') }))).toBe(true);
    expect(denied(await B('rm -rf src/model'))).toBe(true); // contains the immutable harness
    expect(denied(await B('sed -i s/a/b/ src/model/eval_harness.py'))).toBe(true);
    expect(denied(await call('apply_patch', { input: '*** Begin Patch\n*** Update File: tests/t.py\n*** End Patch' }))).toBe(true);
  });
  it('denies writes outside the mutable scope', async () => {
    await open();
    for (const f of ['README.md', 'src/other.py', 'configs/sub/b.yaml']) {
      const d = await W(f);
      expect(denied(d), f).toBe(true);
      expect(d.permissionDecisionReason).toMatch(/outside the mutable scope of AR run run-1/);
    }
    expect(denied(await W(path.join(os.homedir(), 'elsewhere-ar.txt')))).toBe(true);
    expect(denied(await B('rm -rf .'))).toBe(true);
  });
  it('denies unknown-target writes; exec-only calls and scoped git pass', async () => {
    await open();
    for (const c of ['sh -c "echo x > tests/a"', 'eval "$X"', 'cd src && echo x > y', 'git apply p.diff', 'git stash pop', 'git merge other']) {
      expect(denied(await B(c)), c).toBe(true);
    }
    expect(await call('mcp__plugin_shards_shards__notebook_exec', { cell: 1 })).toBeNull();
  });
  it('denies runtime state writes and sealed holdout reads (review of PR #93)', async () => {
    await open();
    for (const f of ['.shards/state/sessions/s/leases.json', '.shards/state/research-sealed/p/r.json']) expect(denied(await W(f)), f).toBe(true);
    expect(denied(await B('echo {} > .shards/state/sessions/s/leases.json'))).toBe(true);
    expect(denied(await B('cat .shards/state/research-sealed/churn/run-1.json'))).toBe(true);
    expect(denied(await call('Read', { file_path: path.join(tmp, '.shards/state/research-sealed/churn/run-1.json') }))).toBe(true);
  });
  it('treats `>& file` as a write and still allows fd duplication', async () => {
    await open();
    expect(denied(await B('echo hi >& tests/t.py'))).toBe(true);
    expect(denied(await B('echo hi >&tests/t.py'))).toBe(true);
    expect(await B('python train.py 2>&1 >&2')).toBeNull();
  });
  it('checks the path arguments of third-party MCP write tools', async () => {
    await open();
    expect(denied(await call('mcp__serena__replace_content', { relative_path: 'tests/t.py', needle: 'a', repl: 'b' }))).toBe(true);
    expect(denied(await call('mcp__filesystem__move_file', { source: 'src/model/a.py', destination: 'data/a.py' }))).toBe(true);
    expect(await call('mcp__serena__replace_content', { relative_path: 'src/model/net.py', needle: 'a', repl: 'b' })).toBeNull();
    expect(await call('mcp__docs__update', { id: 'x', payload: 'y' })).toBeNull(); // remote, no local path
  });
  it('applies to subagents too and is lifted when the lease closes', async () => {
    await open();
    expect(denied(await W('tests/x.py', { agent_id: 'sub1' }))).toBe(true);
    await L.closeArLease(sess, 'run-1');
    expect(await W('tests/x.py')).toBeNull();
    expect(await B('git reset --hard')).toBeNull();
  });
  it('SHARDS_GATE_ENFORCE=0 disables it', async () => {
    await open();
    process.env.SHARDS_GATE_ENFORCE = '0';
    expect(await W('tests/x.py')).toBeNull();
    expect(await B('git reset --hard HEAD')).toBeNull();
  });
  it('no lease: nothing changes', async () => {
    expect(await W('tests/x.py')).toBeNull();
    expect(await B('git switch main')).toBeNull();
  });
});

describe('AR git guard', () => {
  const DENY = [
    'git reset --hard', 'git reset --hard HEAD~1', 'git clean -f', 'git clean -fd', 'git clean -xdf', 'git clean -d --force',
    'git push --force', 'git push -f origin main', 'git push --force-with-lease', 'git push --force-with-lease=main:abc origin main', 'git push origin +main',
    'git push origin --delete research/x', 'git push origin :research/x',
    'git tag -d research/p/3-x', 'git tag --delete t', 'git tag -f t HEAD',
    'git checkout -b exp', 'git checkout -B exp', 'git checkout --orphan x', 'git switch main', 'git switch -c exp', 'git branch -D old', 'git branch -d --force old',
    // robustness: -C, env prefixes, wrappers, chains, substitutions
    'git -C sub reset --hard', 'git -c core.x=1 -C a/b clean -fdx', 'GIT_DIR=.git git reset --hard', 'env FOO=1 git switch x', 'sudo git push -f',
    'git status && git reset --hard', 'git add -A; git clean -fd', 'echo ok | git switch dev', 'echo $(git tag -d t)', '/usr/bin/git branch -D x',
    'git status\ngit reset --hard',
    // review of #93: subshells, long-option abbreviations, branch moves, history rewrites
    '(git reset --hard)', '(cd x && git reset --hard)', 'git reset --ha', 'git push --force-w', 'git clean --fo', 'git checkout -bfoo',
    'git reset --soft HEAD~1', 'git reset HEAD~1', 'git reset abc1234', 'git reset --keep HEAD~1',
    'git branch foo', 'git branch -f main HEAD~3', 'git branch -m a b', 'git branch --mo a b', 'git commit --amend', 'git commit --am -m x',
    'git update-ref -d refs/heads/main', 'git symbolic-ref HEAD refs/heads/x', 'git checkout --detach', 'git fetch origin main:main',
    'git reflog expire --expire=now --all', 'git gc --prune=now', 'git filter-branch', 'git checkout-index -f -a', 'git read-tree -u --reset HEAD',
    // second review of #93: branch switch via `<ref> --`, unchecked pathspecs, config that runs commands
    'git checkout other --', 'git checkout abc1234 --', 'git restore --pathspec-from-file=p', 'git checkout --pathspec-from-file=p abc',
    'git checkout -p', 'git restore --patch', "git -c alias.x='!git reset --hard' x", 'git config alias.x "!git reset --hard"',
    'git config --global core.hooksPath /x', 'git config --unset user.name',
  ];
  const ALLOW = [
    'git status', 'git diff', 'git diff --name-only abc123 -- src/model', 'git log --oneline -5', 'git commit --only src/model/net.py -m "iter 3"',
    'git add src/model/net.py', 'git tag research/churn/3-lr', 'git checkout abc123 -- src/model/net.py', 'git checkout -- src/features.py',
    'git restore --source abc123 -- src/model/net.py', 'git read-tree abc123', 'git reset', 'git reset -- src/model/net.py', 'git reset HEAD', 'git push origin main',
    'git branch --list', 'git branch -a', 'git branch -vv', 'git branch --show-current', 'git branch --contains abc123', 'git fetch origin',
    'git symbolic-ref HEAD', 'git gc', '(git status)', 'git push --dry-run',
    'git branch', 'git branch -d merged', 'git clean -n', 'git -C . status', 'git rev-parse HEAD',
    'git config user.name', 'git config --get user.email', 'git config -l', 'git -c user.name=x commit -m y', 'git log -p -1',
  ];
  it.each(DENY)('denies: %s', async (command) => {
    await open();
    const d = await B(command);
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toMatch(/AR run run-1/);
  });
  it.each(ALLOW)('allows: %s', async (command) => {
    await open();
    expect(await B(command)).toBeNull();
  });
  it('checkout/restore pathspecs must stay in scope', async () => {
    await open();
    for (const c of ['git checkout abc123 -- src/model/eval_harness.py', 'git checkout abc123 -- tests', 'git checkout -- .', 'git checkout main', 'git restore --source abc -- data/train.csv', 'git checkout abc -- "src/*.py"', 'cd src && git checkout abc -- model/net.py']) {
      expect(denied(await B(c)), c).toBe(true);
    }
  });
  it('resolves checkout pathspecs against -C and cwd', async () => {
    await open();
    expect(await B('git -C src checkout abc -- model/net.py')).toBeNull();
    expect(denied(await B('git -C src checkout abc -- model/eval_harness.py'))).toBe(true);
    expect(await call('Bash', { command: 'git checkout abc -- net.py' }, {}, path.join(tmp, 'src/model'))).toBeNull();
  });
  it('destructiveGit / gitInvocations units', () => {
    expect(destructiveGit({ sub: 'reset', rest: ['--mixed'] })).toBeNull();
    expect(destructiveGit({ sub: 'clean', rest: ['-n', '-d'] })).toBeNull();
    expect(gitInvocations('A=1 nice git -C x -c a=b push -f && ls').map((g) => [g.sub, g.dir])).toEqual([['push', 'x']]);
  });
});

describe('shards_status exposes the AR lease', () => {
  it('reports arLease', async () => {
    const tool = require('../runtime/tools/shards_status');
    const st = new StateStore(tmp, SID);
    const ctx = { root: tmp, sessionKey: SID, state: st, getConfig: () => ({ config: {}, path: null, created: false }) };
    const h = tool.handler || tool.definition?.handler;
    expect((await h({}, ctx)).data.arLease).toBeNull();
    await open();
    expect((await h({}, ctx)).data.arLease).toMatchObject({ run_id: 'run-1', mutable: ['src/model/**', 'src/features.py', 'configs/*.yaml'] });
  });
});

describe('AR branch worktrees (issue #91 H4)', () => {
  const WT = '.shards/worktrees/run-1';
  const openBranch = (b) => L.openArLease(sess, {
    runId: 'run-1', project: 'projects/churn', mutable: ['src/model/**', 'src/features.py'], immutable: ['src/model/eval_harness.py', 'tests'],
    branch: b, workRoot: `${WT}/${b}`,
  });

  it('one lease covers the branch runs of one run id; branches leave it one by one', async () => {
    const a = await openBranch('a');
    const b = await openBranch('b');
    expect(b.id).toBe(a.id);
    expect(L.getActiveArLease(sess).ar).toMatchObject({
      mutable: [`${WT}/a/src/model/**`, `${WT}/a/src/features.py`, `${WT}/b/src/model/**`, `${WT}/b/src/features.py`],
      immutable: ['src/model/eval_harness.py', 'tests', `${WT}/a/src/model/eval_harness.py`, `${WT}/a/tests`, `${WT}/b/src/model/eval_harness.py`, `${WT}/b/tests`],
    });
    await expect(openBranch('a')).rejects.toThrow(/already holds/);
    await expect(open({ runId: 'run-2' })).rejects.toThrow(/already active/);
    await expect(L.openArLease(sess, { runId: 'run-2', mutable: ['x'], branch: 'c', workRoot: `${WT}/c` })).rejects.toThrow(/already active/);
    expect((await L.closeArLease(sess, 'run-1', { branch: 'a' })).status).toBe('active');
    expect(Object.keys(L.getActiveArLease(sess).ar.branches)).toEqual(['b']);
    expect((await L.closeArLease(sess, 'run-1', { branch: 'b' })).status).toBe('closed');
    expect(L.getActiveArLease(sess)).toBeNull();
  });

  it('scopes worktree writes to that branch\'s mutable paths, never via the .shards/ allowance', async () => {
    await openBranch('a');
    for (const f of [`${WT}/a/src/model/net.py`, path.join(tmp, WT, 'a/src/features.py'), '.shards/tmp/x.json', 'projects/churn/experiments/branches/a/iter_1.md']) {
      expect(await W(f), f).toBeNull();
    }
    for (const [f, why] of [
      [`${WT}/a/README.md`, /outside the mutable scope/], [`${WT}/a/tests/t.py`, /immutable/], [`${WT}/a/src/model/eval_harness.py`, /immutable/],
      [`${WT}/b/src/model/net.py`, /outside the mutable scope/], ['.shards/worktrees/other.txt', /outside the mutable scope/],
      ['src/model/net.py', /outside the mutable scope/], // the main tree's mutable paths are not writable during a worktree run
    ]) {
      const d = await W(f);
      expect(denied(d), f).toBe(true);
      expect(d.permissionDecisionReason, f).toMatch(why);
    }
    expect(denied(await B(`rm -rf ${WT}/a`))).toBe(true);
    expect(denied(await B('rm -rf .shards/worktrees'))).toBe(true);
  });

  it('git guard: worktree management is runtime-only; checkout pathspecs resolve inside the worktree', async () => {
    await openBranch('a');
    const wt = path.join(tmp, WT, 'a');
    fs.mkdirSync(path.join(wt, 'src/model'), { recursive: true });
    for (const c of [`git worktree remove --force ${WT}/a`, `git worktree add --detach ${WT}/x HEAD`, 'git worktree prune', `git worktree move ${WT}/a /tmp/y`]) {
      const d = await B(c);
      expect(denied(d), c).toBe(true);
      expect(d.permissionDecisionReason).toMatch(/worktree/);
    }
    expect(await B('git worktree list')).toBeNull();
    expect(await call('Bash', { command: 'git checkout abc -- src/model/net.py' }, {}, wt)).toBeNull();
    expect(denied(await call('Bash', { command: 'git checkout abc -- tests' }, {}, wt))).toBe(true);
    expect(await B(`git -C ${WT}/a checkout abc -- src/features.py`)).toBeNull();
    expect(denied(await B('git checkout abc -- src/features.py'))).toBe(true); // main tree, not the branch
  });
});
