'use strict';
// gate_request (E11.2): the agent asks for a human gate. It can only open a gate; the agent
// can never confirm it (D8). Confirmation happens out of band (interim operator CLI, E11.13).
const fs = require('fs');
const path = require('path');
const { defineTool } = require('../registry');
const schema = require('../../core/schema/gate-request.schema.json');
const gates = require('../gates');
const { parseValidationSection, checkValidation, _internals } = require('../lib/validation');

const { ERROR_DESCRIPTIONS } = _internals;

function describeErr(e) {
  const base = ERROR_DESCRIPTIONS[e.code] || e.code;
  return e.row ? `row ${e.row}: ${base}${e.got ? ` (got: "${e.got}")` : ''}` : base;
}

function formatValidationToolError(checklist, id, kind, phase, errors) {
  return [
    'Validation evidence is missing or incomplete; the gate was NOT opened.',
    '',
    `Required checklist: ${checklist}/validation_checklist.md`,
    `Gate: ${id} (phase ${phase}, kind ${kind})`,
    '',
    'Problems:',
    ...errors.map((e) => `  - ${e.code}: ${describeErr(e)}`),
    '',
    'What to do:',
    '  1. Re-read the validation protocol (shared/validation_protocol.md) for the required `## Validation` section schema.',
    `  2. Re-read the ${checklist} validation checklist for the domain-specific checks.`,
    '  3. Run the checks, record observed values in the Evidence table of the record, then call gate_request again.',
    '',
    'If this phase should not require validation, call gate_request again without `validates`.',
  ].join('\n');
}

function resolveRecord(root, recordRef) {
  const rel = String(recordRef).split('#')[0];
  if (!rel) throw new Error('record_ref has no file path');
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  const r = path.relative(rootAbs, abs);
  if (r === '' || r.startsWith('..') || path.isAbsolute(r)) throw new Error(`record_ref must stay inside the project root: ${recordRef}`);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error(`record_ref file not found: ${rel}. Write the phase record before requesting the gate.`);
  return abs;
}

// The registry emits either text or data; emit prose followed by the JSON data block.
function both(text, data) { return { text: `${text}\n\n${JSON.stringify(data, null, 2)}` }; }

function normPhase(p) { return typeof p === 'string' && /^\d+$/.test(p) ? Number(p) : p; }

module.exports = defineTool({
  name: 'gate_request',
  description: 'Request a human gate at the end of a phase. Opens (or re-opens) a pending gate owned by your switch frame; you cannot confirm it. After calling, stop and wait for the user to confirm. With `validates`, the record must contain a complete `## Validation` section. A confirmed gate returns "already confirmed" and is never reopened.',
  inputSchema: schema,
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_request requires a resolved session');
    const frames = ctx.state.read('frames').frames || [];
    if (!frames.length) throw new Error('gate_request refused: no active frame. Only a switched-in specialist holds gates; consult and fan-out workers never hold gates. Activate an agent with mode=switch first.');
    const frame = frames[frames.length - 1];
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const phase = normPhase(args.phase);

    const existing = gates.getGate(session, args.id);
    if (existing && existing.status === 'confirmed') {
      return both(gates.formatConfirmedMessage(existing), { result: 'already_confirmed', gate_id: existing.id, kind: existing.kind, phase: existing.phase, status: 'confirmed', commit: existing.commit || null });
    }

    if (args.validates) {
      const abs = resolveRecord(ctx.root, args.record_ref);
      const parsed = parseValidationSection(fs.readFileSync(abs, 'utf8'));
      const errors = checkValidation(parsed);
      if (errors.length) throw new Error(formatValidationToolError(args.validates, args.id, args.kind, args.phase, errors));
    }

    const { result, entry } = await gates.requestGate(session, {
      frame, id: args.id, kind: args.kind, phase, summary: args.summary, record_ref: args.record_ref,
      validates: args.validates || null,
    });

    let replayed = null;
    try {
      const git = require('../git');
      const cfg = ctx.getConfig ? ctx.getConfig() : null;
      const gitCfg = cfg && cfg.config && cfg.config.git ? cfg.config.git : undefined;
      const r = await git.replayPending(ctx.root, gitCfg ? { config: gitCfg } : {});
      const n = Array.isArray(r) ? r.filter((x) => x && x.outcome === 'committed').length : 0;
      if (n) replayed = `replayed ${n} pending commit(s)`;
    } catch (_) { /* best effort */ }

    const how = gates.describeInterimConfirm(entry.id, ctx.sessionKey);
    const advancing = gates.ADVANCING_KINDS.includes(entry.kind);
    const lines = [];
    if (result === 'already_confirmed') return both(gates.formatConfirmedMessage(entry), { result, gate_id: entry.id, kind: entry.kind, phase: entry.phase, status: 'confirmed', commit: entry.commit || null });
    lines.push(`Gate ${entry.id} is ${result === 'already_pending' ? 'already pending' : result} (kind ${entry.kind}, phase ${entry.phase}).`);
    if (result === 'reopened' && entry.note) lines.push(`Earlier change request note: ${entry.note}`);
    lines.push('', 'STOP now and wait. You cannot confirm this gate yourself; only the user can.',
      'Do not call further tools for the next phase until the gate is confirmed.', '', how, '',
      'Once the user confirms, call the next step (load the next phase).');
    if (!advancing) lines.push(`Note: a ${entry.kind} gate is non-advancing; confirming it does not commit.`);
    if (replayed) lines.push(`(${replayed})`);
    return both(lines.join('\n'), {
      result, gate_id: entry.id, kind: entry.kind, phase: entry.phase, status: 'pending', frame: entry.frame,
      copy_queue: [], confirm: { milestone: 'A', how },
      ...(replayed ? { note: replayed } : {}),
    });
  },
});
