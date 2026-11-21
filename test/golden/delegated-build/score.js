#!/usr/bin/env node
'use strict';
// Scores a finished delegated-build project dir. ONE SAMPLE, NEVER A PASS RATE.
// usage: node score.js <project_dir> [--json]
// Reads: <dir>/.shards/state/sessions/*/tasks.json, the project-specs.md next to the manifest,
//        optional stream transcript <dir>/.delegated-build-run/stream.jsonl (owned-path denials).
// Exit 0 only if every MEASURED criterion passes; unmeasured ones are "n/a (not measured)".
const fs = require('fs');
const path = require('path');

const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
const inside = (p, owned) => owned.some((o) => { const q = norm(o).replace(/\/+$/, ''); return p === q || p.startsWith(q + '/'); });

function score(dir) {
  const root = path.resolve(dir);
  const sdir = path.join(root, '.shards', 'state', 'sessions');
  let st = null;
  if (fs.existsSync(sdir)) for (const s of fs.readdirSync(sdir)) {
    const t = rj(path.join(sdir, s, 'tasks.json'));
    if (t && t.manifest && (!st || Object.keys(t.tasks || {}).length >= Object.keys(st.tasks || {}).length)) st = t;
  }
  const rows = [];
  const add = (name, value, ok, note) => rows.push({ name, value, ok, note: note || '' });
  const NA = 'n/a (not measured)';
  if (!st) {
    add('tasks state found', 'none', false, 'no .shards/state/sessions/*/tasks.json with a manifest');
    return { rows, pass: false };
  }
  const tasks = st.manifest.tasks;
  const ts = st.tasks || {};
  const done = tasks.filter((t) => ts[t.id] && ts[t.id].status === 'done');
  add('tasks done / total', `${done.length}/${tasks.length}`, done.length === tasks.length);

  const within = done.filter((t) => (ts[t.id].attempts || 0) <= 3);
  add('share done within 2 retries', tasks.length ? `${within.length}/${tasks.length}` : '0/0', within.length === tasks.length);

  const specsFile = path.join(root, path.dirname(st.path || 'tasks.yaml'), 'project-specs.md');
  const specs = fs.existsSync(specsFile) ? fs.readFileSync(specsFile, 'utf8') : '';
  // evidence rows: Validation Evidence table rows "| <id>: ... | ... | ... | ✓ |"
  const lines = specs.split('\n');
  const vi = lines.findIndex((l) => /^## Validation\s*$/.test(l));
  let section = [];
  if (vi >= 0) { let end = lines.length; for (let i = vi + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; } section = lines.slice(vi + 1, end); }
  const passRow = (id) => section.filter((l) => l.startsWith(`| ${id}: `) && /\|\s*✓\s*\|/.test(l)).length;
  const missing = done.filter((t) => passRow(t.id) < 1).map((t) => t.id);
  const perDone = done.length ? (done.reduce((a, t) => a + passRow(t.id), 0) / done.length).toFixed(2) : '0';
  add('evidence rows per done task (pass rows)', `${perDone} avg`, done.length > 0 && missing.length === 0, missing.length ? `done without evidence: ${missing.join(', ')}` : (vi < 0 ? 'no ## Validation section' : ''));

  const retries = tasks.reduce((a, t) => a + Math.max(0, ((ts[t.id] || {}).attempts || 0) - 1), 0);
  add('retries used (total)', String(retries), retries <= 2 * tasks.length, 'informational; max 2 per task');
  const esc = tasks.filter((t) => ts[t.id] && (ts[t.id].escalated || ts[t.id].status === 'blocked')).length;
  add('escalated count', String(esc), esc === 0);

  // owned-path violations from stream transcript
  const sf = path.join(root, '.delegated-build-run', 'stream.jsonl');
  if (!fs.existsSync(sf)) add('owned-path violations', NA, null);
  else {
    const uses = new Map(); const results = new Map(); const order = [];
    for (const line of fs.readFileSync(sf, 'utf8').split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let ev; try { ev = JSON.parse(line); } catch (_) { continue; }
      for (const b of (ev.message && Array.isArray(ev.message.content) ? ev.message.content : [])) {
        if (b.type === 'tool_use') { uses.set(b.id, b); order.push(b.id); }
        else if (b.type === 'tool_result') results.set(b.tool_use_id, { err: !!b.is_error, text: typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c) => c.text || '').join('') : '' });
      }
    }
    const owned = tasks.flatMap((t) => t.owned_paths);
    const free = [path.dirname(st.path || 'tasks.yaml') + '/project-specs.md', st.path, path.dirname(st.path || 'tasks.yaml') + '/TASKS.md'].map(norm);
    const viol = []; let denials = 0;
    for (const id of order) {
      const u = uses.get(id); const r = results.get(id);
      if (!/^(Write|Edit)$/.test(u.name) || !u.input || !u.input.file_path) continue;
      const rel = norm(path.isAbsolute(u.input.file_path) ? path.relative(root, u.input.file_path) : u.input.file_path);
      if (r && r.err && /shards:/.test(r.text)) { denials++; continue; }
      if (r && !r.err && !inside(rel, owned) && !free.includes(rel)) viol.push(rel);
    }
    add('owned-path violations (successful writes outside owned_paths)', String(viol.length), viol.length === 0, `denied attempts: ${denials}${viol.length ? '; ' + viol.join(', ') : ''}`);
  }

  // plan changes without amendment gate
  const amended = (st.consumed_amendments || []).length;
  const driftOpen = !!(st.drift && st.drift.open);
  add('plan changes without amendment gate', driftOpen ? 'drift still open' : '0', !driftOpen, `consumed amendments: ${amended}; unresolved drift fails (replacement without gate is refused by the runtime)`);

  add('context ratio vs legacy', 'OPEN: needs legacy run', null, 'never claimed from a single run');
  const pass = rows.every((r) => r.ok !== false);
  return { rows, pass };
}

module.exports = { score };
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node score.js <project_dir> [--json]'); process.exit(2); }
  const { rows, pass } = score(dir);
  for (const r of rows) console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'OPEN'}  ${r.name}: ${r.value}${r.note ? ' -- ' + r.note : ''}`);
  console.log(`\n${pass ? 'PASS' : 'FAIL'} (ONE SAMPLE, not a pass rate)`);
  console.log(JSON.stringify({ pass, rows }, null, 2));
  process.exit(pass ? 0 : 1);
}
