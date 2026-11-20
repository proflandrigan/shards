import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { createServer } = require('../runtime/server.js');
const index = require('../runtime/sessions/index.js');
const ops = require('../runtime/sessions/ops.js');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-activity-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('runtime session activity (long-lived session vs startup sweep)', () => {
  it('keeps bumping activity (throttled) and brings a swept live session back to active', () => {
    let t = 1_000_000;
    const srv = createServer({ root: dir, sessionKey: 'k1', host: 'claude-code', leaseSweepMs: 0, activityThrottleMs: 5 * 60 * 1000, now: () => t });
    const sd = ops.sessionsDir(dir);
    void srv.state; // first tool call registers the session
    const first = index.getEntry(sd, 'k1');
    expect(first.status).toBe('active');

    // Another server process starts >24h later and sweeps this still-live session.
    index.sweepAbandoned(sd, { nowMs: Date.parse(first.lastActivityAt) + 25 * 3600e3 });
    expect(index.getEntry(sd, 'k1').status).toBe('abandoned');

    // Within the throttle window: no index write.
    t += 60 * 1000;
    void srv.state;
    expect(index.getEntry(sd, 'k1').status).toBe('abandoned');

    // Past the throttle window: activity bump reactivates it.
    t += 5 * 60 * 1000;
    void srv.state;
    const e = index.getEntry(sd, 'k1');
    expect(e.status).toBe('active');
    expect(e.gateOpenAtEnd).toBeNull();
    srv.sweeper.stop();
  });

  it('never reopens an ended session', () => {
    let t = 0;
    const srv = createServer({ root: dir, sessionKey: 'k2', host: 'claude-code', leaseSweepMs: 0, activityThrottleMs: 1000, now: () => t });
    const sd = ops.sessionsDir(dir);
    void srv.state;
    index.markEnded(sd, 'k2');
    t += 5000;
    void srv.state;
    expect(index.getEntry(sd, 'k2').status).toBe('ended');
    srv.sweeper.stop();
  });
});
