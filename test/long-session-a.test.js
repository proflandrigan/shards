// Long-session scenario tests for the v2 gate machine (part A).
//
// Multi-step scenarios over the REAL code paths: runtime/gates/* (machine, tier2, tier3, operator),
// runtime/tools/gate_* via the Registry, runtime/stack.js, runtime/state, runtime/reground.js and the
// hook shims (hooks/pre-tool-use.js + hooks/lib/enforce.js, hooks/session-start.js,
// hooks/user-prompt-submit.js). Nothing in the machine is mocked.
//
// Session-level invariants asserted throughout (see `audit()`):
//   - re-asks per confirmed gate = 0   (gate_request on a confirmed id never reopens / re-pends it;
//                                       each id is "opened" exactly once per session unless changes were requested)
//   - false blocks = 0                 (read-only tools are never denied while a gate is pending)
//   - no gate confirmed without a human action (every confirmed gate carries proof from the
//                                       gate_confirm / gate_advance paths, and a chat-reply proof maps to a
//                                       real hook-recorded user prompt with the same sha256)
//
// LEGACY CASES DELIBERATELY DROPPED (v-legacy:test/gate-hook.test.js), superseded by the v2 design
// (no fence parsing, no text classification, no Stop hook, single human-action confirm path; E11.11):
//   - parser: ::GATE:: fence parsing, malformed fences, gate markers inside code blocks, post-fence violations
//   - classify.js: confirm/deny/ambiguous text classification of user replies, ::GATE-CONFIRM:: prefix
//   - stop handler: opening gates from Stop-hook fences, "Phase header follows gate" violation
//   - userPromptSubmit handler: closing a gate on "yes, proceed" (v2 prompt hook only RECORDS; it never decides)
//   - legacy single-slot OPEN state format upgrade (__legacy__ key), clearGate/anyOpen/firstOpen helpers
//   - kind taxonomy normalisation of unknown kinds and SHARDS_CHECKPOINT_ENFORCE advisory mode (parser based)
//   - stale-gate 24h sweep and the Bash "shards-gates force-close" allow-list (isForceCloseBash); force-close
//     is now the supervised gate_force_close tool / operator CLI
//   - blocks Task tool while a gate is open: v2 blocks write/exec tools only (Task/Agent are not writes)
//
// LEGACY CASES PORTED (as v2 equivalents):
//   - preToolUse: blocks Write / Edit / Bash while gate open; allows Read / Glob / Grep; allows all when closed (scenario 6)
//   - cross-session isolation (A's pending gate does not block B; B's confirm does not close A's)  (scenario 6)
//   - atomic state writes: concurrent readers never observe partial gates.json while gates churn   (scenario 1)
//   - history preserved across transitions (history ordered, nothing dropped)                      (scenario 1)
//   - ambiguous replies ("hmm") never confirm by themselves                                         (scenario 3)
//   - force-close resets auto-verify and the gate ends not-confirmed                                (scenario 4)
//   - read-only allowlist behaviour of the permission-pattern path (ls/cat/grep allowed, redirects
//     and mutators blocked); the UI permission-pattern parser itself is gone in v2                  (scenario 6)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const G = require('../runtime/gates');
const operator = require('../runtime/gates/operator');
const host = require('../hooks/lib/host');
const { handler: preHook } = require('../hooks/pre-tool-use');
const { handler: promptHook } = require('../hooks/user-prompt-submit');
const { handler: startHook } = require('../hooks/session-start');

const KEY = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const GA = 'mcp__plugin_shards_shards__gate_advance';
const GF = 'mcp__plugin_shards_shards__gate_force_close';
const OLD_HOME = process.env.HOME;
const WRITE_TOOLS = (r) => [
  ['Write', { file_path: path.join(r, 'out.txt'), content: 'x' }],
  ['Edit', { file_path: path.join(r, 'out.txt'), old_string: 'a', new_string: 'b' }],
  ['Bash', { command: 'echo hi > out.txt' }],
];

