#!/usr/bin/env node
'use strict';
// Switch eval: does `/shards:<id>` make the model call activate(agent=<id>, mode=switch)?
// Runs headless `claude -p` against a dev build, N runs per agent. Spends model quota: run it by hand.
// Never uses --dangerously-skip-permissions; only the activate/active/return tools are allowed.
// UNVERIFIED: whether `-p "/shards:<id>"` expands a plugin skill headless (see docs/compat.md).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const PREFIX = 'mcp__plugin_shards_shards__';
const ALLOWED = ['activate', 'active', 'return'].map((t) => PREFIX + t);
const REPO = path.resolve(__dirname, '..', '..');

// Parse `claude -p --output-format stream-json` output (one JSON object per line).
function parseStream(text) {
  const activations = [];
  const tools = [];
  let result = null;
  for (const line of String(text || '').split('\n')) {
    const l = line.trim();
    if (!l.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(l); } catch (_) { continue; }
    if (ev.type === 'result') result = { is_error: !!ev.is_error, subtype: ev.subtype || null };
    const content = ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content) ? ev.message.content : [];
    for (const b of content) {
      if (!b || b.type !== 'tool_use') continue;
      tools.push(b.name);
      if (/(^|__)activate$/.test(b.name)) activations.push({ name: b.name, agent: (b.input || {}).agent, mode: (b.input || {}).mode });
    }
  }
  return { activations, tools, result };
}

function scoreSwitch(parsed, agentId) {
  const first = parsed.activations[0] || null;
  const hit = parsed.activations.find((a) => a.agent === agentId && a.mode === 'switch');
  return {
    agent: agentId,
    pass: !!hit,
    firstCallCorrect: !!first && first.agent === agentId && first.mode === 'switch',
    activated: parsed.activations.length > 0,
    wrongAgent: parsed.activations.filter((a) => a.agent !== agentId).map((a) => a.agent),
  };
}

function summarize(scores) {
  const by = {};
  for (const s of scores) {
    const b = by[s.agent] || (by[s.agent] = { runs: 0, pass: 0, firstCallCorrect: 0 });
    b.runs += 1; b.pass += s.pass ? 1 : 0; b.firstCallCorrect += s.firstCallCorrect ? 1 : 0;
  }
  return by;
}

function switchableAgents(coreDir) {
  const dir = path.join(coreDir, 'agents');
  return fs.readdirSync(dir).sort().filter((id) => {
    try { return (YAML.parse(fs.readFileSync(path.join(dir, id, 'agent.yaml'), 'utf8')).activation || []).includes('switch'); } catch (_) { return false; }
  });
}

function plan({ agents, runs, pluginDir }) {
  const out = [];
  for (const id of agents) {
    for (let i = 1; i <= runs; i += 1) {
      out.push({ agent: id, run: i, cmd: 'claude', args: ['-p', `/shards:${id}`, '--plugin-dir', pluginDir, '--output-format', 'stream-json', '--verbose', '--allowedTools', ALLOWED.join(',')] });
    }
  }
  return out;
}

function parseArgs(argv) {
  const o = { runs: 3, agents: null, pluginDir: path.join(REPO, 'adapters', 'claude-code'), dryRun: false, core: path.join(REPO, 'core') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--runs') o.runs = Number(argv[++i]);
    else if (a === '--agent') o.agents = String(argv[++i]).split(',');
    else if (a === '--plugin-dir') o.pluginDir = path.resolve(argv[++i]);
    else if (a === '--core') o.core = path.resolve(argv[++i]);
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isInteger(o.runs) || o.runs < 1) throw new Error('--runs must be a positive integer');
  return o;
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`switch-eval: ${e.message}\nusage: switch-eval.js [--dry-run] [--runs N] [--agent a,b] [--plugin-dir dir] [--core dir]`); return 2; }
  const agents = o.agents || switchableAgents(o.core);
  const runs = plan({ agents, runs: o.runs, pluginDir: o.pluginDir });
  if (o.dryRun) {
    for (const r of runs) console.log(`${r.agent}#${r.run}: ${r.cmd} ${r.args.join(' ')}`);
    console.log(`${runs.length} planned runs (dry run, nothing executed)`);
    return 0;
  }
  const scores = [];
  for (const r of runs) {
    const p = spawnSync(r.cmd, r.args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
    const s = scoreSwitch(parseStream(p.stdout), r.agent);
    scores.push(s);
    console.log(`${r.agent}#${r.run}: ${s.pass ? 'PASS' : 'FAIL'}${s.wrongAgent.length ? ` wrong=${s.wrongAgent.join(',')}` : ''}`);
  }
  const by = summarize(scores);
  for (const [id, b] of Object.entries(by)) console.log(`${id}: ${b.pass}/${b.runs} pass, ${b.firstCallCorrect}/${b.runs} first-call`);
  return scores.every((s) => s.pass) ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { parseStream, scoreSwitch, summarize, plan, parseArgs, ALLOWED };
