#!/usr/bin/env node
'use strict';
/**
 * Golden-session scorer. Dependency-free.
 *
 *   node test/golden/score.js --session <id|path> --transcript <jsonl> --outdir <dir> [--json] [--threshold 90] [--enforce-targets]
 *
 * Exit codes: 0 pass, 1 below threshold, 2 usage / input error.
 * See SCORING_GUIDE.md for the rubric and transcript format.
 */
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const ADVANCING = new Set(['phase', 'final', 'execute', 'handoff']);
const NON_AGENT_COMMANDS = new Set(['compact', 'end', 'resume', 'clear', 'help', 'shards-ui', 'shards-guide']);
const SYN_COMMANDS = new Set(['shards', 'review-pr', 'brainstorm']);

function normAgent(name) {
  return String(name || '').trim().toLowerCase().replace(/_/g, '-');
}

function commandToAgent(cmd) {
  const c = normAgent(cmd).replace(/^\//, '');
  if (!c || NON_AGENT_COMMANDS.has(c)) return null;
  if (SYN_COMMANDS.has(c)) return 'syn';
  return c;
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function listFiles(root) {
  const out = [];
  (function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  })(root, '');
  return out;
}

function parseGateAttrs(header) {
  const attrs = {};
  const re = /(\w+)=(\S+)/g;
  let m;
  while ((m = re.exec(header))) attrs[m[1]] = m[2];
  return attrs;
}

/** Parse stream-json lines into an ordered list of normalized events. */
function parseTranscript(lines) {
  const events = [];
  let compactions = 0;
  for (const raw of lines) {
    const line = typeof raw === 'string' ? raw.trim() : '';
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev !== 'object') continue;
    if (ev.type === 'system' && ev.subtype === 'compact_boundary') { compactions++; continue; }
    const content = ev.message && ev.message.content;
    if (ev.type === 'assistant') {
      const blocks = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : []);
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string') {
          events.push({ kind: 'assistant_text', text: b.text });
        } else if (b.type === 'tool_use') {
          events.push({ kind: 'tool_use', name: b.name, input: b.input || {} });
        }
      }
    } else if (ev.type === 'user') {
      let text = null;
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        const t = content.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text);
        if (t.length) text = t.join('\n');
      }
      if (text !== null && text.trim()) {
        if (/^\s*\/compact\b/.test(text)) compactions++;
        events.push({ kind: 'human', text });
      }
    }
  }
  return { events, compactions };
}

function analyze(events) {
  const routing = [];
  const pushAgent = (a) => {
    if (a && routing[routing.length - 1] !== a) routing.push(a);
  };
  const gates = []; // { id, kind, phase }
  const assistantText = [];
  const approvals = {}; // gate id -> human approvals
  const selfApprovals = [];
  let pending = null;
  let humanTurns = 0;

  for (const ev of events) {
    if (ev.kind === 'human') {
      humanTurns++;
      let m = ev.text.match(/<command-name>\s*\/?([a-z0-9-]+)\s*<\/command-name>/i) || ev.text.match(/^\s*\/([a-z0-9-]+)/);
      if (m) pushAgent(commandToAgent(m[1]));
      if (pending) { approvals[pending.id] = (approvals[pending.id] || 0) + 1; pending = null; }
    } else if (ev.kind === 'tool_use') {
      const input = ev.input;
      if ((ev.name === 'Task' || ev.name === 'Agent') && input.subagent_type) {
        pushAgent(normAgent(input.subagent_type));
      } else if (ev.name === 'Read' && typeof input.file_path === 'string') {
        let m = input.file_path.match(/\.claude\/agents\/([A-Za-z0-9_-]+)\.md$/);
        if (m) pushAgent(normAgent(m[1]));
        else if ((m = input.file_path.match(/\.claude\/commands\/([A-Za-z0-9_-]+)\.md$/))) pushAgent(commandToAgent(m[1]));
      }
    } else if (ev.kind === 'assistant_text') {
      assistantText.push(ev.text);
      const re = /::GATE::([^\n]*)\n([\s\S]*?)::ENDGATE::/g;
      let m;
      while ((m = re.exec(ev.text))) {
        const attrs = parseGateAttrs(m[1]);
        if (!attrs.id) continue;
        const gate = { id: attrs.id, kind: attrs.kind || 'phase', phase: attrs.phase };
        if (!['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm'].includes(gate.kind)) gate.kind = 'phase';
        if (ADVANCING.has(gate.kind)) {
          if (pending && pending.id !== gate.id) selfApprovals.push({ from: pending.id, to: gate.id });
          pending = gate;
        } else if (!pending) {
          pending = gate; // non-advancing gate still waits on a human in strict mode
        }
        gates.push(gate);
      }
    }
  }
  return { routing, gates, assistantText, approvals, selfApprovals, humanTurns };
}

