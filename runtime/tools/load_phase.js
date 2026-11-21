'use strict';
// load_phase (E2.3): serves the rendered phase file for the host target, gated on the
// previous phase's gate being confirmed (D5/D8). Refusal text is fixed (see refusal()).
const fs = require('fs');
const path = require('path');
const confirmCmd = require('../gates/confirm-command');
const { defineTool } = require('../registry');
const { coreDir, loadAgents } = require('../agents');
const gates = require('../gates');
const { buildReground } = require('../reground');
const { loadCore } = require('../../build/core');
const { processFile, splitFrontmatter } = require('../../build/compile');

const PHASE_RE = /^\d+(-\d+)*$/;

// Phase 0 convention: phase indexes start at phase 1; phase 0 (triage, in AGENT.md) declares
// `<agent>-phase-0` but a specialist may legitimately skip it (Syn already wrote project-specs.md).
// So the first phase needs no gate, unless gates.json already holds a phase-0 gate for this agent
// (`<agent>-phase-0` / `<agent>-<track>-phase-0`) that is not confirmed.
// Phases whose core file defines no advancing gate (unguarded) never require one.

function hostTarget(ctx) {
  let host = ctx.host;
  if (!host) { try { host = require('../session/correlate').detectHostName(); } catch (_) { host = 'claude-code'; } }
  return host === 'codex' ? 'codex' : 'claude';
}

// Phase order = index row order; the File column names phase-<n>.md. A row whose last (Gated)
// column contains the word `optional` (e.g. `yes (optional)`) marks a phase the previous phase may
// tell the agent to skip; see the optional-phase fallback in the handler.
function readIndex(agentDir, dirName) {
  let text;
  try { text = fs.readFileSync(path.join(agentDir, dirName, 'index.md'), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const ln of text.split('\n')) {
    const m = /^\|\s*[^|]*\|\s*`?phase-(\d+(?:-\d+)*)\.md`?\s*\|/.exec(ln);
    if (!m) continue;
    const cells = ln.trim().replace(/^\||\|$/g, '').split('|');
    out.push({ n: m[1], optional: /\boptional\b/i.test(cells[cells.length - 1] || '') });
  }
  return out;
}

function listPhaseFiles(agentDir, dirName) {
  try {
    return fs.readdirSync(path.join(agentDir, dirName)).map((f) => /^phase-(\d+(?:-\d+)*)\.md$/.exec(f)).filter(Boolean).map((m) => m[1]);
  } catch (_) { return []; }
}

// First advancing gate declared in a phase file source: {{gate ...}} macro or legacy ::GATE:: fence.
function advancingGate(src, agent, track, phase) {
  const advancing = (k) => gates.ADVANCING_KINDS.includes(k);
  const attr = (s, k) => { const m = new RegExp(`(?:^|\\s)${k}=("[^"]*"|\\S+)`).exec(s); return m ? m[1].replace(/^"|"$/g, '') : undefined; };
  for (const ln of src.split('\n')) {
    let m = /\{\{gate\s+([^}]*)\}\}/.exec(ln);
    if (m) {
      const kind = attr(m[1], 'kind');
      if (!advancing(kind)) continue;
      const id = attr(m[1], 'id') || `${agent}${track ? `-${track}` : ''}-phase-${attr(m[1], 'phase') || phase}`;
      return { id, kind };
    }
    m = /^\s*::GATE::\s+(.*)$/.exec(ln);
    if (m) {
      const kind = attr(m[1], 'kind'); const id = attr(m[1], 'id');
      if (!advancing(kind) || !id || /[<>]/.test(id)) continue;
      return { id, kind };
    }
  }
  return null;
}

// Scoped to the active frame's project: a gate confirmed for another project never satisfies this one.
function findGate(list, agent, track, phase, id, project) {
  const cand = list.filter((g) => gates.ADVANCING_KINDS.includes(g.kind)
    && (!project || (g.project || null) === project)
    && (g.id === id || (g.agent === agent && String(g.phase) === String(phase) && (!track || !g.track || g.track === track))));
  return cand.find((g) => g.status === 'confirmed') || cand[0] || null;
}

function refusal(gateId, prev, status, sessionKey) {
  const local = confirmCmd.localConfirmCommand(gateId, sessionKey);
  const cmd = confirmCmd.confirmCommand(gateId, sessionKey) + (local ? ` (repo checkout: ${local})` : '');
  return `load_phase refused: gate ${gateId} for phase ${prev} is not confirmed (status: ${status}). Ask the user to confirm it: ${cmd}`;
}

