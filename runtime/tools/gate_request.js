'use strict';
// gate_request (E11.2): the agent asks for a human gate. It can only open a gate; the agent
// can never confirm it (D8). Confirmation happens out of band (interim operator CLI, E11.13).
const fs = require('fs');
const path = require('path');
const { defineTool } = require('../registry');
const schema = require('../../core/schema/gate-request.schema.json');
const gates = require('../gates');
const tier1 = require('../gates/tier1');
const policyMod = require('../gates/policy');
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
    '  1. Re-read the validation protocol (protocols/validation.md) for the required `## Validation` section schema.',
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

// Deliverable paths the user confirms at this gate (placement protocol). Root-relative, inside the root,
// never the root itself, never under .git/ or .shards/; normalised to forward slashes with no trailing
// slash. Backslashes are treated as separators on every platform, so `src\..\..\x` cannot slip past
// the containment check and later be read as `src/../../x` by the git collector.
function normTargets(targets) {
  if (targets === undefined) return undefined;
  const mapped = targets.map((t) => {
    if (typeof t !== 'string') throw new Error('targets must be strings');
    const s = t.replace(/\\/g, '/');
    if (path.posix.isAbsolute(s) || path.win32.isAbsolute(s)) throw new Error(`targets must be project-root-relative paths: ${t}`);
    const r = path.posix.normalize(s).replace(/\/+$/, '');
    if (r === '.' || r === '' || r === '..' || r.startsWith('../')) throw new Error(`targets must name a path inside the project root (not the root itself): ${t}`);
    const top = r.split('/')[0];
    if (top === '.git' || top === '.shards') throw new Error(`targets must not be inside ${top}/: ${t}`);
    return r;
  });
  return [...new Set(mapped)];
}

// The registry emits either text or data; emit prose followed by the JSON data block.
function bothBase(text, data) { return { text: `${text}\n\n${JSON.stringify(data, null, 2)}` }; }

// E6.8: queued external copies ride on every gate_request response so the agent retries them at this gate.
function copyNote(session) {
  let queue = []; let stuck = [];
  try { const c = require('../copies'); queue = c.queued(session); stuck = c.stuck(session); } catch (_) { /* best effort */ }
  const lines = [];
  if (queue.length) lines.push(`Queued external copies to retry now (redo each through its binding, then call copy_report): ${queue.map((q) => `${q.gate_id}->${q.target} (attempt ${q.attempts})`).join(', ')}`);
  if (stuck.length) lines.push(`Stuck copies (do not retry; tell the user): ${stuck.map((q) => `${q.gate_id}->${q.target}`).join(', ')}`);
  return { queue, stuck, text: lines.join('\n') };
}

function normPhase(p) { return typeof p === 'string' && /^\d+$/.test(p) ? Number(p) : p; }