function matchesId(pattern, id) {
  return pattern.includes('*') ? globToRegExp(pattern).test(id) : pattern === id;
}

function scoreArtifacts(spec, outdir) {
  const files = fs.existsSync(outdir) ? listFiles(outdir) : [];
  const items = [];
  for (const art of spec.expected_artifacts || []) {
    const base = art.root === '.' || !spec.output_dir_glob || spec.output_dir_glob === '.' ? '' : spec.output_dir_glob + '/';
    const re = globToRegExp(base + art.path);
    const matched = files.filter(f => re.test(f));
    items.push({ path: art.path, required: art.required !== false, found: matched.length > 0, matches: matched.slice(0, 3) });
  }
  const required = items.filter(i => i.required);
  const score = required.length ? required.filter(i => i.found).length / required.length : 1;
  return { score, items };
}

function scoreGates(spec, an) {
  const items = [];
  for (const eg of spec.expected_gates || []) {
    const min = eg.min || 1;
    const matching = an.gates.filter(g => matchesId(eg.id, g.id));
    const kindOk = matching.filter(g => !eg.kind || g.kind === eg.kind);
    const count = kindOk.length;
    let approvals = 0;
    for (const g of new Set(matching.map(x => x.id))) approvals += an.approvals[g] || 0;
    items.push({
      id: eg.id, kind: eg.kind, min, count, ok: count >= min,
      partial: Math.min(count, min) / min,
      approvals, max_human_approvals: eg.max_human_approvals,
    });
  }
  const score = items.length ? items.reduce((s, i) => s + i.partial, 0) / items.length : 1;
  return { score, items };
}

function scoreRouting(spec, an) {
  const expected = (spec.expected_routing || []).map(normAgent);
  let idx = 0;
  const matched = [];
  for (const a of an.routing) {
    if (idx < expected.length && a === expected[idx]) { matched.push(a); idx++; }
  }
  return { score: expected.length ? idx / expected.length : 1, expected, observed: an.routing, matched: idx };
}

function scoreForbidden(spec, an) {
  const violations = [];
  const counts = {};
  for (const g of an.gates) counts[g.id] = (counts[g.id] || 0) + 1;
  for (const f of spec.forbidden || []) {
    if (f.type === 'gate_self_approval') {
      for (const s of an.selfApprovals) violations.push({ rule: f.id, detail: `${s.to} emitted while ${s.from} unconfirmed` });
    } else if (f.type === 'gate_reask') {
      const allowed = f.allowed_reemits || {};
      for (const [id, n] of Object.entries(counts)) {
        const max = 1 + (allowed[id] || 0);
        if (n > max) violations.push({ rule: f.id, detail: `${id} emitted ${n}x (max ${max})` });
      }
    } else if (f.type === 'forbidden_agents') {
      const bad = (f.agents || []).map(normAgent).filter(a => an.routing.includes(a));
      for (const b of bad) violations.push({ rule: f.id, detail: `routed to ${b}` });
    } else if (f.type === 'forbidden_text') {
      const re = new RegExp(f.pattern);
      if (an.assistantText.some(t => re.test(t))) violations.push({ rule: f.id, detail: `matched /${f.pattern}/` });
    }
  }
  const total = (spec.forbidden || []).length;
  const hit = new Set(violations.map(v => v.rule)).size;
  return { score: total ? Math.max(0, 1 - hit / total) : 1, violations };
}

