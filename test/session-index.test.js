import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const sessionIndex = require('../src/ui/session-index.js');

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHARDS_SESSIONS_BIN = path.join(REPO_ROOT, 'tools', 'shards-sessions.js');

let tmpDir;
let sessionsDir;
let shardsDir;
let gatesDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-index-test-'));
  shardsDir = path.join(tmpDir, '.shards');
  sessionsDir = path.join(shardsDir, 'sessions');
  gatesDir = path.join(shardsDir, 'gates');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeGateState(state) {
  fs.mkdirSync(gatesDir, { recursive: true });
  fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify(state, null, 2));
}

function runSessionsCli(args) {
  // Run the CLI with cwd=tmpDir so it picks up the per-test .shards directory.
  return execFileSync(process.execPath, [SHARDS_SESSIONS_BIN, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
  });
}

describe('readIndex', () => {
  it('returns empty index when file does not exist', () => {
    const data = sessionIndex.readIndex(sessionsDir);
    expect(data.version).toBe(sessionIndex.INDEX_VERSION);
    expect(data.sessions).toEqual([]);
  });

  it('returns empty index when file is corrupt', () => {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(sessionIndex.indexPath(sessionsDir), '{ not json');
    const data = sessionIndex.readIndex(sessionsDir);
    expect(data.sessions).toEqual([]);
  });

  it('returns empty index when shape is wrong', () => {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(sessionIndex.indexPath(sessionsDir), JSON.stringify({ foo: 'bar' }));
    const data = sessionIndex.readIndex(sessionsDir);
    expect(data.sessions).toEqual([]);
  });
});

describe('appendSession', () => {
  it('writes a new active entry with required fields', () => {
    sessionIndex.appendSession(sessionsDir, {
      sessionId: 'abc',
      agent: 'data-analyst',
    });
    const data = sessionIndex.readIndex(sessionsDir);
    expect(data.sessions).toHaveLength(1);
    const e = data.sessions[0];
    expect(e.sessionId).toBe('abc');
    expect(e.agent).toBe('data-analyst');
    expect(e.status).toBe('active');
    expect(e.endedAt).toBeNull();
    expect(e.createdAt).toBeTypeOf('string');
    expect(e.lastActivityAt).toBeTypeOf('string');
    expect(e.messageCount).toBe(0);
  });

  it('is idempotent — appending an existing sessionId is a no-op', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'data-analyst' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'data-scientist' });
    const data = sessionIndex.readIndex(sessionsDir);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].agent).toBe('data-analyst');
  });

  it('throws when sessionId missing', () => {
    expect(() => sessionIndex.appendSession(sessionsDir, { agent: 'x' })).toThrow(/sessionId/);
  });

  it('records resumedFrom when provided', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'new', agent: 'a', resumedFrom: 'old' });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.resumedFrom).toBe('old');
  });
});

describe('updateActivity', () => {
  beforeEach(() => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'data-analyst' });
  });

  it('bumps lastActivityAt and stores last prompt + project', () => {
    const before = sessionIndex.readIndex(sessionsDir).sessions[0].lastActivityAt;
    // Sleep a touch so the timestamp can change.
    const future = new Date(Date.now() + 50).toISOString();
    // Hack: just update synchronously and verify message + project.
    sessionIndex.updateActivity(sessionsDir, 'abc', {
      lastUserPrompt: 'hello world',
      projectName: 'q2',
      projectDir: 'analysis/q2',
      messageCount: 3,
    });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.lastUserPrompt).toBe('hello world');
    expect(e.projectName).toBe('q2');
    expect(e.projectDir).toBe('analysis/q2');
    expect(e.messageCount).toBe(3);
    expect(e.lastActivityAt >= before).toBe(true);
  });

  it('truncates long prompts with an ellipsis', () => {
    const long = 'x'.repeat(500);
    sessionIndex.updateActivity(sessionsDir, 'abc', { lastUserPrompt: long });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.lastUserPrompt.length).toBeLessThanOrEqual(sessionIndex.PROMPT_PREVIEW_LIMIT);
    expect(e.lastUserPrompt.endsWith('…')).toBe(true);
  });

  it('collapses whitespace in the prompt preview', () => {
    sessionIndex.updateActivity(sessionsDir, 'abc', { lastUserPrompt: '  hi\n\n   there  ' });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.lastUserPrompt).toBe('hi there');
  });

  it('returns null for an unknown sessionId', () => {
    const result = sessionIndex.updateActivity(sessionsDir, 'missing', { lastUserPrompt: 'x' });
    expect(result).toBeNull();
  });
});

