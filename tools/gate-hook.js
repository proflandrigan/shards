#!/usr/bin/env node
// Gate enforcement hook for Shards — dispatches stop / pre-tool-use / user-prompt-submit
'use strict';

// Escape hatch: SHARDS_GATE_ENFORCE=0 disables all enforcement
if (process.env.SHARDS_GATE_ENFORCE === '0') process.exit(0);

const fs = require('fs');
const path = require('path');

const HOOK_DIR = path.dirname(path.resolve(__filename));
const state = require(path.join(HOOK_DIR, 'gate-hook', 'state.js'));
const autoState = require(path.join(HOOK_DIR, 'gate-hook', 'auto-state.js'));
const { parseGates, checkViolation, parseAutoVerify, NON_ADVANCING_KINDS } = require(path.join(HOOK_DIR, 'gate-hook', 'parser.js'));
const { classify } = require(path.join(HOOK_DIR, 'gate-hook', 'classify.js'));
const { readLastAssistantMessage } = require(path.join(HOOK_DIR, 'gate-hook', 'transcript.js'));
const { appendViolation, appendHistory, appendAutoHistory } = require(path.join(HOOK_DIR, 'gate-hook', 'log.js'));
const { isAutoApprovable } = require(path.join(HOOK_DIR, 'gate-hook', 'auto-allowlist.js'));
const validation = require(path.join(HOOK_DIR, 'gate-hook', 'validation.js'));
const { isForceCloseBash, isStale, sweepStale } = require(path.join(HOOK_DIR, 'gate-hook', 'sweep.js'));

// Opt-in validation enforcement. Default: off (parse-and-log only).
// Flip to 1 to have the hook block gates when validation is missing.
const VALIDATION_ENFORCE = process.env.SHARDS_VALIDATION_ENFORCE === '1';

// Checkpoint gates (kind=checkpoint) can be downgraded to advisory by setting
// SHARDS_CHECKPOINT_ENFORCE=0 — they are still logged but do not block tools.
// Phase and final gates are unaffected.
const CHECKPOINT_ENFORCE = process.env.SHARDS_CHECKPOINT_ENFORCE !== '0';

// Auto-verify mode: agents emit ::AUTO-VERIFY:: ... ::ENDAUTO:: markers to
// bracket bulk read-only verification work (grain checks, fan-out queries,
// dbt show, etc.). When the block is open, this hook auto-approves tool
// calls that match a hardcoded read-only allowlist. SHARDS_AUTO_VERIFY=0
// disables the entire branch.
const AUTO_VERIFY_ENFORCE = process.env.SHARDS_AUTO_VERIFY !== '0';
const AUTO_DEFAULT_TOOL_BUDGET = 20;
const AUTO_MAX_TOOL_BUDGET = 50;
const AUTO_DEFAULT_TTL_MINUTES = 10;
const AUTO_MAX_TTL_MINUTES = 30;

// Read tools that are allowed while a gate is open
const ALLOWED_TOOLS = new Set(['Read', 'Glob', 'Grep']);

function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ─── Auto-verify helpers ──────────────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function openAutoVerify(open, current, sessionId) {
  const attrs = open.attrs || {};
  const requestedBudget = parseInt(attrs.tool_budget, 10);
  const tool_budget = Number.isFinite(requestedBudget)
    ? clamp(requestedBudget, 1, AUTO_MAX_TOOL_BUDGET)
    : AUTO_DEFAULT_TOOL_BUDGET;
  const requestedTtl = parseInt(attrs.ttl_minutes, 10);
  const ttl_minutes = Number.isFinite(requestedTtl)
    ? clamp(requestedTtl, 1, AUTO_MAX_TTL_MINUTES)
    : AUTO_DEFAULT_TTL_MINUTES;

  const opened_at = new Date();
  const expires_at = new Date(opened_at.getTime() + ttl_minutes * 60 * 1000);

  const id = `auto-${opened_at.getTime()}`;
  const newState = {
    open: true,
    id,
    agent: attrs.agent || null,
    phase: attrs.phase || null,
    opened_at: opened_at.toISOString(),
    expires_at: expires_at.toISOString(),
    tool_budget_initial: tool_budget,
    tool_budget_remaining: tool_budget,
    history: current.history || [],
  };
  autoState.write(newState);
  appendAutoHistory({
    event: 'opened', block_id: id, agent: attrs.agent || null,
    phase: attrs.phase || null, tool_budget, ttl_minutes,
    session_id: sessionId,
  });
  return newState;
}

