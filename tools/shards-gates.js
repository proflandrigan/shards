#!/usr/bin/env node
// shards-gates — diagnostics CLI for gate state
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');
const STATE_FILE = path.join(GATE_DIR, 'state.json');
const VIOLATIONS_FILE = path.join(GATE_DIR, 'violations.jsonl');
const HISTORY_FILE = path.join(GATE_DIR, 'gates.jsonl');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { open: false, history: [] }; }
}

function readJsonl(file, limit) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return limit ? entries.slice(-limit) : entries;
  } catch { return []; }
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
      const kindTag = h.kind === 'checkpoint' ? ' [checkpoint]' : h.kind === 'final' ? ' [final]' : '';
      console.log(`  [${h.id}]${kindTag} phase=${h.phase} opened=${formatDate(h.opened_at)} closed=${formatDate(h.closed_at)}`);
    }
  }
  console.log('');
}

function cmdCheckpoints() {
  const s = readState();
  const entries = (s.history || []).filter(h => h.kind === 'checkpoint');
  if (entries.length === 0) {
    console.log('\nNo checkpoint gates recorded in the current session.\n');
    return;
  }
  console.log(`\n── Checkpoint History (${entries.length} entries) ──────────────`);
  for (const h of entries) {
    console.log(`  [${h.id}] phase=${h.phase} opened=${formatDate(h.opened_at)} closed=${formatDate(h.closed_at)} via=${h.confirmed_by || '—'}`);
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
  try {
    fs.mkdirSync(GATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
    // Log to violations
    const entry = JSON.stringify({
      type: 'operator-force-close',
      gate_id: s.id || 'unknown',
      reason: 'operator force-close',
      ts: new Date().toISOString(),
    });
    fs.appendFileSync(VIOLATIONS_FILE, entry + '\n');
    console.log(wasOpen ? `\nForce-closed gate '${s.id}'.\n` : '\nGate was already closed.\n');
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
  shards-gates checkpoints     List checkpoint-kind gates in the current session
  shards-gates violations      Tail violations.jsonl
  shards-gates force-close     Force-close an open gate (operator override)
`);
}
