import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { writesOf } = require('../hooks/lib/writes.js');
const host = require('../hooks/lib/host');
const { handler } = require('../hooks/pre-tool-use');
const { StateStore } = require('../runtime/state/store');
const bash = (command) => writesOf({ toolName: 'Bash', toolInput: { command }, cwd: '/r' });

describe('exec classification', () => {
  it.each([
    'python3 -c "print(1)"', 'node -e "console.log(1)"', 'ruby -e "puts 1"', 'perl -e "print 1"',
    './run.sh', '/tmp/x/run', 'FOO=1 ./run.sh', 'cargo build', 'cargo run', 'go run main.go', 'go build ./...',
    'dbt run', 'dbt build --select x', 'mvn package', 'gradle build', 'dotnet run', 'bundle exec rake',
  ])('%s is exec', (c) => {
    expect(bash(c).exec).toBe(true);
  });
  it('inline code with a write pattern is a write', () => {
    expect(bash('python3 -c "open(\'f\',\'w\').write(1)"').write).toBe(true);
  });
  it.each(['ls -la', 'cat f', 'git status', 'cargo --version', 'go version', 'dbt --version', 'grep -r x .', 'echo hi'])('%s is neither write nor exec', (c) => {
    const r = bash(c);
    expect(r.write).toBe(false);
    expect(r.exec).toBe(false);
  });
});

describe('pre-tool-use fails closed on unreadable gate state', () => {
  const SID = '33333333-3333-4333-8333-333333333333';
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-corrupt-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.SHARDS_GATE_ENFORCE; });
  const call = async (tool, input) => {
    const n = host.normalize({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input }, { SHARDS_HOST: 'claude-code' });
    const out = await handler(n, tmp);
    return out ? JSON.parse(out).hookSpecificOutput : null;
  };
  const corrupt = () => {
    const st = new StateStore(tmp, SID);
    fs.mkdirSync(path.dirname(st.file('gates')), { recursive: true });
    fs.writeFileSync(st.file('gates'), '{not json');
  };
  it('denies when gates.json is corrupt', async () => {
    corrupt();
    const o = await call('Write', { file_path: path.join(tmp, 'a.txt'), content: 'x' });
    expect(o.permissionDecision).toBe('deny');
    expect(o.permissionDecisionReason).toContain('gate state could not be read');
  });
  it('SHARDS_GATE_ENFORCE=0 bypasses', async () => {
    corrupt();
    process.env.SHARDS_GATE_ENFORCE = '0';
    expect(await call('Write', { file_path: path.join(tmp, 'a.txt'), content: 'x' })).toBeNull();
  });
  it('no gate state: allowed', async () => {
    expect(await call('Write', { file_path: path.join(tmp, 'a.txt'), content: 'x' })).toBeNull();
  });
});
