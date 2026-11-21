'use strict';
// Re-grounding (E11.7). buildReground(ctx) renders the full re-ground block: persona summary,
// current phase/track/project, frame stack, confirmed gates (with short commit SHAs),
// pending/suspended gates with the next-step hint, the copy queue and an explicit
// "do not re-ask" line. event in {'activate','load_phase','compact','resume','version_change'}.
// 'compact'/'resume' come from the SessionStart shim and return '' when the session has no
// frames and no gates (nothing to re-ground). 'version_change' is a documented no-op ('');
// version-change re-grounding is not yet wired to a trigger (see shouldReground).
const EVENTS = ['activate', 'load_phase', 'compact', 'resume', 'version_change'];
const MAX_CONFIRMED = 15;

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
  const stackLine = frames.length > 1 ? `Frame stack: ${frames.map((f) => f.agent).join(' > ')}` : '';
  const top = frames[frames.length - 1];
  const agentId = ctx.agent || (top && top.agent);
  const lines = ['--- Re-ground ---'];
  if (agentId) {
    const a = loadAgents().get(agentId);
    const persona = a && !a.error ? readPersonaSummary(a).trim() : '';
    lines.push(`Agent: ${agentId}`);
    if (persona) lines.push('Persona summary:', persona);
  }
  if (stackLine) lines.push(stackLine);
  if (top) {
    lines.push(`Current phase: ${top.phase === undefined || top.phase === null ? '-' : top.phase}${top.track ? ` (track ${top.track})` : ''}`);
    if (top.project) lines.push(`Project: ${top.project}`);
  }
  const all = gates.listGates(session);
  const confirmed = all.filter((g) => g.status === 'confirmed')
    .sort((x, y) => String(x.updated_at || '').localeCompare(String(y.updated_at || '')));
  const open = all.filter((g) => g.status === 'pending' || g.status === 'suspended');
  lines.push('Confirmed gates:');
  if (!confirmed.length) lines.push('  (none)');
  if (confirmed.length > MAX_CONFIRMED) lines.push(`  (${confirmed.length - MAX_CONFIRMED} earlier confirmed gates not shown)`);
  for (const g of confirmed.slice(-MAX_CONFIRMED)) {
    const c = g.commit || {};
    const mark = c.sha ? `sha=${String(c.sha).slice(0, 12)}` : c.outcome === 'commit_pending' || c.outcome === 'pending' || !g.commit ? 'commit_pending' : `outcome=${c.outcome}`;
    lines.push(`  - ${g.id} ${mark}`);
  }
  lines.push('Pending/suspended gates:');
  if (!open.length) lines.push('  (none)');
  for (const g of open) {
    const hint = g.status === 'pending'
      ? 'wait for the user; do NOT re-request confirmed gates'
      : 'suspended; it resumes when its frame returns to the top; do NOT re-request confirmed gates';
    lines.push(`  - ${g.id} (${g.status}, kind ${g.kind}, phase ${g.phase}) -> ${hint}`);
  }
  lines.push('Copy queue: (empty)');
  lines.push('Do not re-ask for gates listed as confirmed.');
  return lines.join('\n');
}

function hasContent(ctx) {
  const session = resolveSession(ctx);
  if (!session) return false;
  const frames = session.state.read('frames').frames || [];
  if (frames.length) return true;
  return Object.keys(session.state.read('gates').gates || {}).length > 0;
}

async function regroundHook(event, ctx) {
  let text = '';
  try {
    if (event === 'load_phase' || event === 'activate') text = buildReground(ctx);
    else if ((event === 'compact' || event === 'resume') && hasContent(ctx)) text = buildReground(ctx);
  } catch (_) { text = ''; }
  return { event, text };
}

function shouldReground(lastSeenVersion, currentVersion) {
  return lastSeenVersion !== currentVersion;
}

module.exports = { regroundHook, buildReground, shouldReground, EVENTS };
