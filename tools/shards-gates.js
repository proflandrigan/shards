#!/usr/bin/env node
// shards-gates — diagnostics CLI for gate state
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');
const AUTO_DIR = path.join(process.cwd(), '.shards', 'auto');
const STATE_FILE = path.join(GATE_DIR, 'state.json');
const VIOLATIONS_FILE = path.join(GATE_DIR, 'violations.jsonl');
const HISTORY_FILE = path.join(GATE_DIR, 'gates.jsonl');
const AUTO_STATE_FILE = path.join(AUTO_DIR, 'state.json');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { open: false, history: [] }; }
}

function readAutoState() {
  try { return JSON.parse(fs.readFileSync(AUTO_STATE_FILE, 'utf8')); }
  catch { return { open: false, history: [] }; }
}

function readJsonl(file, limit) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return limit ? entries.slice(-limit) : entries;
  } catch { return []; }
}

// Atomic write helper — mirrors tools/gate-hook/state.js. Used by
// force-close so an operator override doesn't get clobbered by a concurrent
// reader / writer.
function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdStatus() {
  const s = readState();
  console.log('\n── Gate Status ──────────────────────────────');
  if (s.open) {
    console.log(`  Status:    OPEN`);
    console.log(`  Gate ID:   ${s.id}`);
    console.log(`  Phase:     ${s.phase || '?'}`);
    console.log(`  Kind:      ${s.kind || '?'}`);
    console.log(`  Agent:     ${s.agent || '?'}`);
    console.log(`  Opened at: ${formatDate(s.opened_at)}`);
  } else {
    console.log('  Status:    closed');
  }

  const history = (s.history || []).slice(-10);
  if (history.length > 0) {
    console.log('\n── Last 10 Gates ────────────────────────────');
    for (const h of history) {
      const kindTag = h.kind && h.kind !== 'phase' ? ` [${h.kind}]` : '';
      console.log(`  [${h.id}]${kindTag} phase=${h.phase} opened=${formatDate(h.opened_at)} closed=${formatDate(h.closed_at)}`);
    }
  }
  console.log('');
}

// `checkpoint` and `confirm` are both non-advancing kinds. Advisory-mode
// checkpoints (SHARDS_CHECKPOINT_ENFORCE=0) are logged only to the JSONL
// history file — they never enter state.json.history. To give an accurate
// view we merge both sources, dedup'ing by (gate_id, opened_at|ts).
const CHECKPOINT_KINDS = new Set(['checkpoint', 'confirm']);

function cmdCheckpoints() {
  const s = readState();
  const stateEntries = (s.history || []).filter(h => h.kind && CHECKPOINT_KINDS.has(h.kind));
  const jsonl = readJsonl(HISTORY_FILE);
  // Advisory-mode entries: { event: 'advisory', kind, gate_id, phase, ts }.
  // Opened/closed pairs: { event, gate_id, kind, ts, ... }.
  // We keep advisories and opened-events as separate rows since advisories
  // never have a corresponding close.
  const jsonlEntries = jsonl.filter(e =>
    e && e.kind && CHECKPOINT_KINDS.has(e.kind) &&
    (e.event === 'advisory' || e.event === 'opened')
  );

  // Dedup: state.history entries are confirmed closes; the same gate also
  // appears in jsonl as an 'opened' event. Drop jsonl 'opened' rows that have
  // a corresponding closed entry in state.history by gate_id+opened_at.
  const closedKeys = new Set(
    stateEntries.map(h => `${h.id}|${h.opened_at || ''}`)
  );

  const merged = [
    ...stateEntries.map(h => ({
      source: 'state',
      id: h.id,
      kind: h.kind,
      phase: h.phase,
      opened_at: h.opened_at,
      closed_at: h.closed_at,
      confirmed_by: h.confirmed_by,
    })),
    ...jsonlEntries
      .filter(e => {
        if (e.event !== 'opened') return true; // advisory always shown
        // Skip opened rows whose close is already in state.history.
        return !closedKeys.has(`${e.gate_id}|${e.ts || ''}`) &&
               ![...closedKeys].some(k => k.startsWith(`${e.gate_id}|`));
      })
      .map(e => ({
        source: 'jsonl',
        id: e.gate_id,
        kind: e.kind,
        phase: e.phase,
        opened_at: e.ts,
        closed_at: null,
        advisory: e.event === 'advisory',
      })),
  ];

  if (merged.length === 0) {
    console.log('\nNo checkpoint gates recorded in the current session.\n');
    return;
  }

  console.log(`\n── Checkpoint / Confirm History (${merged.length} entries) ──────────────`);
  for (const h of merged) {
    const tag = h.advisory ? ' [advisory]' : '';
    const kindLabel = h.kind ? `kind=${h.kind} ` : '';
    console.log(`  [${h.id}]${tag} ${kindLabel}phase=${h.phase} opened=${formatDate(h.opened_at)} closed=${formatDate(h.closed_at)} via=${h.confirmed_by || '—'}`);
  }
  console.log('');
}

