#!/usr/bin/env node
'use strict';
// Router eval (E5.4): runs each prompt in test/router/prompts.json through a headless
// `claude -p` session with the dev plugin loaded and scores the runtime tool calls.
// Usage: node scripts/eval/router-eval.js [--plugin-dir <dir>] [--runs N] [--limit K]
//        [--invoke agent|skill] [--dry-run]
// NOTE: live runs spend model budget; --dry-run never calls claude.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PREFIX = 'mcp__plugin_shards_shards__';
const TOOLS = ['activate', 'return', 'active', 'list_agents'];
const ALLOWED = TOOLS.map((t) => PREFIX + t).join(',');

// Parse `claude --output-format stream-json --verbose` output into shards tool calls.
// Returns [{tool, input}] in order. Ignores non-JSON lines and non-shards tools.
function parseStream(text) {
  const calls = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    let ev;
    try { ev = JSON.parse(s); } catch (_) { continue; }
    if (!ev || ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
    for (const part of ev.message.content) {
      if (!part || part.type !== 'tool_use' || typeof part.name !== 'string') continue;
      if (!part.name.startsWith(PREFIX)) continue;
      const tool = part.name.slice(PREFIX.length);
      if (TOOLS.includes(tool)) calls.push({ tool, input: part.input || {} });
    }
  }
  return calls;
}

// Score one prompt. Returns {pass, reason}.
function scorePrompt(expect, toolCalls) {
  const calls = toolCalls || [];
  const switches = calls.filter((c) => c.tool === 'activate' && (c.input.mode || 'switch') === 'switch');
  if (expect.tool === 'none') {
    if (expect.kind === 'consult') {
      if (switches.length) return { pass: false, reason: `switched to ${switches[0].input.agent} on a consult-only request` };
      if (calls.some((c) => c.tool === 'return')) return { pass: false, reason: 'called return on a consult-only request' };
      return { pass: true, reason: 'no switch' };
    }
    if (calls.length) return { pass: false, reason: `expected clarification, got ${calls[0].tool}` };
    return { pass: true, reason: 'no tool call' };
  }
  const first = calls.find((c) => c.tool === expect.tool);
  if (!first) return { pass: false, reason: `no ${expect.tool} call (saw: ${calls.map((c) => c.tool).join(', ') || 'none'})` };
  if (expect.tool === 'activate') {
    const mode = first.input.mode || 'switch';
    if (expect.agent && first.input.agent !== expect.agent) return { pass: false, reason: `agent ${first.input.agent} != ${expect.agent}` };
    if ((expect.mode || 'switch') !== mode) return { pass: false, reason: `mode ${mode} != ${expect.mode || 'switch'}` };
    const wrong = switches.find((c) => c.input.agent !== expect.agent);
    if (wrong) return { pass: false, reason: `also switched to ${wrong.input.agent}` };
  }
  if (expect.tool === 'return') {
    if (expect.to !== undefined && first.input.to !== expect.to) return { pass: false, reason: `to ${first.input.to} != ${expect.to}` };
    if (expect.to === undefined && first.input.to) return { pass: false, reason: `unexpected to=${first.input.to}` };
  }
  return { pass: true, reason: 'ok' };
}

function loadPrompts(file = path.join(ROOT, 'test', 'router', 'prompts.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Returns array of error strings.
function validatePrompts(prompts, agentIds) {
  const errs = [];
  if (!Array.isArray(prompts) || prompts.length !== 22) errs.push(`expected 22 prompts, found ${Array.isArray(prompts) ? prompts.length : 'non-array'}`);
  const ids = new Set(agentIds);
  for (const [i, p] of (prompts || []).entries()) {
    const at = `prompt[${i}]`;
    if (!p.prompt || typeof p.prompt !== 'string') errs.push(`${at}: missing prompt`);
    if (!p.expect || ![...TOOLS, 'none'].includes(p.expect.tool)) { errs.push(`${at}: bad expect.tool`); continue; }
    if (!ids.has(p.id)) errs.push(`${at}: id ${p.id} is not a core agent`);
    if (p.expect.tool === 'activate' && !ids.has(p.expect.agent)) errs.push(`${at}: expect.agent ${p.expect.agent} invalid`);
    if (p.expect.to !== undefined && !ids.has(p.expect.to)) errs.push(`${at}: expect.to ${p.expect.to} invalid`);
    if (p.expect.tool === 'none' && !['consult', 'clarify'].includes(p.expect.kind)) errs.push(`${at}: tool none needs kind consult|clarify`);
  }
  return errs;
}

function agentIds() {
  const dir = path.join(ROOT, 'core', 'agents');
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'agent.yaml')));
}

function buildArgs(prompt, pluginDir, invoke) {
  const args = ['-p'];
  if (invoke === 'skill') args.push(`/shards:syn ${prompt}`);
  else args.push(prompt);
  args.push('--plugin-dir', pluginDir);
  if (invoke !== 'skill') args.push('--agent', 'shards:syn');
  args.push('--output-format', 'stream-json', '--verbose', '--allowedTools', ALLOWED);
  return args;
}

function parseCli(argv) {
  const o = { runs: 1, limit: Infinity, pluginDir: null, dryRun: false, invoke: 'agent' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--plugin-dir') o.pluginDir = argv[++i];
    else if (a === '--runs') o.runs = parseInt(argv[++i], 10);
    else if (a === '--limit') o.limit = parseInt(argv[++i], 10);
    else if (a === '--invoke') o.invoke = argv[++i];
    else throw new Error(`unknown option ${a}`);
  }
  if (!(o.runs >= 1)) throw new Error('--runs must be >= 1');
  if (!(o.limit >= 1)) throw new Error('--limit must be >= 1');
  if (!['agent', 'skill'].includes(o.invoke)) throw new Error('--invoke must be agent|skill');
  return o;
}

function main(argv) {
  const o = parseCli(argv);
  const prompts = loadPrompts();
  const errs = validatePrompts(prompts, agentIds());
  if (errs.length) { console.error(errs.join('\n')); return 1; }
  if (o.dryRun) { console.log(`ok: ${prompts.length} prompts valid`); return 0; }
  if (!o.pluginDir) { console.error('--plugin-dir is required for a live run'); return 2; }
  const subset = prompts.slice(0, Math.min(o.limit, prompts.length));
  let pass = 0; let total = 0;
  for (const p of subset) {
    for (let r = 0; r < o.runs; r++) {
      const res = spawnSync('claude', buildArgs(p.prompt, path.resolve(o.pluginDir), o.invoke), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
      const s = res.error ? { pass: false, reason: `spawn error: ${res.error.message}` } : scorePrompt(p.expect, parseStream(res.stdout));
      total++; if (s.pass) pass++;
      console.log(`${s.pass ? 'PASS' : 'FAIL'} [${p.expect.tool}${p.expect.agent ? ':' + p.expect.agent : ''}] "${p.prompt}" run ${r + 1}: ${s.reason}`);
    }
  }
  console.log(`${pass}/${total}`);
  return pass === total ? 0 : 1;
}

module.exports = { parseStream, scorePrompt, validatePrompts, buildArgs, parseCli, loadPrompts, PREFIX };
if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(e.message); process.exit(2); }
}
