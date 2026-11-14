'use strict';
// Tier 1 (E11.3): MCP elicitation form. Approve / Request changes + optional note.
const DEFAULT_TIMEOUT_MS = 60000;

function supportsElicitation(ctx) {
  try {
    const caps = typeof ctx.clientCapabilities === 'function' ? ctx.clientCapabilities() : null;
    const e = caps && caps.elicitation;
    if (!e || typeof e !== 'object') return false;
    return !!e.form || Object.keys(e).length === 0;
  } catch (_) { return false; }
}

// -> {outcome:'approved'|'changes'|'declined'|'unsupported'|'error', note?}
async function elicitGate(ctx, entry) {
  if (typeof ctx.elicit !== 'function' || !supportsElicitation(ctx)) return { outcome: 'unsupported' };
  const timeout = Number.isFinite(ctx.elicitTimeoutMs) ? ctx.elicitTimeoutMs : DEFAULT_TIMEOUT_MS;
  const message = [
    `Gate ${entry.id} (kind ${entry.kind}, phase ${entry.phase}) is waiting for your decision.`,
    entry.summary ? `Summary: ${entry.summary}` : '',
  ].filter(Boolean).join('\n');
  const params = {
    mode: 'form', message,
    requestedSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', title: 'Decision', enum: ['approve', 'request_changes'], enumNames: ['Approve', 'Request changes'] },
        note: { type: 'string', title: 'Note (optional; what to change)' },
      },
      required: ['decision'],
    },
  };
  let timer;
  try {
    const res = await Promise.race([
      ctx.elicit(params, { timeout }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('elicitation timed out')), timeout); if (timer.unref) timer.unref(); }),
    ]);
    if (!res || res.action !== 'accept') return { outcome: 'declined' };
    const c = res.content || {};
    const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined;
    if (c.decision === 'approve') return { outcome: 'approved', ...(note ? { note } : {}) };
    if (c.decision === 'request_changes') return { outcome: 'changes', note: note || 'Changes requested (no note given).' };
    return { outcome: 'declined' };
  } catch (_) { return { outcome: 'error' }; } finally { clearTimeout(timer); }
}

function describeConfirmHow(gateId, sessionKey, { elicitation = false, host } = {}) {
  const lines = [];
  if (elicitation) lines.push('A confirmation form was shown but not answered; the gate is still pending.');
  lines.push(
    `Gate ${gateId} is waiting for human confirmation. To confirm:`,
    '  1. The user replies in chat with their decision (approve, or what to change).',
    `  2. Only after that reply, call gate_confirm(id="${gateId}", decision="confirmed"|"changes_requested", user_reply=<their words>).`,
    'Never confirm without a fresh user reply.',
    'Operator alternative; the user can run:',
    `  node cli/shards.js gates confirm ${gateId} --session ${sessionKey}`,
    `  node cli/shards.js gates confirm ${gateId} --session ${sessionKey} --changes "<note>"`,
  );
  if (host === 'codex') lines.push('(Codex: forms and gate_advance are unavailable; chat reply plus gate_confirm is the path.)');
  return lines.join('\n');
}

module.exports = { elicitGate, describeConfirmHow, supportsElicitation, DEFAULT_TIMEOUT_MS };