function cmdHistory() {
  const entries = readJsonl(HISTORY_FILE);
  if (entries.length === 0) {
    console.log('\nNo gate history yet.\n');
    return;
  }
  console.log(`\n── Gate History (${entries.length} entries) ──────────────`);
  for (const e of entries) {
    console.log(`  [${e.ts}] ${e.event} gate=${e.gate_id}`);
  }
  console.log('');
}

function cmdViolations() {
  const entries = readJsonl(VIOLATIONS_FILE);
  if (entries.length === 0) {
    console.log('\nNo violations recorded.\n');
    return;
  }
  console.log(`\n── Violations (${entries.length} total) ──────────────────`);
  for (const e of entries) {
    console.log(`  [${e.ts}] ${e.type} gate=${e.gate_id} reason=${e.reason}`);
  }
  console.log('');
}

function cmdForceClose() {
  const s = readState();
  const wasOpen = s.open;
  const newState = {
    open: false,
    history: [...(s.history || []), {
      id: s.id || 'unknown',
      phase: s.phase,
      kind: s.kind,
      opened_at: s.opened_at,
      closed_at: new Date().toISOString(),
      confirmed_by: 'operator-force-close',
    }],
  };

  // Also reset auto-verify state. If an auto-verify block was open, its
  // budget would otherwise remain live after the operator override and the
  // next bulk-read tool call could be silently auto-approved against the
  // wishes of the operator who just force-closed the session.
  const auto = readAutoState();
  const autoWasOpen = !!auto.open;
  let autoReset = null;
  if (autoWasOpen) {
    autoReset = {
      open: false,
      history: [...(auto.history || []), {
        id: auto.id || 'unknown',
        agent: auto.agent || null,
        phase: auto.phase || null,
        opened_at: auto.opened_at || null,
        closed_at: new Date().toISOString(),
        closed_reason: 'operator-force-close',
        approvals_used: (auto.tool_budget_initial || 0) - (auto.tool_budget_remaining || 0),
      }],
    };
  }

  try {
    fs.mkdirSync(GATE_DIR, { recursive: true });
    atomicWriteJson(STATE_FILE, newState);
    if (autoReset) {
      atomicWriteJson(AUTO_STATE_FILE, autoReset);
    }
    // Log to violations
    const entry = JSON.stringify({
      type: 'operator-force-close',
      gate_id: s.id || 'unknown',
      auto_verify_was_open: autoWasOpen,
      auto_block_id: auto.id || null,
      reason: 'operator force-close',
      ts: new Date().toISOString(),
    });
    fs.appendFileSync(VIOLATIONS_FILE, entry + '\n');

    if (wasOpen) {
      console.log(`\nForce-closed gate '${s.id}'.`);
    } else {
      console.log('\nGate was already closed.');
    }
    if (autoWasOpen) {
      console.log(`Also reset auto-verify block '${auto.id}' (was open).`);
    } else {
      console.log('Auto-verify state was already closed.');
    }
    console.log('');
  } catch (err) {
    console.error('Error force-closing gate:', err.message);
  }
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

const cmd = process.argv[2] || 'status';

switch (cmd) {
  case 'status':      cmdStatus(); break;
  case 'history':     cmdHistory(); break;
  case 'checkpoints': cmdCheckpoints(); break;
  case 'violations':  cmdViolations(); break;
  case 'force-close': cmdForceClose(); break;
  default:
    console.log(`
shards-gates — Gate enforcement diagnostics

Usage:
  shards-gates status          Print current gate state and last 10 history entries
  shards-gates history         Full gate history dump
  shards-gates checkpoints     List checkpoint / confirm gates (merges advisory-mode entries from JSONL)
  shards-gates violations      Tail violations.jsonl
  shards-gates force-close     Force-close an open gate (and reset auto-verify) — operator override
`);
}