let root; let home; let st; let reg;
let opened; // id -> number of times a gate_request returned result "opened"
let falseBlocks; // read-only tool calls that were denied while a gate was pending
const sess = (s = st, k = KEY) => ({ root, sessionKey: k, state: s });
const ctx = (extra = {}) => ({ root, getConfig: () => ({ config: {} }), state: st, sessionKey: KEY, host: 'claude-code', ...extra });
const call = (name, args = {}, extra = {}) => reg.call(name, args, ctx(extra));
const text = (r) => r.content.map((c) => c.text).join('\n');
const data = (r) => { const t = r.content[r.content.length - 1].text; return JSON.parse(t.slice(t.indexOf('{'))); };
const say = (t, extra = {}) => promptHook({ sessionId: KEY, prompt: t, host: 'claude-code', ...extra }, root);
const sw = async (agent) => { const r = await call('activate', { agent, mode: 'switch', project: 'p' }); expect(r.isError, text(r)).toBeFalsy(); return r; };
const frames = () => st.read('frames').frames;
const status = (id) => (G.getGate(sess(), id) || {}).status;
const W = (f = 'out.txt') => ({ file_path: path.join(root, f), content: 'x' });

// A hook-shaped PreToolUse call. Returns the parsed hookSpecificOutput or null.
async function pre(tool, input = {}, extra = {}, sid = KEY) {
  const n = host.normalize({ session_id: sid, cwd: root, hook_event_name: 'PreToolUse', permission_mode: 'default', tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
  const out = await preHook(n, root);
  return out ? JSON.parse(out).hookSpecificOutput : null;
}
const denied = (o) => !!o && o.permissionDecision === 'deny';

async function req(id, kind = 'phase', phase = 1, extra = {}) {
  const r = await call('gate_request', { id, kind, phase, summary: `s-${id}`, record_ref: 'r.md', ...extra });
  expect(r.isError, text(r)).toBeFalsy();
  const d = data(r);
  if (d.result === 'opened') opened[id] = (opened[id] || 0) + 1;
  return d;
}
// The human path: the user says `words` (recorded by the prompt hook), the agent relays it via gate_confirm.
async function humanConfirm(id, words = 'looks good, go ahead', decision = 'confirmed') {
  await say(words);
  const r = await call('gate_confirm', { id, decision, user_reply: words });
  expect(r.isError, text(r)).toBeFalsy();
  return data(r);
}
// Read-only tools while a gate is pending: none may be denied.
async function probeReadOnly() {
  const probes = [
    ['Read', { file_path: path.join(root, 'a.txt') }],
    ['Glob', { pattern: '**/*.md' }],
    ['Grep', { pattern: 'x', path: root }],
    ['Bash', { command: 'ls -la' }],
    ['Bash', { command: 'cat a.txt | grep x | wc -l' }],
    ['Bash', { command: 'git status' }],
    ['mcp__other__lookup', {}],
    ['Task', { subagent_type: 'researcher', prompt: 'review' }],
  ];
  for (const [t, i] of probes) { const o = await pre(t, i); if (denied(o)) falseBlocks.push(`${t} ${JSON.stringify(i)}`); }
}
function prompts() {
  try { return fs.readFileSync(path.join(st.sessionDir, 'prompts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; }
}
// Session-level audit: the three headline metrics.
function audit() {
  const all = G.listGates(sess());
  const ps = prompts();
  for (const g of all.filter((x) => x.status === 'confirmed')) {
    expect(g.proof && ['chat-reply', 'host-prompt', 'elicitation'].includes(g.proof.tier), `gate ${g.id} confirmed without human proof`).toBe(true);
    if (g.proof.tier === 'chat-reply') {
      const p = ps.find((x) => x.prompt_id === g.proof.prompt_id);
      expect(p, `gate ${g.id} chat-reply proof has no recorded prompt`).toBeTruthy();
      expect(p.sha256).toBe(g.proof.sha256);
    }
    expect(g.history.filter((h) => h.to === 'confirmed'), `gate ${g.id} confirmed more than once`).toHaveLength(1);
    expect(g.history[g.history.length - 1].to, `gate ${g.id} changed after confirm`).toBe('confirmed');
  }
  for (const [id, n] of Object.entries(opened)) expect(n, `gate ${id} was opened ${n} times`).toBe(1);
  expect(falseBlocks).toEqual([]);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsa-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'lsah-'));
  process.env.HOME = home; // tier-2 reads allow rules from $HOME/.claude; keep the real one out
  st = new StateStore(root, KEY);
  reg = new Registry(loadTools());
  opened = {}; falseBlocks = [];
});
afterEach(() => {
  process.env.HOME = OLD_HOME;
  delete process.env.SHARDS_GATE_ENFORCE;
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe('1. multi-gate session', () => {
  it('confirms 7 gates in sequence across phases; ordered history; no re-ask; no gate re-opened', async () => {
    await sw('syn'); await sw('data-analyst');
    const ids = [];
    const plan = [['phase', 1], ['checkpoint', 2], ['phase', 2], ['confirm', 3], ['phase', 3], ['execute', 4], ['final', 5]];
    let seq = 0;
    for (const [kind, phase] of plan) {
      const id = `data-analyst-${kind}-${phase}-${++seq}`;
      ids.push(id);
      expect((await req(id, kind, phase)).status).toBe('pending');
      await probeReadOnly();
      for (const [t, i] of WRITE_TOOLS(root)) expect(denied(await pre(t, i)), `${t} should be blocked`).toBe(true);
      await say('what does that table mean again?'); // chatter does not confirm
      expect(status(id)).toBe('pending');
      expect((await req(id, kind, phase)).result).toBe('already_pending'); // idempotent
      expect((await humanConfirm(id, `approved ${seq}`)).result).toBe('confirmed');
      expect(await pre('Write', W(`o${seq}.txt`))).toBeNull();
      expect((await req(id, kind, phase)).result).toBe('already_confirmed'); // 0 re-asks
      expect(status(id)).toBe('confirmed');
    }
    const all = G.listGates(sess());
    expect(all).toHaveLength(plan.length);
    expect(all.every((g) => g.status === 'confirmed')).toBe(true);
    for (const g of all) expect(g.history.map((h) => h.to)).toEqual(['pending', 'confirmed']);
    const order = [...all].sort((a, b) => Date.parse(a.requested_at) - Date.parse(b.requested_at) || Date.parse(a.decided_at) - Date.parse(b.decided_at)).map((g) => g.id);
    expect(order).toEqual(ids);
    for (let i = 1; i < all.length; i++) expect(Date.parse(all[i].requested_at)).toBeGreaterThanOrEqual(Date.parse(all[i - 1].decided_at));
    expect(G.getGate(sess(), ids[1]).commit).toMatchObject({ outcome: 'skipped', reason: 'non_advancing_kind' });
    expect(G.getGate(sess(), ids[0]).commit.outcome).not.toBe('skipped');
    expect(Object.keys(st.read('confirm').used)).toHaveLength(plan.length); // each prompt consumed once
    audit();
  });

  it('changes_requested then reopen is one ask per round; the final confirm sticks', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    expect((await humanConfirm(id, 'redo the join please', 'changes_requested')).status).toBe('changes_requested');
    expect((await req(id)).result).toBe('reopened');
    await humanConfirm(id, 'good now');
    expect((await req(id)).result).toBe('already_confirmed');
    expect(G.getGate(sess(), id).history.map((h) => h.to)).toEqual(['pending', 'changes_requested', 'pending', 'confirmed']);
    audit();
  });

  it('readers never observe partial gates.json while gates churn (atomic writes)', async () => {
    await sw('data-analyst');
    let stop = false; let bad = 0; let reads = 0;
    const reader = (async () => {
      while (!stop) {
        try { const raw = fs.readFileSync(st.file('gates'), 'utf8'); reads++; JSON.parse(raw); } catch (e) { if (e.code !== 'ENOENT') bad++; }
        await new Promise((r) => setImmediate(r));
      }
    })();
    for (let i = 1; i <= 6; i++) { const id = `data-analyst-phase-${i}`; await req(id, 'phase', i); await humanConfirm(id, `ok go ${i}`); }
    stop = true; await reader;
    expect(reads).toBeGreaterThan(0);
    expect(bad).toBe(0);
    audit();
  });
});

describe('2. compaction x2', () => {
  const compact = async (source = 'compact') => {
    const out = await startHook({ sessionId: KEY, source, host: 'claude-code', cwd: root }, root);
    return out ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
  };

  it('re-ground fires mid-gate and between gates; pending state survives; confirmed gates are not re-asked', async () => {
    await sw('syn'); await sw('data-analyst');
    const g1 = 'data-analyst-phase-1'; const g2 = 'data-analyst-phase-2'; const g3 = 'data-analyst-phase-3';
    await req(g1);
    await humanConfirm(g1, 'phase one fine');
    await req(g2, 'phase', 2);

    // compaction #1: mid-gate (g2 pending)
    const before = JSON.stringify(G.getGate(sess(), g2));
    const t1 = await compact();
    expect(t1).toContain('--- Re-ground ---');
    expect(t1).toMatch(new RegExp(`${g1} (sha=|commit_pending|outcome=)`));
    expect(t1).toMatch(new RegExp(`${g2} \\(pending, kind phase, phase 2\\) -> wait for the user; do NOT re-request confirmed gates`));
    expect(t1).toContain('Do not re-ask for gates listed as confirmed.');
    expect(t1).toContain('Frame stack: syn > data-analyst');
    expect(JSON.stringify(G.getGate(sess(), g2))).toBe(before); // hook is read-only w.r.t. gates
    expect(denied(await pre('Write', W()))).toBe(true); // still enforced after compaction

    await humanConfirm(g2, 'second is good'); // reply after compaction still confirms (mark survived)
    expect((await req(g1)).result).toBe('already_confirmed');
    expect((await req(g2, 'phase', 2)).result).toBe('already_confirmed');

    // compaction #2: between gates (nothing pending)
    const t2 = await compact();
    expect(t2).toContain(g1); expect(t2).toContain(g2);
    expect(t2).toMatch(/Pending\/suspended gates:\n  \(none\)/);
    expect(await pre('Write', W('y.txt'))).toBeNull();

    await req(g3, 'final', 3);
    expect(status(g3)).toBe('pending');
    await humanConfirm(g3, 'ship it');
    expect(G.listGates(sess()).map((g) => g.status)).toEqual(['confirmed', 'confirmed', 'confirmed']);
    audit();
  });

  it('a reply typed after the request still confirms across two compactions; one typed before the request cannot', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await say('approve whatever you build next'); // pre-request chatter
    await req(id);
    await say('yes this one');
    await compact(); await compact();
    const stale = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'approve whatever you build next' });
    expect(stale.isError).toBe(true);
    expect(status(id)).toBe('pending');
    const good = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'yes this one' });
    expect(good.isError, text(good)).toBeFalsy();
    expect(status(id)).toBe('confirmed');
    audit();
  });

  it('SessionStart is silent for startup/clear and for a session with nothing to re-ground', async () => {
    expect(await compact('startup')).toBe('');
    expect(await compact('compact')).toBe('');
    await sw('data-analyst');
    expect(await compact('clear')).toBe('');
    expect(await compact('resume')).toContain('Re-ground');
  });
});

