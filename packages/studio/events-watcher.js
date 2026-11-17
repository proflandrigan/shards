'use strict';

/**
 * events-watcher.js — tails <project>/.shards/events.jsonl and turns artifact
 * events ({v:1, ts, session, agent, type, path, meta}; see
 * core/schema/event.schema.json) into Studio panel payloads.
 *
 * Studio needs no Claude Code hooks: agents append events to events.jsonl and
 * this watcher feeds the panel-open / panel-close path in server.js.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PANEL_TYPES = [
  'data-viewer', 'chart', 'dag', 'experiment-dashboard', 'eval-dashboard',
  'model-card', 'prompt-lab', 'brainstorm', 'pr-review', 'notebook-walkthrough',
];

// ─── Tailer ─────────────────────────────────────────────────────────────────

/**
 * Tail a JSONL file by byte offset. Safe against: missing file, partial last
 * line (held until its newline arrives), malformed lines (skipped),
 * truncation/rotation (offset reset, onReset called, file re-read from 0).
 * Reads from offset 0 on start, so existing content is replayed.
 */
function createEventsWatcher({ file, onEvent, onReset, pollMs = 500 }) {
  let offset = 0;
  let remainder = Buffer.alloc(0);
  let watcher = null;
  let timer = null;
  let stopped = false;

  function check() {
    if (stopped) return;
    let st;
    try { st = fs.statSync(file); } catch { return; } // missing: wait for it
    if (st.size < offset) {
      offset = 0;
      remainder = Buffer.alloc(0);
      if (onReset) { try { onReset(); } catch {} }
    }
    if (st.size === offset) return;
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const len = st.size - offset;
      const buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, offset);
      offset += n;
      let data = Buffer.concat([remainder, buf.subarray(0, n)]);
      let nl;
      while ((nl = data.indexOf(0x0a)) !== -1) {
        const line = data.subarray(0, nl).toString('utf8').trim();
        data = data.subarray(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; } // malformed: ignore
        if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') continue;
        try { onEvent(ev); } catch {}
      }
      remainder = data;
    } catch {
      // transient read error; retry on next tick
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    }
  }

  function tryWatch() {
    if (watcher || stopped) return;
    try {
      // Watch the directory so a late-created or replaced file is noticed.
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) return;
      watcher = fs.watch(dir, { persistent: false }, (_ev, name) => {
        if (!name || name === path.basename(file)) check();
      });
      watcher.on('error', () => { try { watcher.close(); } catch {} watcher = null; });
    } catch { watcher = null; }
  }

  return {
    start() {
      check();
      tryWatch();
      // Polling fallback (fs.watch is unreliable on some filesystems).
      timer = setInterval(() => { tryWatch(); check(); }, pollMs);
      if (timer.unref) timer.unref();
      return this;
    },
    check,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (watcher) { try { watcher.close(); } catch {} }
    },
  };
}

// ─── Artifact index (latest event per type+path, minus closed) ──────────────

function createArtifactIndex() {
  const map = new Map(); // key -> event
  const key = (type, p) => `${type}\u0000${p}`;
  return {
    apply(ev) {
      if (ev.type === 'close') {
        const target = ev.meta && (ev.meta.target || ev.meta.panel);
        for (const [k, v] of map) {
          if (v.path === ev.path && (!target || v.type === target)) map.delete(k);
        }
        return;
      }
      if (!PANEL_TYPES.includes(ev.type) || typeof ev.path !== 'string' || !ev.path) return;
      map.delete(key(ev.type, ev.path)); // re-insert so order = recency
      map.set(key(ev.type, ev.path), ev);
    },
    clear() { map.clear(); },
    list() { return Array.from(map.values()); },
  };
}

// ─── Event -> panel payload ─────────────────────────────────────────────────

function panelIdFor(type, p) {
  return 'art-' + crypto.createHash('sha1').update(type + '\0' + p).digest('hex').slice(0, 12);
}

/** Payload for server.handlePanelEvent({eventType:'panel-open', ...}). */
function eventToPanelPayload(ev, projectDir) {
  const meta = ev.meta || {};
  const abs = path.isAbsolute(ev.path) ? ev.path : path.resolve(projectDir, ev.path);
  return {
    eventType: 'panel-open',
    panel: ev.type,
    panelId: panelIdFor(ev.type, ev.path),
    title: meta.title || path.basename(ev.path),
    data: meta.data !== undefined ? meta.data : null,
    source: abs,
    type: meta.type || meta.subtype || null,
    agent: ev.agent || null,
    sessionId: ev.session || undefined,
  };
}

/** Payloads for every panel a close event closes, given the index BEFORE apply. */
function closePayloads(ev, index) {
  const target = ev.meta && (ev.meta.target || ev.meta.panel);
  return index.list()
    .filter((v) => v.path === ev.path && (!target || v.type === target))
    .map((v) => ({ eventType: 'panel-close', panelId: panelIdFor(v.type, v.path) }));
}

module.exports = {
  PANEL_TYPES, createEventsWatcher, createArtifactIndex,
  eventToPanelPayload, closePayloads, panelIdFor,
};
