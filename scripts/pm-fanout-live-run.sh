#!/usr/bin/env bash
# E5.9 live-run harness: "PM runs a 2-workstream plan (gated AE + 4-slice BI swarm) on Claude Code".
#
# ONE SAMPLE, NEVER A PASS RATE. A single `claude -p` run is anecdotal evidence that the path works
# once; it says nothing about reliability. Do not quote a PASS here as a rate or as release evidence
# beyond "observed once". Spends model quota: run it by hand. This script is never run by CI.
#
# Usage:
#   scripts/pm-fanout-live-run.sh [--dry-run] [--plugin-dir DIR] [--keep]   run one live sample (default)
#   scripts/pm-fanout-live-run.sh --dry-run        print the planned command; set up a temp dir with a
#                                                  synthetic good state fixture and run the checker on it
#   scripts/pm-fanout-live-run.sh --check-only DIR run only the checker on an existing project dir
#
# Never uses --dangerously-skip-permissions. Allowed tools: the shards MCP tools, Read/Write/Edit and
# Agent (workers must be launched; Bash is not allowed).
#
# Checker inputs: <DIR>/.shards/state/sessions/*/{leases,gates}.json and the stream-json transcript
# <DIR>/.fanout-run/stream.jsonl (denials and the merged verdict are not persisted in state).
# Exit: 0 all PASS, 1 any FAIL, 2 usage error.
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="mcp__plugin_shards_shards__"
TOOLS="activate active return gate_request gate_confirm gates_open shards_status load_phase fanout_start fanout_claim fanout_collect tasks_set task_dispatch task_report task_verify task_status artifact_emit"
PROMPT='You are the Shards PM. Plan and run a 2-workstream project in this directory. Workstream 1: an Analytics Engineer (gated; switch into it, request a gate, and confirm it before continuing). Workstream 2: a BI Engineer 4-slice swarm: after the gate is confirmed, call fanout_start with exactly 4 non-overlapping slices (dashboards/p/s1 .. dashboards/p/s4), launch one worker per slice in parallel, each worker calls fanout_claim first and writes only inside its slice, then call fanout_collect with one verdict per slice and report the merged verdict. Do not use Bash.'

DRY=0; CHECK=""; KEEP=0; PLUGIN="$REPO/adapters/claude-code"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --keep) KEEP=1 ;;
    --check-only) shift; CHECK="${1:-}"; [ -n "$CHECK" ] || { echo "usage: --check-only DIR" >&2; exit 2; } ;;
    --plugin-dir) shift; PLUGIN="${1:-}" ;;
    -h|--help) sed -n 2,20p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

