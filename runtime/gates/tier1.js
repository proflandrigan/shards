'use strict';
// Tier 1 (E11.3): MCP elicitation form. Approve / Request changes + optional note.
const { operatorConfirmLines } = require('./confirm-command');
const DEFAULT_TIMEOUT_MS = 60000;

function supportsElicitation(ctx) {
  try {
    const caps = typeof ctx.clientCapabilities === 'function' ? ctx.clientCapabilities() : null;
    const e = caps && caps.elicitation;
    if (!e || typeof e !== 'object') return false;
    return !!e.form || Object.keys(e).length === 0;
  } catch (_) { return false; }
}

// -> {outcome:'approved'|'changes'|'declined'|'unsupported'|'timeout'|'error', note?}
// 'declined' only for a real decline/cancel answer from a shown form; 'timeout'/'error' mean the
// form may never have been shown (headless hosts fail or time out immediately).
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
      new Promise((_, rej) => { timer = setTimeout(() => { const e = new Error('elicitation timed out'); e.shardsTimeout = true; rej(e); }, timeout); if (timer.unref) timer.unref(); }),
    ]);
    if (!res || typeof res !== 'object') return { outcome: 'error' };
    if (res.action === 'decline' || res.action === 'cancel') return { outcome: 'declined' };
    if (res.action !== 'accept') return { outcome: 'error' };
    const c = res.content || {};
    const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined;
    if (c.decision === 'approve') return { outcome: 'approved', ...(note ? { note } : {}) };
    if (c.decision === 'request_changes') return { outcome: 'changes', note: note || 'Changes requested (no note given).' };
    return { outcome: 'declined' };
  } catch (e) {
    const timedOut = (e && e.shardsTimeout) || /timed? ?out/i.test(String(e && e.message));
    return { outcome: timedOut ? 'timeout' : 'error' };
  } finally { clearTimeout(timer); }
}

// outcome: the elicitGate outcome. Only 'declined' means a form was shown and dismissed.
// (Legacy callers may pass elicitation:true, which is treated as 'declined'.)
function describeConfirmHow(gateId, sessionKey, { outcome, elicitation = false, host } = {}) {
  const lines = [];
  const o = outcome || (elicitation ? 'declined' : 'unsupported');
  if (o === 'declined') lines.push('A confirmation form was shown but dismissed without a decision; the gate is still pending.');
  else if (o === 'timeout' || o === 'error') lines.push('No confirmation form could be completed in this client; the gate is still pending.');
  lines.push(
    `Gate ${gateId} is waiting for human confirmation. To confirm:`,
    '  1. The user replies in chat with their decision (approve, or what to change).',
    `  2. Only after that reply, call gate_confirm(id="${gateId}", decision="confirmed"|"changes_requested", user_reply=<their words>).`,
    'Never confirm without a fresh user reply.',
    'Operator alternative; the user can run:',
    ...operatorConfirmLines(gateId, sessionKey),
  );
  if (host === 'codex') lines.push('(Codex: forms and gate_advance are unavailable; chat reply plus gate_confirm is the path.)');
  return lines.join('\n');
}

module.exports = { elicitGate, describeConfirmHow, supportsElicitation, DEFAULT_TIMEOUT_MS };
