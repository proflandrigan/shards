'use strict';
// Agent stack helpers over the per-session frames/gates state (D2).
//
// Frame schema (frames.json -> {frames: [Frame, ...]}, index 0 = BASE, last = top):
//   { id: 'f<N>-<agent>'   unique per session; N = (max existing N) + 1
//     agent: string, mode: 'switch', phase: 0, track: null, project: string|null,
//     gates: [],            ids of gates this frame owns (D2 gates belong to the switch frame)
//     opened_at: ISO }
//
// Base-frame semantics: frames[0] is the BASE frame (the session's entry agent, usually syn).
//   - return() with no `to` pops exactly one frame; if only the base remains it is refused
//     unless popBase:true is given explicitly, which empties the stack.
//   - return(to=X) pops everything above the topmost frame whose agent is X; X stays top
//     (never popped, even if base). Error if X is not on the stack; no-op if X is already top.
//   - popBase cannot be combined with `to`.
// Popping refuses while a popped frame owns a pending gate.

function frameNum(f) {
  const m = /^f(\d+)-/.exec((f && f.id) || '');
  return m ? Number(m[1]) : 0;
}

function stackNames(frames) { return frames.map((f) => f.agent); }
function fmtStack(frames) { return `[${stackNames(frames).join(' > ')}]`; }

function gatesWithStatus(gatesObj, frames, status) {
  const ids = new Set(frames.map((f) => f.id));
  const agents = new Set(frames.map((f) => f.agent));
  const owned = new Set(frames.flatMap((f) => f.gates || []));
  const out = [];
  for (const [key, g] of Object.entries(gatesObj || {})) {
    if (!g || g.status !== status) continue;
    const gid = g.id || key;
    if ((g.frame !== undefined && ids.has(g.frame)) || (g.frame === undefined && agents.has(g.agent)) || owned.has(gid) || owned.has(key)) out.push(gid);
  }
  return out;
}

const pendingGatesFor = (gatesObj, frames) => gatesWithStatus(gatesObj, frames, 'pending');
const suspendedGatesFor = (gatesObj, frames) => gatesWithStatus(gatesObj, frames, 'suspended');

async function pushFrame(state, fields) {
  let created;
  await state.update('frames', (cur) => {
    const frames = cur.frames || [];
    const top = frames[frames.length - 1];
    if (top && top.agent === fields.agent) throw new Error(`Agent ${fields.agent} is already active (top of stack ${fmtStack(frames)})`);
    const n = frames.reduce((m, f) => Math.max(m, frameNum(f)), 0) + 1;
    created = {
      id: `f${n}-${fields.agent}`, agent: fields.agent, mode: 'switch', phase: 0, track: null,
      project: fields.project || null, gates: [], opened_at: new Date().toISOString(),
    };
    return { ...cur, frames: [...frames, created] };
  });
  return created;
}

async function popFrames(state, { to, popBase } = {}) {
  if (to && popBase) throw new Error('pop_base cannot be combined with `to`');
  let popped = [];
  let remaining = [];
  await state.update('frames', (cur) => {
    const frames = cur.frames || [];
    let keep;
    if (to) {
      let idx = -1;
      for (let i = frames.length - 1; i >= 0; i--) if (frames[i].agent === to) { idx = i; break; }
      if (idx < 0) throw new Error(`Agent ${to} is not on the stack: ${fmtStack(frames)}`);
      keep = idx + 1;
    } else if (frames.length === 0) {
      throw new Error('Nothing to return from: the stack is empty');
    } else if (frames.length === 1) {
      if (!popBase) throw new Error(`Refusing to pop the base frame (${frames[0].agent}); pass pop_base:true to empty the stack`);
      keep = 0;
    } else {
      keep = frames.length - 1;
    }
    const going = frames.slice(keep);
    if (going.length) {
      const pend = pendingGatesFor(state.read('gates').gates, going);
      // Suspended gates (gate_suspend, human proof) do not block leaving; pending ones do.
      if (pend.length) throw new Error(`Cannot return: pending gate(s) ${pend.join(', ')} owned by ${[...new Set(going.map((f) => f.agent))].join(', ')}. Resolve the gate(s) first, or suspend them with gate_suspend (needs the user's say-so).`);
    }
    popped = going;
    remaining = frames.slice(0, keep);
    if (!going.length) return cur; // no-op still bumps version via update; acceptable
    return { ...cur, frames: remaining };
  });
  return { popped, frames: remaining };
}

module.exports = { pushFrame, popFrames, pendingGatesFor, suspendedGatesFor, stackNames, fmtStack };