describe('3. interrupts, tool-only turns and casual replies', () => {
  it('"ok" / "hmm" / "thanks" typed as chat never confirm; only a valid gate_confirm relay can', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    for (const w of ['hmm', 'thanks', 'ok']) {
      await say(w);
      await probeReadOnly(); // tool-only turn between messages
      expect(status(id)).toBe('pending');
    }
    expect(prompts().map((p) => p.text)).toEqual(['hmm', 'thanks', 'ok']);
    expect(G.getGate(sess(), id).history).toHaveLength(1);
    expect(st.read('confirm').used || {}).toEqual({});
    // agent relays a later message, an invented one, or blank: refused, state unchanged
    const r1 = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'thanks' });
    expect(r1.isError).toBe(true);
    expect(text(r1)).toContain('shards cannot confirm on your behalf');
    const r2 = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'yes, proceed' });
    expect(r2.isError).toBe(true);
    expect(text(r2)).toContain('Stop and wait'); // second refusal is the short one
    expect((await call('gate_confirm', { id, decision: 'confirmed', user_reply: '   ' })).isError).toBe(true);
    expect(status(id)).toBe('pending');
    expect(G.getGate(sess(), id).history).toHaveLength(1);
    expect(st.read('confirm').used || {}).toEqual({});
    expect(denied(await pre('Write', W()))).toBe(true); // writes stayed blocked throughout
    // Tier 3 proves a human message exists; it is not a text classifier. The user's literal first message
    // can be relayed, and the proof records it.
    const ok = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'hmm' });
    expect(ok.isError, text(ok)).toBeFalsy();
    expect(G.getGate(sess(), id).proof).toMatchObject({ tier: 'chat-reply' });
    // single use: the same message cannot confirm a later gate
    await req('data-analyst-phase-2', 'phase', 2);
    const replay = await call('gate_confirm', { id: 'data-analyst-phase-2', decision: 'confirmed', user_reply: 'hmm' });
    expect(replay.isError).toBe(true);
    expect(status('data-analyst-phase-2')).toBe('pending');
    audit();
  });

  it('interrupt: a mid-gate message moves the first-message window; re-request re-marks it, then a fresh reply confirms', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    await say('wait, hold on, what about nulls?'); // interrupt
    await say('ok fine');
    const late = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'ok fine' });
    expect(late.isError).toBe(true); // not the first message after the request
    expect(status(id)).toBe('pending');
    // agent answers the interrupt and re-surfaces the gate: idempotent open, mark moves past the chatter
    expect((await req(id)).result).toBe('already_pending');
    const stillOld = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'ok fine' });
    expect(stillOld.isError).toBe(true); // pre-re-request messages are dead
    expect(status(id)).toBe('pending');
    await humanConfirm(id, 'nulls handled, approved');
    expect(status(id)).toBe('confirmed');
    audit();
  });

  it('tool-only turns (no user prompts at all) cannot confirm and are not falsely blocked', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    for (let i = 0; i < 12; i++) await probeReadOnly();
    expect((await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'yes' })).isError).toBe(true);
    const a = await call('gate_advance', { id }); // no recorded host prompt either
    expect(a.isError).toBe(true);
    expect(text(a)).toMatch(/no host permission prompt was recorded/);
    expect(status(id)).toBe('pending');
    expect(falseBlocks).toEqual([]);
    expect(prompts()).toEqual([]);
  });

  it('whitespace-reflowed relay of the real message is accepted; altered text is not', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    await say('  Yes,\n  go   ahead  ');
    expect((await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'yes, go ahead' })).isError).toBe(true);
    const good = await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'Yes, go ahead' });
    expect(good.isError, text(good)).toBeFalsy();
    audit();
  });
});