function closeAutoVerify(current, sessionId, reason) {
  const next = autoState.close(current, reason);
  autoState.write(next);
  appendAutoHistory({
    event: 'closed', reason,
    block_id: current.id, agent: current.agent, session_id: sessionId,
  });
  return next;
}

function processAutoVerifyMarkers(lastMsg, sessionId) {
  if (!AUTO_VERIFY_ENFORCE) return;
  const av = parseAutoVerify(lastMsg);

  const closes = av.closes || (av.close ? [av.close] : []);

  // No markers — nothing to do.
  if (av.opens.length === 0 && closes.length === 0) return;

  // Position-aware processing: apply markers in order so a message containing
  // both open and close markers is handled correctly. All closes are
  // processed (not just the first) — a message can legitimately open, close,
  // re-open, and close again within one assistant turn.
  const events = [];
  for (const o of av.opens) events.push({ kind: 'open', index: o.index, marker: o });
  for (const c of closes) events.push({ kind: 'close', index: c.index });
  events.sort((a, b) => a.index - b.index);

  let cur = autoState.read();
  for (const ev of events) {
    if (ev.kind === 'open') {
      // If already open, treat as a re-open (close existing first so the audit
      // log records the transition cleanly).
      if (cur.open) cur = closeAutoVerify(cur, sessionId, 'reopened');
      cur = openAutoVerify(ev.marker, cur, sessionId);
    } else {
      if (cur.open) cur = closeAutoVerify(cur, sessionId, 'endauto-marker');
    }
  }
}

// ─── Stop handler ─────────────────────────────────────────────────────────────

function handleStop(payload) {
  const transcriptPath = payload.transcript_path;
  const sessionId = payload.session_id || 'unknown';

  // Stale-gate sweep — clear before processing this Stop event so a stuck
  // prior-session gate can't shadow a fresh open below.
  const existing = state.read();
  if (isStale(existing)) sweepStale(existing, sessionId);

  const lastMsg = readLastAssistantMessage(transcriptPath);
  if (!lastMsg) return;

  // Parse gates first (cheap, side-effect-free) so a thrown exception inside
  // processAutoVerifyMarkers cannot prevent the gate from being opened. Auto-
  // verify and gate handling are isolated so each can fail independently and
  // still surface in the audit log.
  const gates = parseGates(lastMsg);

  try {
    processAutoVerifyMarkers(lastMsg, sessionId);
  } catch (err) {
    try {
      appendViolation({
        type: 'auto-verify-error',
        reason: (err && err.message) || String(err),
        session_id: sessionId,
      });
    } catch {}
  }

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

  // Advisory mode for non-advancing kinds (checkpoint, confirm): if this gate
  // is a mid-build/micro-confirmation seam and SHARDS_CHECKPOINT_ENFORCE=0,
  // log the advisory and exit without opening state — downstream tool calls
  // remain unblocked. Phase / final / execute / handoff gates always enforce.
  const gateKind = kind || 'phase';
  if (NON_ADVANCING_KINDS.has(gateKind) && !CHECKPOINT_ENFORCE) {
    appendHistory({
      event: 'advisory',
      kind: gateKind,
      gate_id: id,
      phase: phase || null,
      session_id: sessionId,
    });
    return;
  }

  // Validation enforcement: if the gate declares `validates=<checklist>`, check
  // the `## Validation` section in project-specs.md before opening.
  // Non-advancing kinds (checkpoint, confirm) are build-time/micro punctuation
  // and never carry a validates= field; validation evidence is a phase-gate
  // concern.
  const validates = NON_ADVANCING_KINDS.has(gateKind) ? null : gate.attrs.validates;
  if (validates && validates !== 'none') {
    const specs = validation.readSpecs();
    const parsed = validation.parseValidationSection(specs);
    const errors = validation.checkValidation(parsed);
    if (errors.length > 0) {
      appendViolation({
        type: 'validation-missing',
        gate_id: id,
        checklist: validates,
        errors,
        session_id: sessionId,
      });
      if (VALIDATION_ENFORCE) {
        respond({
          decision: 'block',
          reason: validation.formatValidationError(validates, gate.attrs, errors),
        });
        return;  // do not open gate
      }
      // Soft-launch mode: log but do not block.
    } else {
      appendHistory({
        event: 'validation-passed',
        gate_id: id,
        checklist: validates,
        evidence_rows: parsed.evidenceRows.length,
        track: parsed.track,
        mode: parsed.mode || null,
      });
    }
  }

  // Open the gate
  const current = state.read();
  const newState = {
    open: true,
    id,
    phase: phase || null,
    kind: gateKind,
    agent: agent || sessionId,
    opened_at: new Date().toISOString(),
    opened_in_turn: payload.turn_number || null,
    transcript_ref: transcriptPath || null,
    history: current.history || [],
  };
  state.write(newState);
  appendHistory({ event: 'opened', gate_id: id, kind: gateKind, session_id: sessionId });
}