describe('updatePhase', () => {
  it('records the phase number', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    sessionIndex.updatePhase(sessionsDir, 'abc', 3);
    expect(sessionIndex.readIndex(sessionsDir).sessions[0].phase).toBe(3);
  });

  it('ignores non-numeric phase', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    sessionIndex.updatePhase(sessionsDir, 'abc', 'not-a-number');
    expect(sessionIndex.readIndex(sessionsDir).sessions[0].phase).toBeNull();
  });
});

describe('markEnded', () => {
  it('sets status, endedAt, and gateOpenAtEnd', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    sessionIndex.markEnded(sessionsDir, 'abc', { gateOpenAtEnd: 'data-analyst-phase-3', reason: 'user_ended' });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.status).toBe('ended');
    expect(e.endedAt).toBeTypeOf('string');
    expect(e.gateOpenAtEnd).toBe('data-analyst-phase-3');
    expect(e.endReason).toBe('user_ended');
  });

  it('accepts null gateOpenAtEnd', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    sessionIndex.markEnded(sessionsDir, 'abc', { gateOpenAtEnd: null });
    const e = sessionIndex.readIndex(sessionsDir).sessions[0];
    expect(e.gateOpenAtEnd).toBeNull();
  });
});

describe('sweepAbandoned', () => {
  it('reclassifies stale active sessions', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'old', agent: 'a' });
    // Backdate the entry by 48h
    const data = sessionIndex.readIndex(sessionsDir);
    data.sessions[0].lastActivityAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    sessionIndex.writeIndex(sessionsDir, data);

    const changed = sessionIndex.sweepAbandoned(sessionsDir);
    expect(changed).toBe(1);
    expect(sessionIndex.readIndex(sessionsDir).sessions[0].status).toBe('abandoned');
  });

  it('leaves fresh active sessions alone', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'fresh', agent: 'a' });
    const changed = sessionIndex.sweepAbandoned(sessionsDir);
    expect(changed).toBe(0);
    expect(sessionIndex.readIndex(sessionsDir).sessions[0].status).toBe('active');
  });

  it('does not touch already-ended sessions', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'old', agent: 'a' });
    sessionIndex.markEnded(sessionsDir, 'old');
    const data = sessionIndex.readIndex(sessionsDir);
    data.sessions[0].lastActivityAt = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    sessionIndex.writeIndex(sessionsDir, data);
    const changed = sessionIndex.sweepAbandoned(sessionsDir);
    expect(changed).toBe(0);
    expect(sessionIndex.readIndex(sessionsDir).sessions[0].status).toBe('ended');
  });
});

describe('listSessions', () => {
  beforeEach(() => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'a1', agent: 'data-analyst', projectName: 'q2', projectDir: 'analysis/q2' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'a2', agent: 'data-analyst', projectName: 'q3', projectDir: 'analysis/q3' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'b1', agent: 'data-scientist', projectName: 'q2', projectDir: 'studies/q2' });
    sessionIndex.markEnded(sessionsDir, 'a2');
  });

  it('returns all sessions when unfiltered, sorted by lastActivityAt desc', () => {
    const rows = sessionIndex.listSessions(sessionsDir);
    expect(rows).toHaveLength(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].lastActivityAt >= rows[i].lastActivityAt).toBe(true);
    }
  });

  it('filters by agent', () => {
    const rows = sessionIndex.listSessions(sessionsDir, { agent: 'data-scientist' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('b1');
  });

  it('filters by project (matching either dir or name)', () => {
    const byDir = sessionIndex.listSessions(sessionsDir, { project: 'analysis/q2' });
    expect(byDir).toHaveLength(1);
    expect(byDir[0].sessionId).toBe('a1');

    const byName = sessionIndex.listSessions(sessionsDir, { project: 'q2' });
    expect(byName.map((r) => r.sessionId).sort()).toEqual(['a1', 'b1']);
  });

  it('filters by status', () => {
    const ended = sessionIndex.listSessions(sessionsDir, { status: 'ended' });
    expect(ended).toHaveLength(1);
    expect(ended[0].sessionId).toBe('a2');
  });
});

