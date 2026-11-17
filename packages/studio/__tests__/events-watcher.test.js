import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createEventsWatcher, createArtifactIndex, eventToPanelPayload, closePayloads } =
  require('../events-watcher.js');

let dir, file, w, got, resets;
const ev = (type, p, extra = {}) =>
  ({ v: 1, ts: new Date().toISOString(), session: 's', agent: 'a', type, path: p, meta: {}, ...extra });
const line = (o) => JSON.stringify(o) + '\n';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ew-'));
  file = path.join(dir, 'events.jsonl');
  got = []; resets = 0;
  w = createEventsWatcher({ file, onEvent: (e) => got.push(e), onReset: () => resets++, pollMs: 20 });
});
afterEach(() => { w.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('events watcher', () => {
  it('tolerates a missing file, then picks up appends', () => {
    w.start();
    expect(got).toEqual([]);
    fs.appendFileSync(file, line(ev('chart', 'a.json')));
    w.check();
    expect(got.map((e) => e.type)).toEqual(['chart']);
    fs.appendFileSync(file, line(ev('dag', 'b.json')));
    w.check();
    expect(got.map((e) => e.type)).toEqual(['chart', 'dag']);
  });

  it('holds a partial line until its newline arrives', () => {
    const full = line(ev('chart', 'a.json'));
    fs.writeFileSync(file, full.slice(0, 20));
    w.start();
    expect(got).toEqual([]);
    fs.appendFileSync(file, full.slice(20));
    w.check();
    expect(got).toHaveLength(1);
  });

  it('ignores malformed lines', () => {
    fs.writeFileSync(file, 'not json\n{"a":1}\n' + line(ev('chart', 'a.json')) + '{broken\n');
    w.start();
    expect(got.map((e) => e.type)).toEqual(['chart']);
  });

  it('recovers from truncation and re-reads from the start', () => {
    fs.writeFileSync(file, line(ev('chart', 'a.json')) + line(ev('dag', 'b.json')));
    w.start();
    expect(got).toHaveLength(2);
    fs.writeFileSync(file, line(ev('model-card', 'm.json')));
    w.check();
    expect(resets).toBe(1);
    expect(got.map((e) => e.type)).toEqual(['chart', 'dag', 'model-card']);
  });

  it('replays existing content on start and also notices via polling', async () => {
    fs.writeFileSync(file, line(ev('chart', 'a.json')));
    w.start();
    expect(got).toHaveLength(1);
    fs.appendFileSync(file, line(ev('dag', 'b.json')));
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toHaveLength(2);
  });
});

describe('artifact index', () => {
  it('keeps latest per type+path and drops closed', () => {
    const idx = createArtifactIndex();
    idx.apply(ev('chart', 'a.json', { meta: { n: 1 } }));
    idx.apply(ev('chart', 'a.json', { meta: { n: 2 } }));
    idx.apply(ev('dag', 'a.json'));
    expect(idx.list()).toHaveLength(2);
    expect(idx.list().find((e) => e.type === 'chart').meta.n).toBe(2);
    const close = ev('close', 'a.json', { meta: { target: 'dag' } });
    expect(closePayloads(close, idx)).toHaveLength(1);
    idx.apply(close);
    expect(idx.list().map((e) => e.type)).toEqual(['chart']);
  });

  it('maps events to ui-panel payloads with stable ids', () => {
    const p1 = eventToPanelPayload(ev('chart', 'out/a.json'), '/proj');
    const p2 = eventToPanelPayload(ev('chart', 'out/a.json'), '/proj');
    expect(p1.panelId).toBe(p2.panelId);
    expect(p1).toMatchObject({ eventType: 'ui-panel', panel: 'chart', source: path.resolve('/proj', 'out/a.json') });
  });
});