module.exports = defineTool({
  name: 'load_phase',
  description: 'Load a phase of the active agent. Returns the rendered phase instructions plus a re-ground block. Refused until the previous phase\'s gate is confirmed. Dual-track agents (analytics-engineer, data-engineer, data-modeller) require track=quick|deep.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', minLength: 1 },
      n: { oneOf: [{ type: 'string', pattern: '^\\d+(-\\d+)*$' }, { type: 'integer', minimum: 0 }] },
      track: { type: 'string', enum: ['quick', 'deep'] },
    },
    required: ['agent', 'n'],
    additionalProperties: false,
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('load_phase requires a resolved session');
    const n = String(args.n);
    if (!PHASE_RE.test(n)) throw new Error(`Invalid phase "${n}": expected digits like 3 or 6-5`);
    const core = coreDir();
    const agents = loadAgents(core);
    const agent = agents.get(args.agent);
    if (!agent || agent.error) {
      const valid = [...agents.values()].filter((a) => !a.error).map((a) => a.id);
      throw new Error(`Unknown agent "${args.agent}". Valid agents: ${valid.join(', ')}`);
    }
    const dual = fs.existsSync(path.join(agent.dir, 'phases_quick')) || fs.existsSync(path.join(agent.dir, 'phases_deep'));
    let dirName; let track = null;
    if (dual) {
      if (!args.track) throw new Error(`Agent ${agent.id} is dual-track: pass track=quick|deep`);
      track = args.track; dirName = `phases_${track}`;
      if (!fs.existsSync(path.join(agent.dir, dirName))) throw new Error(`Agent ${agent.id} has no ${track} track. Valid tracks: ${['quick', 'deep'].filter((t) => fs.existsSync(path.join(agent.dir, `phases_${t}`))).join(', ')}`);
    } else {
      if (args.track) throw new Error(`Agent ${agent.id} is single-track; do not pass track`);
      dirName = 'phases';
    }
    const index = readIndex(agent.dir, dirName);
    const order = index.map((e) => e.n);
    const files = listPhaseFiles(agent.dir, dirName);
    const valid = order.length ? order : files;
    if (!files.includes(n)) throw new Error(`Unknown phase "${n}" for ${agent.id}${track ? ` (${track} track)` : ''}. Valid phases: ${valid.join(', ')}`);

    const frames = ctx.state.read('frames').frames || [];
    const top = frames[frames.length - 1];
    if (!top || top.agent !== agent.id) throw new Error(`load_phase refused: ${agent.id} is not the active agent${top ? ` (top of stack is ${top.agent})` : ' (no active frame)'}. Call activate(agent="${agent.id}", mode="switch") first.`);

    // --- gate enforcement ---
    // Policy 'plan' (E11.8) needs no special case: notices are recorded as confirmed gate entries,
    // so the previous advancing gate is already confirmed. An unconfirmed previous gate still refuses.
    // All policies require the previous gate to be confirmed. A config error fails closed (strict)
    // and is surfaced in the result instead of being swallowed.
    const { error: configError } = require('../gates/policy').resolveGatesConfig(ctx);
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const all = gates.listGates(session);
    const idx = order.indexOf(n);
    let need = null; let prev = null;
    if (idx > 0) {
      // Walk back over skipped optional phases: an index entry marked optional whose gate was never
      // requested (and which is not the phase the frame is on) was skipped, so the nearest earlier
      // phase's gate governs. A started optional phase (gate requested, or loaded) still blocks.
      for (let j = idx - 1; j >= 0; j--) {
        prev = order[j];
        let src = '';
        try { src = fs.readFileSync(path.join(agent.dir, dirName, `phase-${prev}.md`), 'utf8'); } catch (_) { /* unguarded */ }
        const g = advancingGate(src, agent.id, track, prev);
        const skipped = index[j].optional && j > 0 && String(top.phase) !== prev
          && (!g || !findGate(all, agent.id, track, prev, g.id, top.project || null));
        if (skipped) continue;
        if (g) need = { id: g.id, phase: prev, track };
        break;
      }
    } else {
      const id0s = [`${agent.id}-phase-0`, ...(track ? [`${agent.id}-${track}-phase-0`] : [])];
      const g0 = all.find((g) => id0s.includes(g.id) && gates.ADVANCING_KINDS.includes(g.kind));
      const id0 = g0 && g0.id;
      if (g0) need = { id: id0, phase: 0, track };
    }
    if (need) {
      const g = findGate(all, agent.id, track, need.phase, need.id, top.project || null);
      if (!g || g.status !== 'confirmed') throw new Error(refusal(need.id, need.phase, g ? g.status : 'missing', ctx.sessionKey));
    }

    // --- render (reuse build/) ---
    const target = hostTarget(ctx);
    const loaded = loadCore(core);
    const rel = `agents/${agent.dir ? path.basename(agent.dir) : agent.id}/${dirName}/phase-${n}.md`;
    const src = fs.readFileSync(path.join(core, rel), 'utf8');
    const r = processFile(loaded, rel, src, { target, strict: false });
    if (r.errors.length) throw new Error(`Failed to render ${rel}:\n${r.errors.join('\n')}`);
    const body = splitFrontmatter(r.text).body.replace(/^\n+/, '');

    const phaseVal = /^\d+$/.test(n) ? Number(n) : n;
    await ctx.state.update('frames', (cur) => {
      const fr = (cur.frames || []).slice();
      const last = fr[fr.length - 1];
      if (!last || last.agent !== agent.id) throw new Error(`load_phase refused: ${agent.id} is no longer the top frame`);
      fr[fr.length - 1] = { ...last, phase: phaseVal, track };
      return { ...cur, frames: fr };
    });

    let reground = '';
    try { reground = buildReground({ root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state, agent: agent.id }); } catch (_) { /* best effort */ }
    const warn = configError ? `WARNING: shards.config.yaml could not be loaded, so gate policy is forced to strict (a human must confirm every gate). Fix the file: ${configError}\n\n` : '';
    return { text: `${warn}${body.trimEnd()}\n\n${reground}\n` };
  },
});