// ─── PreToolUse handler ───────────────────────────────────────────────────────

function handlePreToolUse(payload) {
  let s = state.read();
  const toolName = payload.tool_name || '';
  const sessionId = payload.session_id || 'unknown';

  // Stale-gate sweep — clear malformed / abandoned gates before the block
  // check. Catches the test-gate-leftover case where state.json was hand-
  // written with no opened_at, plus genuinely abandoned gates older than 24h.
  if (isStale(s)) {
    s = sweepStale(s, sessionId);
  }

  // Branch 1: a gate is open. Existing block behavior — gates always win,
  // except for the operator force-close escape hatch.
  if (s.open) {
    if (ALLOWED_TOOLS.has(toolName)) return;
    if (isForceCloseBash(toolName, payload.tool_input)) return;

    const gateKind = s.kind || 'phase';
    const label = (
      gateKind === 'checkpoint' ? 'Checkpoint gate — a component was just tested and awaits user confirmation before the next component can be written.' :
      gateKind === 'confirm'    ? 'Confirm gate — micro-confirmation checkpoint; await explicit user confirmation before continuing.' :
      gateKind === 'execute'    ? 'Execute gate — an experiment/AR iteration completed; await user confirmation before advancing.' :
      gateKind === 'handoff'    ? 'Handoff gate — specialist-to-specialist transition; await user confirmation before handing off.' :
      gateKind === 'final'      ? 'Final gate — last phase of this track; await user confirmation before closing out.' :
                                  'Phase gate — await user confirmation before advancing.'
    );

    const msg = [
      `::GATE-BLOCK:: Gate '${s.id}' (phase ${s.phase}, kind ${gateKind}) is still open.`,
      label,
      `Opened at ${s.opened_at}. User must confirm before you can proceed.`,
      `If the user just confirmed, the UserPromptSubmit hook should have closed`,
      `the gate — if it did not, the confirmation language was ambiguous. Ask`,
      `the user for an explicit "confirmed" / "proceed".`,
    ].join('\n');

    // Use the canonical PreToolUse hook contract (hookSpecificOutput.permission
    // Decision) so the deny is recognized authoritatively across CC versions
    // and matches the shape used by the auto-verify allow path below and by
    // src/ui/relay.js. Legacy `decision: 'block'` is reserved for Stop hooks.
    respond({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: msg,
      },
    });
    return;
  }

  // Branch 2: no gate open — check auto-verify.
  if (!AUTO_VERIFY_ENFORCE) return;
  const a = autoState.read();
  if (!a.open) return;

  // Expired? Close and pass through.
  if (autoState.isExpired(a)) {
    const reason = (typeof a.tool_budget_remaining === 'number' && a.tool_budget_remaining <= 0)
      ? 'budget-exhausted' : 'ttl-expired';
    autoState.write(autoState.close(a, reason));
    appendAutoHistory({ event: 'closed', reason, block_id: a.id });
    return;
  }

  // Allowlist check.
  if (!isAutoApprovable(toolName, payload.tool_input || {})) return;

  // Decrement the budget atomically — read immediately before write to keep
  // the race window tight, then verify the on-disk value to detect concurrent
  // writers (two CC instances, parallel hook invocations). On drift, retry up
  // to 3 times before giving up. If we can't safely decrement, fall through
  // without emitting allow so CC's normal permission flow takes over.
  let approvedState = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = autoState.read();
    if (!fresh.open || fresh.id !== a.id) break;  // block was closed or rotated
    const remaining = (fresh.tool_budget_remaining || 0) - 1;
    if (remaining < 0) break;  // exhausted between branch entry and now
    const candidate = { ...fresh, tool_budget_remaining: remaining };
    autoState.write(candidate);
    const after = autoState.read();
    if (after.id === candidate.id && after.tool_budget_remaining === remaining) {
      approvedState = candidate;
      break;
    }
    // Drift detected — another writer overwrote us. Retry.
  }
  if (!approvedState) return;

  appendAutoHistory({
    event: 'auto-approved',
    block_id: approvedState.id,
    tool: toolName,
    command: (payload.tool_input && payload.tool_input.command) || null,
    budget_remaining: approvedState.tool_budget_remaining,
  });

  respond({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `auto-verify (block ${approvedState.id}, ${approvedState.tool_budget_remaining} approvals remaining)`,
    },
  });
}

