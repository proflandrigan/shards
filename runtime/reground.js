'use strict';
// Re-grounding (E11.7). buildReground(ctx) renders the full re-ground block: persona summary,
// current phase/track, confirmed gates (with commit SHAs) and pending/suspended gates.
// event in {'activate','load_phase','compact','version_change'}.
// TODO(E11.7): compaction/version_change behaviour (trimmed vs full re-ground, once-per-version) is not built yet; those events return ''.
const EVENTS = ['activate', 'load_phase', 'compact', 'version_change'];

function resolveSession(ctx) {
  if (!ctx || !ctx.root) return null;
  let state = ctx.state;
  if (!state) {
    if (!ctx.sessionKey) return null;
    const { StateStore } = require('./state/store');
    state = new StateStore(ctx.root, ctx.sessionKey);
  }
  return { root: ctx.root, sessionKey: ctx.sessionKey, state };
}

// ctx: {root, sessionKey, state?, agent?}. Returns '' when no session can be resolved.
function buildReground(ctx) {
  const session = resolveSession(ctx);
  if (!session) return '';
  const { loadAgents, readPersonaSummary } = require('./agents');
  const gates = require('./gates');
  const frames = session.state.read('frames').frames || [];
  const top = frames[frames.length - 1];
  const agentId = ctx.agent || (top && top.agent);
  const lines = ['--- Re-ground ---'];
  if (agentId) {
    const a = loadAgents().get(agentId);
    const persona = a && !a.error ? readPersonaSummary(a).trim() : '';
    lines.push(`Agent: ${agentId}`);
    if (persona) lines.push('Persona summary:', persona);
  }
  if (top) {
    lines.push(`Current phase: ${top.phase === undefined || top.phase === null ? '-' : top.phase}${top.track ? ` (track ${top.track})` : ''}`);
    if (top.project) lines.push(`Project: ${top.project}`);
  }
  const all = gates.listGates(session);
  const confirmed = all.filter((g) => g.status === 'confirmed');
  const open = all.filter((g) => g.status === 'pending' || g.status === 'suspended');
  lines.push('Confirmed gates:');
  if (!confirmed.length) lines.push('  (none)');
  for (const g of confirmed) {
    const c = g.commit || {};
    lines.push(`  - ${g.id}${c.sha ? ` sha=${String(c.sha).slice(0, 12)}` : ''}${c.outcome ? ` outcome=${c.outcome}` : ''}`);
  }
  lines.push('Pending/suspended gates:');
  if (!open.length) lines.push('  (none)');
  for (const g of open) lines.push(`  - ${g.id} (${g.status}, kind ${g.kind}, phase ${g.phase})`);
  return lines.join('\n');
}

async function regroundHook(event, ctx) {
  let text = '';
  if (event === 'load_phase' || event === 'activate') {
    try { text = buildReground(ctx); } catch (_) { text = ''; }
  }
  return { event, text };
}

function shouldReground(lastSeenVersion, currentVersion) {
  return lastSeenVersion !== currentVersion;
}

module.exports = { regroundHook, buildReground, shouldReground, EVENTS };