describe('4. auto/bypass permission modes', () => {
  it('gate_advance / gate_force_close ask the shim and record permission_mode at call time', async () => {
    await sw('data-analyst');
    const modes = ['default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'];
    for (const mode of modes) {
      for (const t of [GA, GF]) {
        expect(await pre(t, { id: 'x' }, { permission_mode: mode, tool_use_id: `tu-${mode}-${t.slice(-6)}` }), `${t} in ${mode}`).toMatchObject({ permissionDecision: 'ask' });
      }
    }
    const rec = st.read('hooks').gateCalls;
    expect(rec.map((r) => r.permission_mode)).toEqual(modes.flatMap((m) => [m, m]));
    expect(rec.every((r) => r.decision === 'ask')).toBe(true);
    expect(st.read('hooks').lastGateCall).toMatchObject({ tool: GF, permission_mode: 'bypassPermissions' });
  });

  it('supervised default mode: gate_advance confirms with host-prompt proof; the prompt is single use', async () => {
    await sw('data-analyst');
    const a = 'data-analyst-phase-1'; const b = 'data-analyst-phase-2';
    await req(a);
    await pre(GA, { id: a }, { permission_mode: 'default' });
    const r = await call('gate_advance', { id: a });
    expect(r.isError, text(r)).toBeFalsy();
    expect(G.getGate(sess(), a).proof).toMatchObject({ tier: 'host-prompt', level: 2, permission_mode: 'default' });
    await req(b, 'phase', 2);
    const reuse = await call('gate_advance', { id: b });
    expect(reuse.isError).toBe(true);
    expect(text(reuse)).toMatch(/already used/);
    expect(status(b)).toBe('pending');
    audit();
  });

  for (const mode of ['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk']) {
    it(`mode ${mode}: gate_advance and gate_force_close are refused, nothing changes, refusal is logged`, async () => {
      await sw('data-analyst');
      const id = 'data-analyst-phase-1';
      await req(id);
      await pre(GA, { id }, { permission_mode: mode });
      const adv = await call('gate_advance', { id });
      expect(adv.isError).toBe(true);
      expect(text(adv)).toMatch(/unsupervised/);
      expect(status(id)).toBe('pending');
      await pre(GF, { id }, { permission_mode: mode });
      const fc = await call('gate_force_close', { id });
      expect(fc.isError).toBe(true);
      expect(text(fc)).toMatch(/unsupervised/);
      expect(status(id)).toBe('pending');
      const v = operator.readJsonl(operator.violationsFile(root)).filter((x) => x.tool === 'gate_force_close');
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ kind: 'refused', gate: id });
      expect(denied(await pre('Write', W(), { permission_mode: mode }))).toBe(true); // bypass does not lift the block
    });
  }

  it('a supervised shim prompt is void once the session reports bypass (last prompt mode wins)', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    await say('going auto now', { permissionMode: 'bypassPermissions' });
    await pre(GA, { id }, { permission_mode: 'default' });
    const r = await call('gate_advance', { id });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/session permission mode \(bypassPermissions\) is unsupervised/);
    expect(status(id)).toBe('pending');
  });

  it('supervised force-close ends the gate NOT confirmed, resets auto-verify; re-request is a deliberate new ask', async () => {
    await sw('data-analyst');
    const av = require('../runtime/auto-verify');
    const id = 'data-analyst-phase-1';
    await req(id);
    await st.update('auto-verify', () => ({ active: true, agent: 'data-analyst', phase: 1, tool_budget: 5, used: 0, started_at: Date.now(), ttl_s: 600, expires_at: Date.now() + 600000 }));
    await pre(GF, { id }, { permission_mode: 'default' });
    const r = await call('gate_force_close', { id, reason: 'stuck' });
    expect(r.isError, text(r)).toBeFalsy();
    expect(status(id)).toBe('force_closed');
    expect(av.get(sess()).active).toBeFalsy();
    expect(await pre('Write', W('ok'))).toBeNull(); // force_closed does not block
    expect((await req(id)).result).toBe('reopened');
    expect(status(id)).toBe('pending');
    expect(operator.readJsonl(operator.operatorLogFile(root))[0]).toMatchObject({ action: 'force-close', gate: id, actor: 'agent', via: 'host-prompt' });
  });

  it('codex host: shim does not ask; gate_advance and gate_force_close are unavailable', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    const n = host.normalize({ session_id: KEY, cwd: root, hook_event_name: 'PreToolUse', permission_mode: 'default', tool_name: 'mcp__shards__gate_advance', tool_input: {} }, { SHARDS_HOST: 'codex' });
    expect(await preHook(n, root)).toBe('');
    for (const t of ['gate_advance', 'gate_force_close']) {
      const r = await call(t, { id }, { host: 'codex' });
      expect(r.isError).toBe(true);
      expect(text(r)).toMatch(/unavailable on Codex/);
    }
    expect(status(id)).toBe('pending');
  });
});