// ─── UserPromptSubmit handler ─────────────────────────────────────────────────

// Patterns that should close any open auto-verify block immediately, even if
// no gate is open. These are stronger than the gate-classify "deny" patterns —
// we want to err on the side of closing the auto-verify block whenever the
// user expresses any concern or signals a stop.
const AUTO_HALT_RE = /\b(stop|halt|pause|cancel|abort|wait|hold(\s+on)?|no thanks|nope|don'?t)\b/i;

function maybeCloseAutoOnPrompt(prompt) {
  if (!AUTO_VERIFY_ENFORCE) return;
  const a = autoState.read();
  if (!a.open) return;
  if (!prompt || !AUTO_HALT_RE.test(prompt)) return;
  autoState.write(autoState.close(a, 'user-halt'));
  appendAutoHistory({ event: 'closed', reason: 'user-halt', block_id: a.id });
}

function handleUserPromptSubmit(payload) {
  const prompt = payload.prompt || '';

  // Auto-verify halt on user dissent — independent of gate state.
  maybeCloseAutoOnPrompt(prompt);

  const s = state.read();
  if (!s.open) return;

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
    appendHistory({ event: 'closed', gate_id: s.id, kind: s.kind || 'phase', confirmed_by: 'user-prompt' });
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
  } catch (err) {
    // Never crash the hook — but DO record the failure so that "the gate hook
    // silently did nothing" is debuggable. A swallowed exception here used to
    // mean an open auto-verify block could be left in a stale state with no
    // audit trail; now the violation log captures the symptom even when stdout
    // stays empty. The append is best-effort: a second exception here is
    // intentionally swallowed.
    try {
      appendViolation({
        type: 'hook-exception',
        event,
        reason: (err && err.message) || String(err),
        stack: (err && err.stack) ? String(err.stack).split('\n').slice(0, 5).join('\n') : null,
        session_id: payload && payload.session_id || null,
      });
    } catch {}
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
