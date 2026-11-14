'use strict';
// Confirmation tier 3 (E11.5): chat reply. The agent relays the user's reply via gate_confirm;
// the runtime verifies it against the hook-recorded prompts.jsonl (the agent cannot forge it).
// State: <session>/confirm.json = {marks:{<gate>:{prompt_hwm,marked_at,refusal_shown}}, used:{<prompt_id>:{gate,ts}}}
const fs = require('fs');
const path = require('path');
const { StateStore } = require('../state/store');
const { normalizeText } = require('../../hooks/lib/common');

const FIXED_REFUSAL = 'Reply to the gate in chat with your approval as its own message, or approve in the form/prompt; shards cannot confirm on your behalf.';
const SHORT_REFUSAL = 'Gate still waiting for the user. Stop and wait.';

function storeOf(session) {
  if (!session || !session.root) throw new Error('session.root required');
  if (session.state) return session.state;
  if (!session.sessionKey) throw new Error('session.sessionKey required');
  return new StateStore(session.root, session.sessionKey);
}

function readPrompts(state) {
  let text;
  try { text = fs.readFileSync(path.join(state.sessionDir, 'prompts.jsonl'), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r && Number.isInteger(r.prompt_id) && typeof r.text === 'string') out.push(r); } catch (_) { /* skip torn line */ }
  }
  return out;
}
const maxPromptId = (ps) => ps.reduce((m, r) => Math.max(m, r.prompt_id), 0);

async function markRequest(session, gateId) {
  const state = storeOf(session);
  await state.update('confirm', (cur) => {
    cur.marks = cur.marks || {}; cur.used = cur.used || {};
    cur.marks[gateId] = { prompt_hwm: maxPromptId(readPrompts(state)), marked_at: new Date().toISOString(), refusal_shown: false };
    return cur;
  });
}

async function confirmByReply(session, { id, decision, user_reply } = {}, deps = {}) {
  const machine = require('./machine');
  if (decision !== 'confirmed' && decision !== 'changes_requested') throw new Error(`Invalid decision ${JSON.stringify(decision)}`);
  const state = storeOf(session);
  const sess = { ...session, state };
  let accepted = null; let refusal = null;

  await state.update('confirm', (cur) => {
    cur.marks = cur.marks || {}; cur.used = cur.used || {};
    const refuse = () => {
      const m = cur.marks[id] || (cur.marks[id] = { prompt_hwm: null, marked_at: null, refusal_shown: false });
      const first = !m.refusal_shown;
      m.refusal_shown = true;
      refusal = { ok: false, refusal: first ? FIXED_REFUSAL : SHORT_REFUSAL, first };
      return cur;
    };
    const g = machine.getGate(sess, id);
    if (!g || g.status !== 'pending') return refuse();
    const mark = cur.marks[id];
    if (!mark || !Number.isInteger(mark.prompt_hwm)) return refuse();
    if (typeof user_reply !== 'string') return refuse();
    const reply = normalizeText(user_reply);
    if (!reply) return refuse();
    const cand = readPrompts(state).filter((r) => r.prompt_id > mark.prompt_hwm).sort((a, b) => a.prompt_id - b.prompt_id)[0];
    if (!cand || cand.text !== reply) return refuse();
    if (cur.used[String(cand.prompt_id)]) return refuse();
    const ts = new Date().toISOString();
    cur.used[String(cand.prompt_id)] = { gate: id, ts };
    accepted = { prompt_id: cand.prompt_id, sha256: cand.sha256, ts, text: cand.text };
    return cur;
  });
  if (refusal) return refusal;

  try {
    const r = await machine.confirmGate(sess, id, {
      decision,
      proof: { tier: 'chat-reply', level: 3, ts: accepted.ts, prompt_id: accepted.prompt_id, sha256: accepted.sha256 },
      reply: accepted.text,
      ...(decision === 'changes_requested' ? { note: accepted.text } : {}),
    }, deps);
    return { ok: true, result: r.result, entry: r.entry, ...(r.commit ? { commit: r.commit } : {}) };
  } catch (e) {
    // Confirmation did not happen: release the reservation so the reply is not burned.
    await state.update('confirm', (cur) => { if (cur.used) delete cur.used[String(accepted.prompt_id)]; return cur; });
    throw e;
  }
}

module.exports = { markRequest, confirmByReply, FIXED_REFUSAL, SHORT_REFUSAL };