describe('5. frame suspend / resume and nested frames', () => {
  const suspend = async (id, words) => { await say(words); const r = await call('gate_suspend', { id, user_reply: words }); expect(r.isError, text(r)).toBeFalsy(); };

  it('a suspended gate in a left frame is restored on resume and then needs a fresh message', async () => {
    await sw('syn'); await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    expect((await call('return', {})).isError).toBe(true); // pending blocks leaving
    await suspend(id, 'park this');
    expect(status(id)).toBe('suspended');
    expect((await call('return', {})).isError).toBeFalsy();
    expect(frames().map((f) => f.agent)).toEqual(['syn']);
    expect(await pre('Write', W('s.txt'))).toBeNull(); // nothing pending on the active frame
    const rg = await startHook({ sessionId: KEY, source: 'compact', host: 'claude-code', cwd: root }, root);
    expect(JSON.parse(rg).hookSpecificOutput.additionalContext).toMatch(new RegExp(`${id} \\(suspended, kind phase, phase 1\\)`));
    expect((await call('gate_resume', { id })).isError).toBe(true); // only from inside the owning agent
    await sw('data-analyst');
    await say('back again, carry on');
    const re = await call('gate_resume', { id });
    expect(re.isError, text(re)).toBeFalsy();
    expect(status(id)).toBe('pending');
    expect(G.getGate(sess(), id).frame).toBe(frames().slice(-1)[0].id);
    expect(denied(await pre('Edit', { file_path: path.join(root, 'e.txt'), old_string: 'a', new_string: 'b' }))).toBe(true);
    for (const w of ['park this', 'back again, carry on']) {
      expect((await call('gate_confirm', { id, decision: 'confirmed', user_reply: w })).isError).toBe(true);
    }
    expect(status(id)).toBe('pending');
    await humanConfirm(id, 'now it is fine');
    expect(G.getGate(sess(), id).history.map((h) => h.to)).toEqual(['pending', 'suspended', 'pending', 'confirmed']);
    audit();
  });

  it('nested frames hold independent gates; pending parent gate is enforced again after the child pops', async () => {
    await sw('syn'); await sw('data-analyst');
    const p1 = 'data-analyst-phase-1'; const p2 = 'data-analyst-phase-2'; const child = 'researcher-phase-1';
    await req(p1);
    await humanConfirm(p1, 'parent ok');
    await req(p2, 'phase', 2);
    await sw('researcher'); // child frame above a PENDING parent gate
    await req(child);
    expect(status(p2)).toBe('pending'); expect(status(child)).toBe('pending');
    expect(frames().map((f) => f.agent)).toEqual(['syn', 'data-analyst', 'researcher']);
    const mark = JSON.stringify(st.read('confirm').marks[p2]);
    await humanConfirm(child, 'child ok');
    expect(status(child)).toBe('confirmed'); expect(status(p2)).toBe('pending');
    expect(JSON.stringify(st.read('confirm').marks[p2])).toBe(mark); // child confirm did not touch parent mark
    expect((await call('return', {})).isError).toBeFalsy();
    expect(frames().map((f) => f.agent)).toEqual(['syn', 'data-analyst']);
    expect(denied(await pre('Write', W('n')))).toBe(true);
    // 'child ok' (consumed by the child gate) is the first message after the parent's mark, so a fresh
    // reply is not first: refused. Re-surfacing the parent gate moves the mark and a fresh reply confirms.
    await say('parent two is fine');
    expect((await call('gate_confirm', { id: p2, decision: 'confirmed', user_reply: 'parent two is fine' })).isError).toBe(true);
    expect(status(p2)).toBe('pending');
    expect((await req(p2, 'phase', 2)).result).toBe('already_pending');
    await humanConfirm(p2, 'parent two really is fine');
    expect(status(p2)).toBe('confirmed');
    audit();
  });

  it('a suspended gate survives other frames completing their own gates and blocks ending the session', async () => {
    await sw('syn'); await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    await suspend(id, 'later');
    await call('return', {});
    await sw('data-scientist');
    const other = 'data-scientist-phase-1';
    await req(other);
    expect(denied(await pre('Write', W('ds')))).toBe(true);
    await humanConfirm(other, 'ds approved');
    expect((await call('return', {})).isError).toBeFalsy();
    const open = data(await call('gates_open'));
    expect(open.pending).toEqual([]);
    expect(open.suspended.map((g) => g.id)).toEqual([id]);
    expect(open.any_blocking_final_review).toBe(true);
    expect((await call('sessions_end', {})).isError).toBe(true);
    await say('yes');
    expect((await call('gate_confirm', { id, decision: 'confirmed', user_reply: 'yes' })).isError).toBe(true); // suspended cannot be confirmed
    await operator.forceClose(root, KEY, id, { actor: 'op', via: 'operator-cli', state: st });
    expect(status(id)).toBe('force_closed');
    audit();
  });

  it('one open gate per frame; a second frame may hold its own', async () => {
    await sw('syn'); await sw('data-analyst');
    await req('data-analyst-phase-1');
    const second = await call('gate_request', { id: 'data-analyst-phase-2', kind: 'phase', phase: 2, summary: 's', record_ref: 'r.md' });
    expect(second.isError).toBe(true);
    expect(text(second)).toContain('already has pending gate');
    await sw('researcher');
    await req('researcher-phase-1');
    expect(G.listGates(sess()).filter((g) => g.status === 'pending')).toHaveLength(2);
    for (const k of Object.keys(opened)) expect(opened[k]).toBe(1);
  });
});

