'use strict';
// Writes the target layout. Deterministic: sorted, no timestamps. See MACROS.md section 6.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const pkg = require('../package.json');
const relpkg = require('./package');
const { utilitySkills } = require('./skills');
const { CLAUDE_TOOL_PREFIX, CODEX_TOOL_PREFIX, contentPath } = require('./render');
const { codexMcpToml } = relpkg;
const { claudeToolsOf } = require('./host-tools');

const REPO = path.resolve(__dirname, '..');
const DEV_MARKER = '.shards-dev';
const fwd = (p) => p.split(path.sep).join('/');
const fm = (obj) => `---\n${YAML.stringify(obj, { lineWidth: 0 }).trimEnd()}\n---\n`;
const jsonText = (o) => `${JSON.stringify(o, null, 2)}\n`;

function tomlMulti(s) { return `"""\n${s.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}\n"""`; }
function tomlStr(s) { return JSON.stringify(String(s)); }

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

// E8.6 delegation limits. Codex 0.169.0 accepts agents.max_depth, agents.max_threads and
// agents.max_concurrent_threads_per_session (docs/compat.md CX-4); left commented so merging into a config.toml
// that already has an [agents] table cannot create a duplicate table.
const AGENTS_GUIDANCE = `# Delegation limits (E8.6; keys accepted by Codex 0.169.0, docs/compat.md CX-4). Uncomment, or merge into your [agents] table:
#   agents.max_depth: consult from a specialist (specialist -> Syn or reviewer) needs depth 2; the default may be 1.
#   agents.max_threads (alias of agents.max_concurrent_threads_per_session, >= 1): fan-out width; 4 is a safe recommendation.
# [agents]
# max_depth = 2
# max_threads = 4
`;

// .codex/config.toml. Release: guidance only (the MCP entry needs the installed plugin's absolute path, so
// `shards install --codex` writes it). Dev: also the MCP entry pointing at this repo's runtime.
// E5.7 opt-in: Codex 0.169 rejects a top-level `profile = ...` ("legacy profile config is no longer supported"),
// so the default-agent opt-in is a comment naming the `codex -p shards-syn` command.
function codexConfig(optIn, mcp) {
  let t = '# Shards for Codex. Per-agent profiles are the files shards-<agent>.config.toml (Codex profiles v2);\n# `shards install --codex` copies them to $CODEX_HOME. Usage: codex -p shards-<agent>\n';
  if (optIn) t += '# Default agent: start sessions with `codex -p shards-syn` (Codex has no config key for a default profile).\n';
  t += `\n${AGENTS_GUIDANCE}\n`;
  if (mcp) t += mcp;
  else t += '# MCP server: run `shards install --codex` (writes [mcp_servers.shards] into $CODEX_HOME/config.toml with\n# the absolute path of the installed plugin\'s runtime/server.js). A plugin .mcp.json is not used (docs/compat.md CX-7).\n';
  return t;
}

// A previous Shards build: the dev marker, or size-report.json next to a plugin manifest named shards.
function isShardsBuild(dir) {
  if (fs.existsSync(path.join(dir, DEV_MARKER))) return true;
  if (!fs.existsSync(path.join(dir, 'size-report.json'))) return false;
  for (const m of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
    try { if (JSON.parse(fs.readFileSync(path.join(dir, m), 'utf8')).name === 'shards') return true; } catch (_) { /* absent */ }
  }
  return false;
}

// Remove stale output (old agents/skills, a dev marker in a release dir, ...) before emitting, but only when the dir
// is recognisably a previous Shards build; any other non-empty dir is written over without deleting anything.
function cleanOutDir(dir) {
  let ents;
  try { ents = fs.readdirSync(dir); } catch (_) { return; }
  if (!ents.length || !isShardsBuild(dir)) return;
  for (const e of ents) if (e !== '.git') fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}

function emitTarget({ target, core, rendered, agentBodies, report, dev, outDir, defaultAgent, bundleDeps = true }) {
  const optIn = defaultAgent === true || (defaultAgent === undefined && process.env.SHARDS_BUILD_DEFAULT_AGENT === '1');
  const out = new Map();
  for (const [rel, data] of rendered) out.set(rel, data);
  out.set('size-report.json', jsonText(report));
  const profiles = [];

  for (const [id, a] of [...core.agents].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const description = a.doc.description;
    if (switchable(a)) {
      out.set(`skills/${id}/SKILL.md`, fm({ name: id, description }) + '\n' + skillBody(a, target));
      if (target === 'codex') profiles.push(id);
    }
    if (!consultable(a) || (target !== 'claude' && target !== 'codex')) continue;
    const tools = claudeToolsOf(a.doc); // host-neutral capabilities -> Claude tool names (build/host-tools.js)
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
      out.set('.codex-plugin/plugin.json', jsonText({ name: 'shards', version: pkg.version, description: pkg.description, skills: './skills/' }));
      codexMcp = codexMcpToml(runtime);
      // Codex discovers plugin hooks at <plugin>/hooks/hooks.json (verified 0.169.0). Dev: absolute repo hooks dir.
      out.set('hooks/hooks.json', relpkg.codexHooksJson(hooksDir));
    }
  }
  // Release packaging (codex, E8.1-E8.3): manifest, hooks; MCP entry via `shards install --codex`; runtime copied below.
  if (!dev && target === 'codex') {
    out.set('.codex-plugin/plugin.json', jsonText(relpkg.codexPluginManifest()));
    out.set('README.md', relpkg.codexReleaseReadme());
    out.set('hooks/hooks.json', relpkg.codexHooksJson());
  }
  // E9.2: generic Agent Skills package. skills/<name>/SKILL.md (Agent Skills format) plus Agent Plugins 1.0
  // plugin.json / mcp.json. The schemas are UNVERIFIED against a live host (docs/compat.md); the MCP entry uses
  // the published runtime package so the output needs no bundled runtime.
  if (target === 'skills') {
    out.set('plugin.json', jsonText(relpkg.agentPluginManifest()));
    out.set('mcp.json', jsonText(relpkg.agentPluginMcp()));
  }
  if (target === 'codex') {
    out.set('.codex/config.toml', codexConfig(optIn, codexMcp));
    for (const id of profiles) out.set(`.codex/shards-${id}.config.toml`, relpkg.codexProfileToml(id, CODEX_TOOL_PREFIX));
  }
  // Release packaging (claude): E7.1 manifest, E7.4 MCP entry, E7.5 hooks verbatim; runtime copied after the write loop.
  const release = !dev && (target === 'claude' || target === 'codex');
  if (release && target === 'claude') {
    out.set('.claude-plugin/plugin.json', jsonText(relpkg.pluginManifest()));
    out.set('.mcp.json', jsonText(relpkg.releaseMcp()));
    out.set('README.md', relpkg.releaseReadme());
    out.set('hooks/hooks.json', fs.readFileSync(path.join(REPO, 'hooks', 'claude-code.hooks.json'), 'utf8'));
  }

  cleanOutDir(outDir);
  if (!dev) fs.rmSync(path.join(outDir, DEV_MARKER), { force: true }); // a release dir must never look like a dev build
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

module.exports = { emitTarget, isShardsBuild, DEV_MARKER, REPO };
