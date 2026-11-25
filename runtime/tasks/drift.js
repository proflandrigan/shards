'use strict';
// Plan drift (E12.6): default hooks for runtime/tasks. See core/protocols/plan_drift.md.
const AMEND_RE = /-amend-\d+$/;

function gates(session) { return require('../gates'); }
function amendmentGates(session) {
  try { return gates(session).listGates(session).filter((g) => AMEND_RE.test(String(g.id))); } catch (_) { return []; }
}

function dependents(manifest, rootId) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of manifest.tasks) {
      if (out.has(t.id)) continue;
      if ((t.depends_on || []).some((d) => d === rootId || out.has(d))) { out.add(t.id); grew = true; }
    }
  }
  return [...out];
}

async function onDeviations(session, taskId, result, scope) {
  if (!result || !Array.isArray(result.deviations) || !result.deviations.length) return undefined;
  const paused = [];
  const reason = `dependency ${taskId} reported deviation`;
  await session.state.update(require('./index').stateNameFor(scope), (cur) => {
    if (!cur.manifest) return cur;
    const at = new Date().toISOString();
    for (const id of dependents(cur.manifest, taskId)) {
      const s = cur.tasks[id];
      if (s && (s.status === 'pending' || s.status === 'dispatched')) {
        cur.tasks[id] = { ...s, status: 'paused', paused_reason: reason, updated_at: at };
        paused.push(id);
      }
    }
    cur.drift = { open: true, task: taskId, deviations: result.deviations, at };
    return cur;
  });
  return `Plan drift: task ${taskId} reported deviations. Paused: ${paused.join(', ') || 'none (no dependents in pending/dispatched state)'}. Follow core/protocols/plan_drift.md: draft the amendment, then call gate_request kind=phase id=<agent>-amend-<n> and stop. The manifest cannot be replaced until the user confirms it.`;
}

function assertMayReplace(session, existing, newManifest, args = {}) {
  const amend = amendmentGates(session);
  const pending = amend.find((g) => g.status === 'pending');
  if (pending) throw new Error(`amendment gate ${pending.id} is pending; the manifest can be replaced only after the user confirms it`);
  const started = Object.values(existing.tasks || {}).some((s) => s.status !== 'pending');
  const drift = !!(existing.drift && existing.drift.open);
  if (!started && !drift) return undefined;
  const id = args.amendment_gate;
  const why = drift ? 'a worker reported deviations' : 'work has started';
  if (!id) throw new Error(`manifest replacement refused: ${why}. Follow core/protocols/plan_drift.md: raise gate_request kind=phase id=<agent>-amend-<n>, wait for user confirmation, then call tasks_set with amendment_gate=<that id>.`);
  const g = amend.find((x) => x.id === id);
  if (!g) throw new Error(`manifest replacement refused: amendment gate "${id}" does not exist (ids must match <agent>-amend-<n>)`);
  if (g.status !== 'confirmed') throw new Error(`manifest replacement refused: amendment gate ${id} is ${g.status}, not confirmed`);
  if ((existing.consumed_amendments || []).includes(id)) throw new Error(`manifest replacement refused: amendment gate ${id} was already used; raise a new <agent>-amend-<n> gate`);
  return { consume: id };
}

module.exports = { onDeviations, assertMayReplace, dependents, AMEND_RE };