module.exports = defineTool({
  name: 'gate_request',
  description: 'Request a human gate at the end of a phase. Opens (or re-opens) a pending gate owned by your switch frame; you cannot confirm it. After calling, stop and wait for the user to confirm. With `validates`, the record must contain a complete `## Validation` section. A confirmed gate returns "already confirmed" and is never reopened. Pass `targets` (project-root-relative paths) to record the deliverable locations the user is confirming at this gate; confirmed targets are included in the gate\'s git snapshot.',
  inputSchema: schema,
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('gate_request requires a resolved session');
    const frames = ctx.state.read('frames').frames || [];
    if (!frames.length) throw new Error('gate_request refused: no active frame. Only a switched-in specialist holds gates; consult and fan-out workers never hold gates. Activate an agent with mode=switch first.');
    const frame = frames[frames.length - 1];
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const phase = normPhase(args.phase);
    const targets = normTargets(args.targets);
    const cq = copyNote(session);
    const both = (text, data) => bothBase(cq.text ? `${text}\n${cq.text}` : text, { ...data, copy_queue: cq.queue, ...(cq.stuck.length ? { copy_stuck: cq.stuck } : {}) });

    // A confirmed gate only counts for the same agent/project/track (ids like `<agent>-phase-1` repeat).
    const existing = gates.getGate(session, args.id);
    if (existing && existing.status === 'confirmed' && gates.sameScope(existing, frame)) {
      return both(`${gates.formatConfirmedMessage(existing)}${targets !== undefined ? '\nThe targets you passed were NOT recorded: this gate is already confirmed. Pass the updated list on your next gate.' : ''}`, { result: 'already_confirmed', gate_id: existing.id, kind: existing.kind, phase: existing.phase, status: 'confirmed', commit: existing.commit || null });
    }

    if (args.validates) {
      const abs = resolveRecord(ctx.root, args.record_ref);
      const parsed = parseValidationSection(fs.readFileSync(abs, 'utf8'));
      const errors = checkValidation(parsed);
      if (errors.length) throw new Error(formatValidationToolError(args.validates, args.id, args.kind, args.phase, errors));
    }

    const { result, entry } = await gates.requestGate(session, {
      frame, id: args.id, kind: args.kind, phase, summary: args.summary, record_ref: args.record_ref,
      validates: args.validates || null, targets,
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

    const advancing = gates.ADVANCING_KINDS.includes(entry.kind);
    const lines = [];
    if (result === 'already_confirmed') return both(`${gates.formatConfirmedMessage(entry)}${targets !== undefined ? '\nThe targets you passed were NOT recorded: this gate is already confirmed. Pass the updated list on your next gate.' : ''}`, { result, gate_id: entry.id, kind: entry.kind, phase: entry.phase, status: 'confirmed', commit: entry.commit || null });

    // Gate policy (E11.8): evidence auto-records / plan notices; anything else falls through to a human.
    // Fail closed: an unreadable/invalid config means `strict`, and the error is shown to the agent.
    const { gates: gcfg, error: configError } = policyMod.resolveGatesConfig(ctx);
    const pol = await policyMod.apply(session, entry, args.evidence, gcfg, ctx.gateDeps || {});
    if (pol.handled) {
      const d = pol.entry;
      const c = pol.commit || d.commit || null;
      const msg = pol.mode === 'notice' ? 'notice recorded, continue' : 'recorded as evidence, continue';
      return both(`Gate ${d.id} (${d.kind}) ${msg}.`, { result: pol.mode === 'notice' ? 'notice' : 'recorded_evidence', gate_id: d.id, kind: d.kind, phase: d.phase, status: 'confirmed', commit: c, tier: d.proof && d.proof.tier });
    }

    // Tier 3 mark (reply must be newer than this request). Missing module is tolerated; other errors are not.
    let tier3 = null;
    try { tier3 = require('../gates/tier3'); } catch (e) { if (!(e && e.code === 'MODULE_NOT_FOUND' && /tier3/.test(e.message))) throw e; }
    if (tier3) await tier3.markRequest(session, entry.id);

    // Tier 1: MCP elicitation form, per call.
    const el = await tier1.elicitGate(ctx, entry);
    if (el.outcome === 'approved') {
      const { entry: done, commit } = await gates.confirmGate(session, entry.id, { decision: 'confirmed', proof: { tier: 'elicitation', level: 1, ts: new Date().toISOString(), action: 'accept' }, ...(el.note ? { note: el.note } : {}) });
      const c = commit || done.commit || null;
      return both(`Gate ${done.id} confirmed by the user (form). It is confirmed; proceed with the next phase.${el.note ? `\nUser note: ${el.note}` : ''}`, { result: 'confirmed', gate_id: done.id, kind: done.kind, phase: done.phase, status: 'confirmed', commit: c, tier: 'elicitation' });
    }
    if (el.outcome === 'changes') {
      const { entry: done } = await gates.confirmGate(session, entry.id, { decision: 'changes_requested', note: el.note, proof: { tier: 'elicitation', level: 1, ts: new Date().toISOString(), action: 'accept' } });
      return both(`The user requested changes to gate ${done.id}. Note: ${el.note}\nRevise the work, then call gate_request again.`, { result: 'changes_requested', gate_id: done.id, kind: done.kind, phase: done.phase, status: done.status, note: el.note, tier: 'elicitation' });
    }
    if (configError) lines.push(`WARNING: shards.config.yaml could not be loaded, so gate policy is forced to strict (a human must confirm every gate). Fix the file: ${configError}`, '');
    const how = tier1.describeConfirmHow(entry.id, ctx.sessionKey, { outcome: el.outcome, host: ctx.host });
    lines.push(`Gate ${entry.id} is ${result === 'already_pending' ? 'already pending' : result} (kind ${entry.kind}, phase ${entry.phase}).`);
    if (result === 'reopened' && entry.note) lines.push(`Earlier change request note: ${entry.note}`);
    lines.push('', 'STOP now and wait. You cannot confirm this gate yourself; only the user can.',
      'Do not call further tools for the next phase until the gate is confirmed.', '', how, '',
      'Once the user confirms, call the next step (load the next phase).');
    if (!advancing) lines.push(`Note: a ${entry.kind} gate is non-advancing; confirming it does not commit.`);
    if (replayed) lines.push(`(${replayed})`);
    return both(lines.join('\n'), {
      result, gate_id: entry.id, kind: entry.kind, phase: entry.phase, status: 'pending', frame: entry.frame,
      confirm: { milestone: 'A', how },
      ...(replayed ? { note: replayed } : {}),
      ...(configError ? { config_error: configError, policy: 'strict' } : {}),
    });
  },
});