function scoreTargets(spec, an, compactions) {
  const t = spec.next_build_targets || {};
  const out = [];
  const total = Object.values(an.approvals).reduce((a, b) => a + b, 0);
  const lim = t.max_human_approvals_total != null ? t.max_human_approvals_total : t.max_human_approvals_phase_policy;
  if (lim != null) out.push({ target: 'human approvals', limit: lim, actual: total, ok: total <= lim });
  if (spec.forced_compactions) {
    out.push({ target: 'forced compactions seen', limit: spec.forced_compactions, actual: compactions, ok: compactions >= spec.forced_compactions });
  }
  return out;
}

function scoreSession(spec, transcriptLines, outdir, opts = {}) {
  const { events, compactions } = parseTranscript(transcriptLines);
  const an = analyze(events);
  const cats = {
    artifacts: scoreArtifacts(spec, outdir),
    gates: scoreGates(spec, an),
    routing: scoreRouting(spec, an),
    forbidden: scoreForbidden(spec, an),
  };
  const w = spec.weights;
  let total = 0;
  const categories = {};
  for (const k of Object.keys(cats)) {
    const pts = cats[k].score * w[k];
    total += pts;
    categories[k] = { weight: w[k], ratio: cats[k].score, points: pts, detail: cats[k] };
  }
  const targets = scoreTargets(spec, an, compactions);
  const threshold = opts.threshold != null ? opts.threshold : 90;
  let pass = total >= threshold;
  if (opts.enforceTargets && targets.some(t => !t.ok)) pass = false;
  return { session: spec.id, total, threshold, pass, categories, targets, humanTurns: an.humanTurns, compactions };
}

function resolveSpec(arg) {
  const candidates = [arg, path.join(SESSIONS_DIR, arg), path.join(SESSIONS_DIR, arg + '.json')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return JSON.parse(fs.readFileSync(c, 'utf8'));
  }
  throw new Error(`session spec not found: ${arg}`);
}

function parseArgs(argv) {
  const o = { json: false, enforceTargets: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--enforce-targets') o.enforceTargets = true;
    else if (['--session', '--transcript', '--outdir', '--threshold'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

function format(r) {
  const L = [`Session: ${r.session}`];
  for (const [k, c] of Object.entries(r.categories)) {
    L.push(`  ${k.padEnd(10)} ${c.points.toFixed(1).padStart(5)} / ${c.weight}`);
    const d = c.detail;
    if (k === 'artifacts') for (const i of d.items) L.push(`    [${i.found ? 'x' : ' '}] ${i.path}${i.required ? '' : ' (optional)'}`);
    if (k === 'gates') for (const i of d.items) L.push(`    [${i.ok ? 'x' : ' '}] ${i.id} (${i.kind}) ${i.count}/${i.min}`);
    if (k === 'routing') L.push(`    expected: ${d.expected.join(' > ')}\n    observed: ${d.observed.join(' > ')}`);
    if (k === 'forbidden') for (const v of d.violations) L.push(`    VIOLATION ${v.rule}: ${v.detail}`);
  }
  for (const t of r.targets) L.push(`  target ${t.target}: ${t.actual} vs ${t.limit} ${t.ok ? 'ok' : 'MISS'}`);
  L.push(`Total: ${r.total.toFixed(1)} / 100 (threshold ${r.threshold}) ${r.pass ? 'PASS' : 'FAIL'}`);
  return L.join('\n');
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
    if (!o.session || !o.transcript || !o.outdir) throw new Error('--session, --transcript and --outdir are required');
  } catch (e) {
    process.stderr.write(`${e.message}\nusage: score.js --session <id|path> --transcript <jsonl> --outdir <dir> [--json] [--threshold N] [--enforce-targets]\n`);
    return 2;
  }
  let res;
  try {
    const spec = resolveSpec(o.session);
    const lines = fs.readFileSync(o.transcript, 'utf8').split('\n');
    res = scoreSession(spec, lines, o.outdir, { threshold: o.threshold != null ? Number(o.threshold) : 90, enforceTargets: o.enforceTargets });
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 2;
  }
  process.stdout.write((o.json ? JSON.stringify(res, null, 2) : format(res)) + '\n');
  return res.pass ? 0 : 1;
}

module.exports = { scoreSession, parseTranscript, analyze, globToRegExp, resolveSpec, SESSIONS_DIR };

if (require.main === module) process.exit(main(process.argv.slice(2)));
