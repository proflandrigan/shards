'use strict';
// Writes the target layout. Deterministic: sorted, no timestamps. See MACROS.md section 6.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const pkg = require('../package.json');
const relpkg = require('./package');
const { utilitySkills } = require('./skills');
const { CLAUDE_TOOL_PREFIX, CODEX_TOOL_PREFIX, contentPath } = require('./render');

const REPO = path.resolve(__dirname, '..');
const DEV_MARKER = '.shards-dev';
const fwd = (p) => p.split(path.sep).join('/');
const fm = (obj) => `---\n${YAML.stringify(obj, { lineWidth: 0 }).trimEnd()}\n---\n`;
const jsonText = (o) => `${JSON.stringify(o, null, 2)}\n`;

function tomlMulti(s) { return `"""\n${s.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}\n"""`; }
function tomlStr(s) { return JSON.stringify(String(s)); }

const DEFAULT_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'];
function toolsOf(meta) {
  const t = meta && meta.tools;
  const list = Array.isArray(t) ? t : String(t || '').split(',').map((x) => x.trim()).filter(Boolean);
  const kept = list.filter((x) => x !== 'Task' && x !== 'Agent'); // consults cannot nest
  return kept.length ? kept : (list.length ? kept : DEFAULT_TOOLS.slice());
}

const prefixOf = (target) => (target === 'claude' ? CLAUDE_TOOL_PREFIX : target === 'codex' ? CODEX_TOOL_PREFIX : '');
const switchable = (a) => ((a.doc && a.doc.activation) || []).includes('switch');
const consultable = (a) => ((a.doc && a.doc.activation) || []).includes('consult');

// E5.2: thin switch skill. No persona text here; the persona is loaded from content/ after activate.
function skillBody(a, target) {
  const pre = prefixOf(target);
  const file = contentPath(target, `agents/${a.id}/AGENT.md`);
  const name = a.doc.display_name || a.id;
  return `# ${name}\n\nSwitch this session to \`${a.id}\`:\n\n1. Call \`${pre}activate\`(agent="${a.id}", mode="switch"). Adopt the returned \`persona_summary\` right away.\n2. Read the full persona from ${file} and follow it.\n3. Load each phase with \`${pre}load_phase\`(agent="${a.id}", n, track?) when the persona tells you to.\n4. When the work is done, leave with \`${pre}return\`. You stay \`${a.id}\` until then.\n`;
}

function readSummary(a) {
  try { return fs.readFileSync(path.join(a.dir, 'persona-summary.md'), 'utf8').trim(); } catch (_) { return ''; }
}

// E5.3: one subagent prompt per consult entry (plus a general one).
function entryPrompt(a, entry, rendered) {
  const summary = readSummary(a) || a.doc.description;
  const file = a.doc.consult_entries[entry];
  const parts = [summary];
  const body = rendered.get(`content/agents/${a.id}/${file}`);
  if (body) parts.push(String(body).trim());
  if (entry === 'worker') {
    const wc = rendered.get('content/protocols/worker_contract.md');
    if (wc) parts.push(String(wc).trim());
  }
  return `${parts.join('\n\n---\n\n')}\n`;
}

function generalPrompt(a, target, defaultAgent) {
  const summary = readSummary(a) || a.doc.description;
  const entries = Object.entries(a.doc.consult_entries || {}).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const list = entries.map(([k, f]) => `- ${k}: ${contentPath(target, `agents/${a.id}/${f}`)}`).join('\n');
  const pre = prefixOf(target);
  let t = `${summary}\n\n---\n\nConsult entries (read the one the caller names before answering):\n${list || '- (none)'}\n`;
  if (defaultAgent) t += `\nMain-thread use: call \`${pre}activate\`(agent="${a.id}", mode="switch") first, adopt the returned persona_summary, then read ${contentPath(target, `agents/${a.id}/AGENT.md`)} and follow it.\n`;
  return t;
}

// E8.7(b)/E5.7: per-agent profiles. UNVERIFIED (docs/compat.md): Codex profile table shape and `profile` key are docs-only.
function codexConfig(profiles, optIn, mcp) {
  const pre = CODEX_TOOL_PREFIX;
  let t = '# UNVERIFIED (docs-only): [profiles.*] and developer_instructions are not confirmed against a real Codex CLI.\n# Usage: codex --profile shards-<agent>\n';
  if (optIn) t += 'profile = "shards-syn"\n';
  t += '\n';
  for (const id of profiles) {
    const di = `You are the Shards agent ${id}. Before anything else call \`${pre}activate\`(agent="${id}", mode="switch"), adopt the returned persona_summary, then read content/agents/${id}/AGENT.md and follow it. Load phases with \`${pre}load_phase\`; leave with \`${pre}return\`.`;
    t += `[profiles.shards-${id}]\ndeveloper_instructions = ${tomlStr(di)}\n\n`;
  }
  return t + mcp;
}