check() {
  node - "$1" <<'NODE'
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const out = []; const add = (ok, name, why) => out.push({ ok, name, why });
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
const sdir = path.join(dir, '.shards', 'state', 'sessions');
let leases = [], gates = [];
if (fs.existsSync(sdir)) for (const s of fs.readdirSync(sdir)) {
  const l = rj(path.join(sdir, s, 'leases.json')); if (l && l.leases) leases.push(...Object.values(l.leases));
  const g = rj(path.join(sdir, s, 'gates.json')); if (g && g.gates) gates.push(...Object.values(g.gates));
}
leases = leases.filter((l) => l && l.owner === 'fanout');
// stream transcript
const P = 'mcp__plugin_shards_shards__';
const uses = new Map(); const results = new Map(); const order = [];
const sf = path.join(dir, '.fanout-run', 'stream.jsonl');
const haveStream = fs.existsSync(sf);
if (haveStream) for (const line of fs.readFileSync(sf, 'utf8').split('\n')) {
  if (!line.trim().startsWith('{')) continue;
  let ev; try { ev = JSON.parse(line); } catch (_) { continue; }
  const blocks = ev.message && Array.isArray(ev.message.content) ? ev.message.content : [];
  for (const b of blocks) {
    if (b.type === 'tool_use') { uses.set(b.id, b); order.push(b.id); }
    else if (b.type === 'tool_result') {
      const t = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c) => c.text || '').join('') : '';
      results.set(b.tool_use_id, { err: !!b.is_error, text: t });
    }
  }
}
// 1. lease with 4 slices
const four = leases.filter((l) => Array.isArray(l.slices) && l.slices.length === 4);
add(four.length >= 1, 'fanout lease opened with 4 slices', four.length ? four[0].id : `fanout leases found: ${leases.map((l) => (l.slices || []).length).join(',') || 'none'}`);
const lease = four[0];
// 2. no gate pending at fanout_start time
if (lease) {
  const t = Date.parse(lease.opened_at);
  const bad = gates.filter((g) => g && Date.parse(g.requested_at) <= t && (g.status === 'pending' || Date.parse(g.updated_at) > t));
  add(bad.length === 0, 'no gate pending when fanout_start ran', bad.length ? `pending at ${lease.opened_at}: ${bad.map((g) => g.id).join(', ')}` : '');
} else add(false, 'no gate pending when fanout_start ran', 'no lease to time against');
// 3. no write outside slice recorded as denied-then-succeeded
if (!haveStream) add(false, 'no denied-then-succeeded write', 'stream transcript missing (.fanout-run/stream.jsonl)');
else {
  const bad = [];
  const writes = order.map((id) => uses.get(id)).filter((u) => /^(Write|Edit)$/.test(u.name) && u.input && u.input.file_path);
  for (let i = 0; i < writes.length; i++) {
    const r = results.get(writes[i].id);
    if (!(r && r.err && /shards:/.test(r.text))) continue;
    const later = writes.slice(i + 1).find((w) => w.input.file_path === writes[i].input.file_path && results.get(w.id) && !results.get(w.id).err);
    if (later) bad.push(writes[i].input.file_path);
  }
  add(bad.length === 0, 'no denied-then-succeeded write', bad.join(', '));
}
// 4. lease closed via fanout_collect
const collectIds = order.filter((id) => uses.get(id).name === P + 'fanout_collect');
const collected = collectIds.map((id) => ({ id, r: results.get(id) })).filter((x) => x.r && !x.r.err);
add(!!lease && lease.status === 'closed' && collected.length >= 1, 'lease closed via fanout_collect', lease ? `status=${lease.status}, successful collect calls=${collected.length}` : 'no lease');
// 5. merged verdict present
const mv = collected.map((x) => /"verdict":\s*"(APPROVED|NEEDS REVISION|BLOCKED)"/.exec(x.r.text)).filter(Boolean)[0];
add(!!mv, 'merged verdict present', mv ? mv[1] : 'no merged verdict in fanout_collect result');
let fail = 0;
for (const o of out) { if (!o.ok) fail++; console.log(`${o.ok ? 'PASS' : 'FAIL'}  ${o.name}${o.why ? ' -- ' + o.why : ''}`); }
console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${out.length - fail}/${out.length} checks (ONE SAMPLE, not a pass rate)`);
process.exit(fail ? 1 : 0);
NODE
}

write_fixture() {
  local d="$1"
  node - "$d" <<'NODE'
const fs = require('fs'), path = require('path');
const d = process.argv[2];
const s = path.join(d, '.shards', 'state', 'sessions', 'synthetic');
fs.mkdirSync(s, { recursive: true }); fs.mkdirSync(path.join(d, '.fanout-run'), { recursive: true });
const P = 'mcp__plugin_shards_shards__';
fs.writeFileSync(path.join(s, 'leases.json'), JSON.stringify({ leases: { 'lease-1': { id: 'lease-1', owner: 'fanout', status: 'closed',
  opened_at: '2026-01-01T00:10:00.000Z', slices: [1, 2, 3, 4].map((n) => ({ id: 's' + n, paths: ['dashboards/p/s' + n] })) } } }));
fs.writeFileSync(path.join(s, 'gates.json'), JSON.stringify({ gates: { g1: { id: 'g1', status: 'confirmed', requested_at: '2026-01-01T00:01:00.000Z', updated_at: '2026-01-01T00:05:00.000Z' } } }));
const a = (b) => JSON.stringify({ type: 'assistant', message: { content: [b] } });
const u = (b) => JSON.stringify({ type: 'user', message: { content: [b] } });
fs.writeFileSync(path.join(d, '.fanout-run', 'stream.jsonl'), [
  a({ type: 'tool_use', id: 't1', name: P + 'fanout_start', input: {} }),
  u({ type: 'tool_result', tool_use_id: 't1', content: 'ok' }),
  a({ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: 'dashboards/p/s1/a.md' } }),
  u({ type: 'tool_result', tool_use_id: 't2', content: 'ok' }),
  a({ type: 'tool_use', id: 't3', name: P + 'fanout_collect', input: {} }),
  u({ type: 'tool_result', tool_use_id: 't3', content: 'Fan-out lease-1 collected: APPROVED. Lease closed.\n\n{"verdict": "APPROVED", "per_slice": {}}' }),
].join('\n') + '\n');
NODE
}

allowed() { local o="" t; for t in $TOOLS; do o="${o:+$o,}$PREFIX$t"; done; echo "$o,Read,Write,Edit,Agent"; }
planned() { printf 'cd %q && claude -p %q --plugin-dir %q --output-format stream-json --verbose --allowedTools %q\n' "$1" "$PROMPT" "$PLUGIN" "$(allowed)"; }

if [ -n "$CHECK" ]; then
  [ -d "$CHECK" ] || { echo "not a directory: $CHECK" >&2; exit 2; }
  check "$CHECK"; exit $?
fi

PROJ="$(mktemp -d "${TMPDIR:-/tmp}/pm-fanout-XXXXXX")" || exit 2
echo "project_dir: $PROJ"
mkdir -p "$PROJ/.fanout-run"

if [ "$DRY" = 1 ]; then
  echo "DRY RUN: claude is not invoked. Planned command:"
  planned "$PROJ"
  echo "Checking synthetic good fixture:"
  write_fixture "$PROJ"
  check "$PROJ"; rc=$?
  echo "(temp dir kept: $PROJ)"
  exit $rc
fi

command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }
planned "$PROJ"
(cd "$PROJ" && claude -p "$PROMPT" --plugin-dir "$PLUGIN" --output-format stream-json --verbose --allowedTools "$(allowed)" > "$PROJ/.fanout-run/stream.jsonl" 2> "$PROJ/.fanout-run/stderr.log")
echo "claude exit: $?"
check "$PROJ"; exit $?
