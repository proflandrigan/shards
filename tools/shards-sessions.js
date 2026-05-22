#!/usr/bin/env node
// shards-sessions — list, inspect, resume, and end Shards chat sessions.
'use strict';

const fs = require('fs');
const path = require('path');

const sessionIndex = require('../src/ui/session-index.js');

const PROJECT_DIR = process.cwd();
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const SESSIONS_DIR = path.join(SHARDS_DIR, 'sessions');
const GATE_STATE_FILE = path.join(SHARDS_DIR, 'gates', 'state.json');

// Mirrors src/ui/server.js#readGateSnapshot — returns the gate id (string) if a
// gate is currently open, else null. Both code paths produce identical shapes
// in INDEX.json, so the UI Sessions panel and CLI `show` render the same field.
// Tolerant of a missing/corrupt state file (returns null silently).
function readGateSnapshot() {
  try {
    const raw = fs.readFileSync(GATE_STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    if (state && state.open) {
      return {
        gateOpenAtEnd: state.id || null,
        phase: typeof state.phase === 'number' ? state.phase : null,
      };
    }
    return { gateOpenAtEnd: null, phase: null };
  } catch {
    return { gateOpenAtEnd: null, phase: null };
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatRelative(iso) {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function short(id) {
  return id ? id.slice(0, 8) : '—';
}

function pad(s, n) {
  s = String(s == null ? '' : s);
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

// ─── Argument parsing ──────────────────────────────────────────────────────

function parseFlags(argv) {
  const out = { args: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) { out.flags[a.slice(2)] = next; i += 1; }
        else { out.flags[a.slice(2)] = true; }
      }
    } else {
      out.args.push(a);
    }
  }
  return out;
}

function resolveSessionId(prefix, rows) {
  // Allow operating on a unique short prefix — typing the full UUID is painful.
  if (!prefix) return null;
  const exact = rows.find((r) => r.sessionId === prefix);
  if (exact) return exact.sessionId;
  const matches = rows.filter((r) => r.sessionId.startsWith(prefix));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.error(`Ambiguous session prefix "${prefix}" — matched ${matches.length} sessions.`);
    process.exit(2);
  }
  return matches[0].sessionId;
}

// ─── Commands ─────────────────────────────────────────────────────────────

function cmdList(parsed) {
  const filter = {};
  if (parsed.flags.project) filter.project = parsed.flags.project;
  if (parsed.flags.agent) filter.agent = parsed.flags.agent;
  if (parsed.flags.status) filter.status = parsed.flags.status;

  let rows = sessionIndex.listSessions(SESSIONS_DIR, filter);
  const limit = parsed.flags.limit ? Number(parsed.flags.limit) : null;
  if (limit && Number.isFinite(limit)) rows = rows.slice(0, limit);

  if (rows.length === 0) {
    console.log('\nNo sessions recorded.\n');
    return;
  }

  console.log('');
  console.log(pad('ID', 10) + pad('AGENT', 22) + pad('STATUS', 11) + pad('PHASE', 7) + pad('PROJECT', 28) + 'LAST');
  console.log('─'.repeat(110));
  for (const r of rows) {
    console.log(
      pad(short(r.sessionId), 10) +
      pad(r.agent || '—', 22) +
      pad(r.status, 11) +
      pad(typeof r.phase === 'number' ? `${r.phase}` : '—', 7) +
      pad(r.projectDir || r.projectName || '—', 28) +
      formatRelative(r.lastActivityAt)
    );
  }
  console.log('');
  console.log(`${rows.length} session(s). Use \`shards-sessions show <id>\` for full detail.`);
}

function cmdShow(parsed) {
  const all = sessionIndex.listSessions(SESSIONS_DIR);
  const id = resolveSessionId(parsed.args[0], all);
  if (!id) {
    console.error(`No session matches "${parsed.args[0]}".`);
    process.exit(1);
  }
  const entry = sessionIndex.getEntry(SESSIONS_DIR, id);
  if (!entry) {
    console.error('Entry vanished.');
    process.exit(1);
  }
  console.log('');
  console.log(`Session:    ${entry.sessionId}`);
  console.log(`Agent:      ${entry.agent || '—'}`);
  console.log(`Project:    ${entry.projectDir || entry.projectName || '—'}`);
  console.log(`Status:     ${entry.status}`);
  console.log(`Phase:      ${entry.phase == null ? '—' : entry.phase}`);
  console.log(`Created:    ${formatDate(entry.createdAt)}`);
  console.log(`Last act:   ${formatDate(entry.lastActivityAt)}  (${formatRelative(entry.lastActivityAt)})`);
  if (entry.endedAt) console.log(`Ended:      ${formatDate(entry.endedAt)}  (reason: ${entry.endReason || '—'})`);
  if (entry.gateOpenAtEnd) console.log(`Open gate:  ${entry.gateOpenAtEnd}`);
  if (entry.resumedFrom) console.log(`Resumed:    from ${entry.resumedFrom}`);
  if (entry.messageCount) console.log(`Messages:   ${entry.messageCount}`);
  if (entry.lastUserPrompt) {
    console.log('');
    console.log('Last prompt:');
    console.log(`  ${entry.lastUserPrompt}`);
  }
  console.log('');
}

function cmdResume(parsed) {
  const all = sessionIndex.listSessions(SESSIONS_DIR);
  const id = resolveSessionId(parsed.args[0], all);
  if (!id) {
    console.error(`No session matches "${parsed.args[0]}".`);
    process.exit(1);
  }
  const entry = sessionIndex.getEntry(SESSIONS_DIR, id);
  if (!entry) {
    console.error('Entry not found.');
    process.exit(1);
  }
  if (entry.status === 'active') {
    console.error('That session is still marked active. End it first with `shards-sessions end <id>` or via the UI.');
    process.exit(1);
  }

  // We can't re-exec claude from inside this process and have it land in the
  // user's terminal, so print the exact command they need to run. This also
  // works cleanly inside a Claude Code session — the user can copy-paste.
  console.log('');
  console.log(`To resume this session, run:`);
  console.log('');
  console.log(`  claude --resume ${entry.sessionId}`);
  console.log('');
  console.log(`(agent: ${entry.agent || '—'}, project: ${entry.projectDir || entry.projectName || '—'}, phase: ${entry.phase == null ? '—' : entry.phase})`);
  console.log('');
}

function cmdEnd(parsed) {
  const all = sessionIndex.listSessions(SESSIONS_DIR);
  const id = resolveSessionId(parsed.args[0], all);
  if (!id) {
    console.error(`No session matches "${parsed.args[0]}".`);
    process.exit(1);
  }
  const entry = sessionIndex.getEntry(SESSIONS_DIR, id);
  if (!entry) {
    console.error('Entry not found.');
    process.exit(1);
  }
  if (entry.status !== 'active') {
    console.log(`Session ${short(id)} is already ${entry.status}.`);
    return;
  }
  // Snapshot gate state at end-of-session so CLI-ended sessions match the
  // shape written by the UI's POST /chat/end path (src/ui/server.js).
  const snap = readGateSnapshot();
  sessionIndex.markEnded(SESSIONS_DIR, id, {
    reason: 'cli_end',
    gateOpenAtEnd: snap.gateOpenAtEnd,
  });
  if (typeof snap.phase === 'number') {
    sessionIndex.updatePhase(SESSIONS_DIR, id, snap.phase);
  }
  console.log(`Marked session ${short(id)} as ended in the index.`);
  if (snap.gateOpenAtEnd) console.log(`Captured open gate at end: ${snap.gateOpenAtEnd}`);
  console.log(`Note: this does not kill a live claude process — if one is running for this session, end it from its terminal or the UI.`);
}

function cmdHelp() {
  console.log(`
shards-sessions — list, inspect, resume, and end Shards chat sessions

Usage:
  shards-sessions list [--status active|ended|abandoned] [--agent <name>] [--project <dir>] [--limit N]
  shards-sessions show <id|prefix>
  shards-sessions resume <id|prefix>      Prints the \`claude --resume\` command to run
  shards-sessions end <id|prefix>         Marks an active entry as ended in INDEX.json

Tips:
  Session IDs accept any unique prefix (typically 8 chars is plenty).
  All commands operate on .shards/sessions/INDEX.json in the current directory.
`);
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

const raw = process.argv.slice(2);
const cmd = raw[0] || 'list';
const parsed = parseFlags(raw.slice(1));

switch (cmd) {
  case 'list': cmdList(parsed); break;
  case 'show': cmdShow(parsed); break;
  case 'resume': cmdResume(parsed); break;
  case 'end': cmdEnd(parsed); break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp(); break;
  default:
    console.error(`Unknown command: ${cmd}`);
    cmdHelp();
    process.exit(2);
}
