#!/usr/bin/env node
// Gate enforcement hook for Shards — dispatches stop / pre-tool-use / user-prompt-submit
'use strict';

// Escape hatch: SHARDS_GATE_ENFORCE=0 disables all enforcement
if (process.env.SHARDS_GATE_ENFORCE === '0') process.exit(0);

const fs = require('fs');
const path = require('path');

const HOOK_DIR = path.dirname(path.resolve(__filename));
const state = require(path.join(HOOK_DIR, 'gate-hook', 'state.js'));
const { parseGates, checkViolation } = require(path.join(HOOK_DIR, 'gate-hook', 'parser.js'));
const { classify } = require(path.join(HOOK_DIR, 'gate-hook', 'classify.js'));
const { readLastAssistantMessage } = require(path.join(HOOK_DIR, 'gate-hook', 'transcript.js'));
const { appendViolation, appendHistory } = require(path.join(HOOK_DIR, 'gate-hook', 'log.js'));

// Read tools that are allowed while a gate is open
const ALLOWED_TOOLS = new Set(['Read', 'Glob', 'Grep']);

function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ─── Stop handler ─────────────────────────────────────────────────────────────

function handleStop(payload) {
  const transcriptPath = payload.transcript_path;
  const sessionId = payload.session_id || 'unknown';

  const lastMsg = readLastAssistantMessage(transcriptPath);
  if (!lastMsg) return;

  const gates = parseGates(lastMsg);
  if (gates.length === 0) return;

  // Use the last gate found in the message
  const gate = gates[gates.length - 1];
  const { id, phase, kind, agent } = gate.attrs;

  if (!id) return;

  // Check for violation: content after ::ENDGATE::
  const violation = checkViolation(lastMsg);
  if (violation) {
    appendViolation({
      type: 'post-fence-content',
      gate_id: id,
      reason: violation,
      session_id: sessionId,
    });
    respond({
      decision: 'block',
      reason: 'Gate violation — content appeared after ::ENDGATE::. End your turn immediately.',
    });
    return;
  }

  // Open the gate
  const current = state.read();
  const newState = {
    open: true,
    id,
    phase: phase || null,
    kind: kind || 'phase',
    agent: agent || sessionId,
    opened_at: new Date().toISOString(),
    opened_in_turn: payload.turn_number || null,
    transcript_ref: transcriptPath || null,
    history: current.history || [],
  };
  state.write(newState);
  appendHistory({ event: 'opened', gate_id: id, session_id: sessionId });
}

// ─── PreToolUse handler ───────────────────────────────────────────────────────

function handlePreToolUse(payload) {
  const s = state.read();
  if (!s.open) return;

  const toolName = payload.tool_name || '';
  if (ALLOWED_TOOLS.has(toolName)) return;

  const msg = [
    `::GATE-BLOCK:: Gate '${s.id}' (phase ${s.phase}, kind ${s.kind}) is still open.`,
    `Opened at ${s.opened_at}. User must confirm before you can proceed.`,
    `If the user just confirmed, the UserPromptSubmit hook should have closed`,
    `the gate — if it did not, the confirmation language was ambiguous. Ask`,
    `the user for an explicit "confirmed" / "proceed".`,
  ].join('\n');

  respond({ decision: 'block', reason: msg });
}

// ─── UserPromptSubmit handler ─────────────────────────────────────────────────

function handleUserPromptSubmit(payload) {
  const s = state.read();
  if (!s.open) return;

  const prompt = payload.prompt || '';
  const result = classify(prompt);

  if (result === 'confirm') {
    const closed_at = new Date().toISOString();
    const historyEntry = {
      id: s.id,
      phase: s.phase,
      kind: s.kind,
      opened_at: s.opened_at,
      closed_at,
      confirmed_by: 'user-prompt',
    };
    const newState = {
      open: false,
      history: [...(s.history || []), historyEntry],
    };
    state.write(newState);
    appendHistory({ event: 'closed', gate_id: s.id, confirmed_by: 'user-prompt' });
  } else if (result === 'deny') {
    // Gate stays open — user is asking for a change
  } else {
    // Ambiguous — gate stays open, inject context reminder
    respond({
      additionalContext: `<system-reminder>\nGate '${s.id}' is still open. The user's message did not contain an explicit confirmation. Do not advance to the next phase. Ask for explicit confirmation or address their message within the current phase.\n</system-reminder>`,
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const event = process.argv[2];
  let payload = {};
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (raw && raw.trim()) payload = JSON.parse(raw);
  } catch {
    // Malformed or empty stdin — safe default
  }

  try {
    if (event === 'stop') return handleStop(payload);
    if (event === 'pre-tool-use') return handlePreToolUse(payload);
    if (event === 'user-prompt-submit') return handleUserPromptSubmit(payload);
  } catch {
    // Never crash the hook — silent exit
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