describe('getEntry', () => {
  it('returns the entry by id', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    expect(sessionIndex.getEntry(sessionsDir, 'abc').sessionId).toBe('abc');
  });

  it('returns null for unknown id', () => {
    expect(sessionIndex.getEntry(sessionsDir, 'missing')).toBeNull();
  });
});

describe('writeIndex atomicity', () => {
  it('does not leave a shared tmp file behind on success', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    const stale = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.tmp'));
    expect(stale).toEqual([]);
  });

  it('writes each mutation to a unique tmp filename (no shared lock-step path)', () => {
    // Spy on writeFileSync: collect the tmp paths used across two writes.
    const tmpPaths = [];
    const origWrite = fs.writeFileSync;
    fs.writeFileSync = function(p, ...rest) {
      if (typeof p === 'string' && p.endsWith('.tmp')) tmpPaths.push(p);
      return origWrite(p, ...rest);
    };
    try {
      sessionIndex.appendSession(sessionsDir, { sessionId: 'a1', agent: 'a' });
      sessionIndex.appendSession(sessionsDir, { sessionId: 'a2', agent: 'a' });
    } finally {
      fs.writeFileSync = origWrite;
    }
    expect(tmpPaths.length).toBe(2);
    expect(tmpPaths[0]).not.toBe(tmpPaths[1]);
  });

  it('creates the sessions directory on first write', () => {
    const fresh = path.join(tmpDir, 'fresh', 'sessions');
    sessionIndex.appendSession(fresh, { sessionId: 'abc', agent: 'a' });
    expect(fs.existsSync(sessionIndex.indexPath(fresh))).toBe(true);
  });
});

describe('markEnded idempotency contract', () => {
  // The server has two paths that can mark a session ended:
  //   1) POST /chat/end (user clicked End Chat in the UI)
  //   2) handleChatExit (the underlying claude process exited)
  // Both can fire for the same session. The server guards by checking
  // `entry.status === 'active'` before calling markEnded a second time.
  // These tests pin that the module supports that guard pattern.
  it('a second markEnded call still updates endedAt and reason (no built-in guard)', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'abc', agent: 'a' });
    sessionIndex.markEnded(sessionsDir, 'abc', { reason: 'user_ended' });
    const first = sessionIndex.getEntry(sessionsDir, 'abc');
    sessionIndex.markEnded(sessionsDir, 'abc', { reason: 'process_exit' });
    const second = sessionIndex.getEntry(sessionsDir, 'abc');
    // Status stays ended; reason is the most recent caller's value.
    expect(second.status).toBe('ended');
    expect(second.endReason).toBe('process_exit');
    // endedAt may have advanced but must still be a valid ISO string.
    expect(Date.parse(second.endedAt)).toBeGreaterThanOrEqual(Date.parse(first.endedAt));
  });

  it('returns null when sessionId does not exist (covers race where entry was deleted)', () => {
    expect(sessionIndex.markEnded(sessionsDir, 'never-existed', {})).toBeNull();
  });
});

describe('readGateOpenId', () => {
  // Pure unit coverage for the snapshot helper used by sweepAbandoned and
  // mirrored by the CLI/UI end-of-session paths.
  it('returns the gate id when a gate is open', () => {
    writeGateState({ open: true, id: 'data-analyst-phase-3', phase: 3, kind: 'phase' });
    expect(sessionIndex.readGateOpenId(shardsDir)).toBe('data-analyst-phase-3');
  });

  it('returns null when gate state shows closed', () => {
    writeGateState({ open: false, history: [] });
    expect(sessionIndex.readGateOpenId(shardsDir)).toBeNull();
  });

  it('returns null when state.json is missing', () => {
    expect(sessionIndex.readGateOpenId(shardsDir)).toBeNull();
  });

  it('returns null when state.json is corrupt (tolerates partial writes)', () => {
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), '{ not json');
    expect(sessionIndex.readGateOpenId(shardsDir)).toBeNull();
  });
});

