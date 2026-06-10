// End-to-end tests for auto-verify mode.
//
// These tests pipe synthetic stdin payloads to gate-hook.js and assert on
// stdout (the hook response) and on .shards/auto/state.json (the persisted
// state). They run in an isolated tmp directory per test so concurrent
// runs don't collide.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(REPO_ROOT, 'tools', 'gate-hook.js');

// ─── Test infrastructure ──────────────────────────────────────────────────────

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-auto-test-'));
});

afterEach(() => {
  if (tmp) {
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  }
});

// Write a fake transcript file with one assistant message containing `text`.
// Mirrors the JSONL shape Claude Code writes:
//   {type: "assistant", message: {role: "assistant", content: [...]}}
function writeTranscript(text, shape = 'real') {
  const file = path.join(tmp, 'transcript.jsonl');
  let entry;
  if (shape === 'real') {
    entry = {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    };
  } else {
    // legacy — kept for symmetry; transcript.js still accepts this shape
    entry = { role: 'assistant', content: [{ type: 'text', text }] };
  }
  fs.writeFileSync(file, JSON.stringify(entry) + '\n');
  return file;
}

function runHook(event, payload, env = {}) {
  const result = spawnSync('node', [HOOK, event], {
    cwd: tmp,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  let parsed = null;
  if (result.stdout && result.stdout.trim()) {
    try { parsed = JSON.parse(result.stdout.trim()); } catch { /* not JSON */ }
  }
  return { stdout: result.stdout, stderr: result.stderr, status: result.status, parsed };
}

function readAutoState() {
  const file = path.join(tmp, '.shards', 'auto', 'state.json');
  if (!fs.existsSync(file)) return { open: false };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readGateState() {
  const file = path.join(tmp, '.shards', 'gates', 'state.json');
  if (!fs.existsSync(file)) return { open: false };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // v2 per-session shape: reduce to a flat { open, ... } by surfacing any open
  // session slot (legacy single-slot files just pass through).
  if (raw && raw.sessions && typeof raw.sessions === 'object') {
    const open = Object.values(raw.sessions).find(g => g && g.open);
    return open ? { open: true, ...open, history: raw.history || [] }
                : { open: false, history: raw.history || [] };
  }
  return raw;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('auto-verify', () => {
  it('::AUTO-VERIFY:: marker opens state', () => {
    const transcript = writeTranscript(
      '::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=5 ttl_minutes=2'
    );
    runHook('stop', { transcript_path: transcript, session_id: 's1' });
    const s = readAutoState();
    expect(s.open).toBe(true);
    expect(s.agent).toBe('data-modeller');
    expect(s.phase).toBe('6');
    expect(s.tool_budget_remaining).toBe(5);
    expect(s.tool_budget_initial).toBe(5);
  });

  it('::ENDAUTO:: marker closes state', () => {
    // Open
    const t1 = writeTranscript('::AUTO-VERIFY:: agent=ml-engineer phase=3 tool_budget=10');
    runHook('stop', { transcript_path: t1, session_id: 's1' });
    expect(readAutoState().open).toBe(true);
    // Close
    const t2 = writeTranscript('Done with verification.\n\n::ENDAUTO::');
    runHook('stop', { transcript_path: t2, session_id: 's1' });
    expect(readAutoState().open).toBe(false);
  });

  it('PreToolUse auto-approves dbt show when block open', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=5');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt show --select my_model' },
    });
    expect(r.parsed && r.parsed.hookSpecificOutput).toBeTruthy();
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    const s = readAutoState();
    expect(s.tool_budget_remaining).toBe(4);
  });

  it('PreToolUse passes through non-allowlisted tool', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=data-modeller phase=6');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    // A Write tool call should NOT be auto-approved.
    const r = runHook('pre-tool-use', {
      tool_name: 'Write',
      tool_input: { file_path: '/x.sql' },
    });
    expect(r.parsed).toBeNull();
    // Budget should not have decremented.
    const s = readAutoState();
    expect(s.tool_budget_remaining).toBe(20);
  });

  it('PreToolUse rejects dbt build (writes never auto-approved)', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=ae phase=7');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt build --select my_model' },
    });
    expect(r.parsed).toBeNull();
  });

  it('PreToolUse rejects dbt run', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=ae phase=7');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt run --select my_model' },
    });
    expect(r.parsed).toBeNull();
  });

  it('PreToolUse approves SELECT-only psql -c', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "SELECT count(*) FROM events"' },
    });
    expect(r.parsed && r.parsed.hookSpecificOutput).toBeTruthy();
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('PreToolUse rejects INSERT via psql', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "INSERT INTO events VALUES (1)"' },
    });
    expect(r.parsed).toBeNull();
  });

  it('Gate open suspends auto-verify (gates win)', () => {
    // Open both auto-verify and gate
    const t1 = writeTranscript('::AUTO-VERIFY:: agent=ae phase=7 tool_budget=5');
    runHook('stop', { transcript_path: t1, session_id: 's1' });
    const t2 = writeTranscript(
      '::GATE:: id=test-gate phase=7 kind=phase agent=ae\nbody\n::ENDGATE::'
    );
    runHook('stop', { transcript_path: t2, session_id: 's1' });
    expect(readGateState().open).toBe(true);
    expect(readAutoState().open).toBe(true);

    // Tool call should be BLOCKED by gate (not auto-approved). The hook
    // returns the canonical PreToolUse contract — hookSpecificOutput.permission
    // Decision: 'deny' — not the legacy `decision: 'block'` form.
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt show --select my_model' },
      // Same session that opened the gate — under the v2 per-session model the
      // gate only blocks its own session, so the session_id must match.
      session_id: 's1',
    });
    expect(r.parsed && r.parsed.hookSpecificOutput).toBeTruthy();
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r.parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/GATE-BLOCK/);
  });

  it('Tool budget exhaustion closes block', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3 tool_budget=2');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    // Use 2 approvals
    for (let i = 0; i < 2; i++) {
      runHook('pre-tool-use', {
        tool_name: 'Bash', tool_input: { command: 'dbt show' },
      });
    }
    // Third call: budget is 0 → isExpired returns true → block closes, falls through
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash', tool_input: { command: 'dbt show' },
    });
    expect(r.parsed).toBeNull();
    expect(readAutoState().open).toBe(false);
  });

  it('SHARDS_AUTO_VERIFY=0 disables the branch', () => {
    // Open without env disabled
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' }, { SHARDS_AUTO_VERIFY: '0' });
    // State should NOT have been written
    expect(readAutoState().open).toBe(false);
  });

  it('User halt prompt closes auto-verify', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    expect(readAutoState().open).toBe(true);
    runHook('user-prompt-submit', { prompt: 'stop, hold on a moment' });
    expect(readAutoState().open).toBe(false);
  });

  it('Compound bash command is rejected (no auto-approve on rm via &&)', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt show && rm -rf /tmp/foo' },
    });
    expect(r.parsed).toBeNull();
  });

  it('Read tool always auto-approves when block open', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Read',
      tool_input: { file_path: '/x' },
    });
    expect(r.parsed && r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('Write tool blocked even with auto-verify open', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const r = runHook('pre-tool-use', {
      tool_name: 'Write',
      tool_input: { file_path: '/x' },
    });
    expect(r.parsed).toBeNull();
  });

  it('Auto-verify clamps tool_budget to AUTO_MAX_TOOL_BUDGET', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3 tool_budget=999');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    const s = readAutoState();
    expect(s.tool_budget_initial).toBe(50);
  });

  it('reads real Claude Code transcript shape ({type, message: {role, content}})', () => {
    // This is the canonical regression test — the actual transcript shape Claude
    // Code writes. transcript.js previously only matched the legacy {role, content}
    // shape, which silently broke gate + auto-verify enforcement.
    const transcript = writeTranscript(
      '::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=5',
      'real'
    );
    runHook('stop', { transcript_path: transcript, session_id: 's1' });
    const s = readAutoState();
    expect(s.open).toBe(true);
    expect(s.tool_budget_remaining).toBe(5);
  });

  it('reads legacy transcript shape for backward compat', () => {
    const transcript = writeTranscript(
      '::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=5',
      'legacy'
    );
    runHook('stop', { transcript_path: transcript, session_id: 's1' });
    const s = readAutoState();
    expect(s.open).toBe(true);
  });

  it('open+close in same message: end state is closed', () => {
    const transcript = writeTranscript(
      '::AUTO-VERIFY:: agent=da phase=3 tool_budget=5\nverification done\n::ENDAUTO::'
    );
    runHook('stop', { transcript_path: transcript, session_id: 's1' });
    const s = readAutoState();
    expect(s.open).toBe(false);
    expect(Array.isArray(s.history) && s.history.length >= 1).toBe(true);
  });

  it('close+open in same message: end state is open (re-opened)', () => {
    // First open a block in turn 1
    const t1 = writeTranscript('::AUTO-VERIFY:: agent=da phase=3 tool_budget=5');
    runHook('stop', { transcript_path: t1, session_id: 's1' });
    expect(readAutoState().open).toBe(true);
    // Turn 2 closes the previous and opens a new one
    const t2 = writeTranscript(
      '::ENDAUTO::\n\n::AUTO-VERIFY:: agent=da phase=3 tool_budget=10'
    );
    runHook('stop', { transcript_path: t2, session_id: 's1' });
    const s = readAutoState();
    expect(s.open).toBe(true);
    expect(s.tool_budget_initial).toBe(10);
  });

  it('audit log written to .shards/auto/history.jsonl', () => {
    const t = writeTranscript('::AUTO-VERIFY:: agent=da phase=3');
    runHook('stop', { transcript_path: t, session_id: 's1' });
    runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'dbt show --select x' },
    });
    const log = path.join(tmp, '.shards', 'auto', 'history.jsonl');
    expect(fs.existsSync(log)).toBe(true);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const events = lines.map(l => JSON.parse(l));
    expect(events.some(e => e.event === 'opened')).toBe(true);
    expect(events.some(e => e.event === 'auto-approved' && e.tool === 'Bash')).toBe(true);
  });
});