function emitTarget({ target, core, rendered, agentBodies, report, dev, outDir, defaultAgent, bundleDeps = true }) {
  const optIn = defaultAgent === true || (defaultAgent === undefined && process.env.SHARDS_BUILD_DEFAULT_AGENT === '1');
  const out = new Map();
  for (const [rel, data] of rendered) out.set(rel, data);
  out.set('size-report.json', jsonText(report));
  const profiles = [];

  for (const [id, a] of [...core.agents].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const res = agentBodies.get(id) || { meta: null, body: '' };
    const description = a.doc.description;
    if (switchable(a)) {
      out.set(`skills/${id}/SKILL.md`, fm({ name: id, description }) + '\n' + skillBody(a, target));
      if (target === 'codex') profiles.push(id);
    }
    if (!consultable(a) || (target !== 'claude' && target !== 'codex')) continue;
    const tools = toolsOf(res.meta);
    const subs = [{ name: id, description, prompt: generalPrompt(a, target, optIn && id === 'syn'), main: id === 'syn' }];
    for (const entry of Object.keys(a.doc.consult_entries || {}).sort()) {
      subs.push({ name: `${id}-${entry}`, description: `${description} (consult entry: ${entry})`, prompt: entryPrompt(a, entry, rendered) });
    }
    for (const s of subs) {
      if (target === 'claude') {
        const head = { name: s.name, description: s.description };
        if (!(s.main && optIn) && tools.length) head.tools = tools.join(', ');
        out.set(`agents/${s.name}.md`, `${fm(head)}\n${s.prompt}`);
      } else {
        out.set(`.codex/agents/${s.name}.toml`, `name = ${tomlStr(s.name)}\ndescription = ${tomlStr(s.description)}\ndeveloper_instructions = ${tomlMulti(s.prompt)}\n`);
      }
    }
  }
  if (target === 'claude' && optIn) out.set('settings.json', jsonText({ agent: 'shards:syn' })); // UNVERIFIED (compat CC-3)

  for (const [p, t] of utilitySkills(target)) out.set(p, t);

  let codexMcp = '';
  if (dev) {
    out.set(DEV_MARKER, 'generated by `shards build --dev`; removed by `shards uninstall-dev`\n');
    const hooksDir = fwd(path.join(REPO, 'hooks'));
    const runtime = fwd(path.join(REPO, 'runtime', 'server.js'));
    if (target === 'claude') {
      out.set('.claude-plugin/plugin.json', jsonText({ name: 'shards', version: pkg.version, description: pkg.description }));
      // Project root comes from the host env (verified: plugin MCP env expands ${CLAUDE_PROJECT_DIR}); runtime reads SHARDS_PROJECT_ROOT.
      out.set('.mcp.json', jsonText({ mcpServers: { shards: { command: 'node', args: [runtime], env: { SHARDS_PROJECT_ROOT: '${CLAUDE_PROJECT_DIR}' } } } }));
      // Dev: hook commands point at the repo's own hooks dir so edits apply without a rebuild.
      const hooks = fs.readFileSync(path.join(REPO, 'hooks', 'claude-code.hooks.json'), 'utf8').split('${CLAUDE_PLUGIN_ROOT}/hooks/').join(`${hooksDir}/`);
      out.set('hooks/hooks.json', hooks);
    } else if (target === 'codex') {
      out.set('.codex-plugin/plugin.json', jsonText({ name: 'shards', version: pkg.version, description: pkg.description, skills: './skills/' })); // docs-only, UNVERIFIED
      // E8.3: per-tool approval_mode (Codex docs-only, UNVERIFIED: compat CX-1).
      const approvals = ['gate_advance', 'gate_force_close'].map((t) => `[mcp_servers.shards.tools.${t}]\napproval_mode = "prompt"\n`).join('\n');
      codexMcp = `[mcp_servers.shards]\ncommand = "node"\nargs = [${tomlStr(runtime)}]\n\n# Per-tool approval_mode below is docs-only / UNVERIFIED (docs/compat.md CX-1).\n${approvals}\n`;
      out.set('.codex/hooks.json', fs.readFileSync(path.join(REPO, 'hooks', 'codex.hooks.json'), 'utf8').split('{{SHARDS_HOOKS_DIR}}').join(hooksDir));
    }
  }
  if (target === 'codex') out.set('.codex/config.toml', codexConfig(profiles, optIn, codexMcp));
  // Release packaging (claude): E7.1 manifest, E7.4 MCP entry, E7.5 hooks verbatim; runtime copied after the write loop.
  // Codex release packaging stays TODO(E8.3).
  const release = !dev && target === 'claude';
  if (release) {
    out.set('.claude-plugin/plugin.json', jsonText(relpkg.pluginManifest()));
    out.set('.mcp.json', jsonText(relpkg.releaseMcp()));
    out.set('README.md', relpkg.releaseReadme());
    out.set('hooks/hooks.json', fs.readFileSync(path.join(REPO, 'hooks', 'claude-code.hooks.json'), 'utf8'));
  }

  const written = [];
  for (const rel of [...out.keys()].sort()) {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, out.get(rel));
    written.push(rel);
  }
  if (release) relpkg.copyRuntime(outDir, { bundleDeps });
  return written;
}

module.exports = { emitTarget, DEV_MARKER, REPO };