describe('6. pending-gate write blocking (PreToolUse) and read-only allowlist', () => {
  it('Write/Edit/MultiEdit/NotebookEdit/Bash writes blocked while pending; reads allowed; closed allows all', async () => {
    for (const [t, i] of WRITE_TOOLS(root)) expect(await pre(t, i)).toBeNull(); // no state yet
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    expect(await pre('Write', W())).toBeNull(); // frame but no gate
    await req(id);
    for (const [t, i] of [...WRITE_TOOLS(root), ['MultiEdit', { file_path: path.join(root, 'm.txt'), edits: [] }], ['NotebookEdit', { notebook_path: path.join(root, 'n.ipynb') }]]) {
      const o = await pre(t, i);
      expect(denied(o), `${t} must be blocked`).toBe(true);
      expect(o.permissionDecisionReason).toContain(id);
    }
    await probeReadOnly();
    expect(denied(await pre('Write', W(), { agent_id: 'sub-1', agent_type: 'shards:researcher' }))).toBe(true); // unleased subagent
    process.env.SHARDS_GATE_ENFORCE = '0';
    expect(await pre('Write', W())).toBeNull();
    delete process.env.SHARDS_GATE_ENFORCE;
    expect(denied(await pre('Write', W()))).toBe(true);
    await humanConfirm(id, 'go');
    for (const [t, i] of WRITE_TOOLS(root)) expect(await pre(t, i), `${t} after confirm`).toBeNull();
    await req('data-analyst-phase-2', 'phase', 2);
    expect(denied(await pre('Write', W()))).toBe(true);
    await humanConfirm('data-analyst-phase-2', 'change the title', 'changes_requested');
    expect(await pre('Write', W())).toBeNull(); // changes_requested is not pending
    audit();
  });

  it('non-advancing checkpoint gates block exactly like phase gates', async () => {
    await sw('data-analyst');
    await req('cp-1', 'checkpoint', 1);
    expect(denied(await pre('Write', W()))).toBe(true);
    await humanConfirm('cp-1', 'cp fine');
    expect(await pre('Write', W())).toBeNull();
  });

  it('cross-session isolation: A pending does not block B; B confirm does not close A', async () => {
    await sw('data-analyst');
    const id = 'data-analyst-phase-1';
    await req(id);
    expect(denied(await pre('Write', W()))).toBe(true);
    const stB = new StateStore(root, OTHER);
    expect(await pre('Write', W(), {}, OTHER)).toBeNull(); // B has no state
    const { pushFrame } = require('../runtime/stack');
    await pushFrame(stB, { agent: 'data-analyst', project: 'p' });
    await G.requestGate(sess(stB, OTHER), { frame: stB.read('frames').frames[0], id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r.md' });
    expect(denied(await pre('Write', W(), {}, OTHER))).toBe(true);
    await G.confirmGate(sess(stB, OTHER), id, { decision: 'confirmed', proof: { tier: 'test' } }, { commitGate: async () => ({ outcome: 'skipped' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => [] });
    expect(await pre('Write', W(), {}, OTHER)).toBeNull();
    expect(status(id)).toBe('pending');
    expect(denied(await pre('Write', W()))).toBe(true);
  });

  it('read-only allowlist: only genuinely mutating shell commands are blocked while pending', async () => {
    await sw('data-analyst');
    await req('data-analyst-phase-1');
    const allowed = [
      'ls -la', 'cat a.txt', 'head -n 5 a.csv', 'grep -rn foo src | wc -l', 'git status', 'git diff HEAD', 'git log --oneline -5',
      'python3 -c "print(1)"', 'node -e "console.log(1)"', 'echo hi 2>&1', 'ls > /dev/null', 'find . -name "*.sql"', 'sed -n 1,5p a.txt',
      'dbt ls', 'duckdb -c "select 1"', 'pwd && ls | sort',
    ];
    for (const c of allowed) { const o = await pre('Bash', { command: c }); if (denied(o)) falseBlocks.push(c); }
    expect(falseBlocks).toEqual([]);
    const blocked = [
      'echo hi > out.txt', 'cat a >> log.txt', 'rm -rf build', 'mv a b', 'cp a b', 'touch f', 'mkdir d', 'sed -i s/a/b/ f', 'tee out.txt',
      'git commit -m x', 'git checkout -- .', 'git reset --hard', 'ls | tee out.txt', "python3 -c \"open('f','w').write('x')\"",
      'cat <<EOF > f\nhi\nEOF',
    ];
    for (const c of blocked) expect(denied(await pre('Bash', { command: c })), c).toBe(true);
  });

  it('gate tools are never treated as ordinary tools: only the four confirming/suspending tools are gate tools', () => {
    for (const t of ['mcp__plugin_shards_shards__gate_advance', 'mcp__shards__gate_force_close', 'mcp__shards__gate_confirm', 'mcp__x_shards_y__gate_suspend']) expect(host.isGateTool(t)).toBe(true);
    for (const t of ['Read', 'Glob', 'Grep', 'Bash', 'mcp__shards__gate_request', 'mcp__shards__gate_resume', 'mcp__other__gate_advance']) expect(host.isGateTool(t)).toBe(false);
  });

  it('fail-open: a corrupt gates.json never blocks reads or writes and never throws', async () => {
    await sw('data-analyst');
    await req('data-analyst-phase-1');
    fs.writeFileSync(st.file('gates'), '{not json');
    for (const [t, i] of [['Read', { file_path: 'a' }], ...WRITE_TOOLS(root)]) {
      let o; let threw = false;
      try { o = await pre(t, i); } catch (_) { threw = true; }
      expect(threw).toBe(false);
      expect(denied(o)).toBe(false);
    }
  });
});