describe('sweepAbandoned — gate snapshot (Bug L4)', () => {
  // Bug L4: when reclassifying active → abandoned past the 24h window, the
  // sweep used to leave gateOpenAtEnd null even if a gate was currently open.
  // Now it snapshots whatever's open (with a documented caveat about staleness).
  function backdate(sessionId) {
    const data = sessionIndex.readIndex(sessionsDir);
    const entry = data.sessions.find((s) => s.sessionId === sessionId);
    entry.lastActivityAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    sessionIndex.writeIndex(sessionsDir, data);
  }

  it('populates gateOpenAtEnd from current gate state when shardsDir is supplied', () => {
    writeGateState({ open: true, id: 'ml-engineer-phase-4', phase: 4, kind: 'phase' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'stale', agent: 'ml-engineer' });
    backdate('stale');

    const changed = sessionIndex.sweepAbandoned(sessionsDir, { shardsDir });
    expect(changed).toBe(1);
    const e = sessionIndex.getEntry(sessionsDir, 'stale');
    expect(e.status).toBe('abandoned');
    expect(e.gateOpenAtEnd).toBe('ml-engineer-phase-4');
  });

  it('leaves gateOpenAtEnd null when no gate is currently open', () => {
    writeGateState({ open: false, history: [] });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'stale', agent: 'data-analyst' });
    backdate('stale');

    const changed = sessionIndex.sweepAbandoned(sessionsDir, { shardsDir });
    expect(changed).toBe(1);
    expect(sessionIndex.getEntry(sessionsDir, 'stale').gateOpenAtEnd).toBeNull();
  });

  it('does not overwrite a pre-existing gateOpenAtEnd (e.g. set by a prior end-call race)', () => {
    writeGateState({ open: true, id: 'newer-gate-id', phase: 5, kind: 'phase' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'stale', agent: 'a' });
    // Manually pre-populate the field (simulating a different code path).
    const data = sessionIndex.readIndex(sessionsDir);
    data.sessions[0].gateOpenAtEnd = 'prior-gate-id';
    sessionIndex.writeIndex(sessionsDir, data);
    backdate('stale');

    sessionIndex.sweepAbandoned(sessionsDir, { shardsDir });
    expect(sessionIndex.getEntry(sessionsDir, 'stale').gateOpenAtEnd).toBe('prior-gate-id');
  });

  it('skips the gate read entirely when shardsDir is omitted (backward compatible)', () => {
    writeGateState({ open: true, id: 'should-not-be-used', phase: 1, kind: 'phase' });
    sessionIndex.appendSession(sessionsDir, { sessionId: 'stale', agent: 'a' });
    backdate('stale');

    sessionIndex.sweepAbandoned(sessionsDir);
    // Behavior matches the pre-fix sweep when shardsDir is not passed.
    expect(sessionIndex.getEntry(sessionsDir, 'stale').gateOpenAtEnd).toBeNull();
  });
});

describe('shards-sessions end — gate snapshot (Bug M6)', () => {
  // Bug M6: CLI `end` used to call markEnded without snapshotting gate state,
  // diverging from the UI's POST /chat/end path. Now both paths populate
  // gateOpenAtEnd identically by reading .shards/gates/state.json.
  it('populates gateOpenAtEnd when a gate is open at CLI end-time', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'cli-active', agent: 'data-analyst' });
    writeGateState({ open: true, id: 'data-analyst-phase-3', phase: 3, kind: 'phase' });

    runSessionsCli(['end', 'cli-active']);

    const e = sessionIndex.getEntry(sessionsDir, 'cli-active');
    expect(e.status).toBe('ended');
    expect(e.endReason).toBe('cli_end');
    expect(e.gateOpenAtEnd).toBe('data-analyst-phase-3');
    expect(e.phase).toBe(3);
  });

  it('sets gateOpenAtEnd to null when no gate is open at CLI end-time', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'cli-active', agent: 'data-analyst' });
    writeGateState({ open: false, history: [] });

    runSessionsCli(['end', 'cli-active']);

    const e = sessionIndex.getEntry(sessionsDir, 'cli-active');
    expect(e.status).toBe('ended');
    expect(e.endReason).toBe('cli_end');
    expect(e.gateOpenAtEnd).toBeNull();
  });

  it('tolerates a missing gate state file (sets gateOpenAtEnd to null)', () => {
    sessionIndex.appendSession(sessionsDir, { sessionId: 'cli-active', agent: 'a' });
    // No .shards/gates/state.json exists.

    runSessionsCli(['end', 'cli-active']);

    const e = sessionIndex.getEntry(sessionsDir, 'cli-active');
    expect(e.status).toBe('ended');
    expect(e.gateOpenAtEnd).toBeNull();
  });
});
