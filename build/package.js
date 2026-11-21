'use strict';
// Release packaging helpers (E7.1/E7.4/E7.5/E7.6). Deterministic: sorted, no timestamps.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const pkg = require('../package.json');

const REPOSITORY = 'https://github.com/proflandrigan/shards';
const KEYWORDS = ['claude-code', 'agents', 'data-science', 'data-engineering', 'workflows', 'machine-learning'];
// E10.4: square 512px plugin icon (from shards_icon.png), emitted at ICON_PATH inside each release package.
const ICON_PATH = './assets/icon.png';
const ICON_SRC = path.join(REPO, 'build', 'assets', 'icon.png');
const jsonText = (o) => `${JSON.stringify(o, null, 2)}\n`;

// E7.1: release plugin manifest (only fields the Claude plugin manifest accepts).
function pluginManifest() {
  return {
    name: 'shards',
    version: pkg.version,
    description: pkg.description,
    author: { name: 'proflandrigan' },
    license: pkg.license,
    repository: REPOSITORY,
    homepage: REPOSITORY,
    keywords: KEYWORDS.slice(),
    icon: ICON_PATH,
  };
}

// E7.4: release MCP entry; the plugin is self-contained so the server lives under ${CLAUDE_PLUGIN_ROOT}.
function releaseMcp() {
  return { mcpServers: { shards: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/runtime/server.js'], env: { SHARDS_PROJECT_ROOT: '${CLAUDE_PROJECT_DIR}' } } } };
}

// E8.1: Codex release manifest (live-checked on Codex 0.169.0, docs/compat.md CX-7). No mcpServers entry: a plugin
// .mcp.json server runs from the plugin cache dir with a scrubbed env, so its state would land in
// <plugin cache>/.shards while the hooks write <project>/.shards (split brain: gates invisible to PreToolUse). The
// MCP server is registered in config.toml by `shards install --codex` instead (codexMcpToml below).
function codexPluginManifest() {
  return Object.assign(pluginManifest(), { skills: './skills/' });
}

// Codex hook commands: Codex discovers plugin hooks at <plugin>/hooks/hooks.json and expands ${PLUGIN_ROOT} there
// (verified). `--host codex` is the explicit host marker hooks/lib/host.js honours first.
const CODEX_HOOKS_ROOT = '${PLUGIN_ROOT}/hooks';
function codexHooksJson(hooksDir = CODEX_HOOKS_ROOT) {
  return fs.readFileSync(path.join(REPO, 'hooks', 'codex.hooks.json'), 'utf8').split('{{SHARDS_HOOKS_DIR}}').join(hooksDir);
}

// Gate tools that must reach the human through Codex's own approval prompt (approval_mode = "prompt"). Same set
// `shards doctor` checks (cli/commands/doctor.js GATE_TOOLS). Every other shards tool is "approve": the tools carry
// no readOnlyHint, so without a default every call needs approval and all of them fail under `codex exec`.
const CODEX_PROMPT_TOOLS = ['gate_advance', 'gate_force_close', 'gate_confirm', 'gate_suspend'];
const tomlStr = (s) => JSON.stringify(String(s));

// E8.3: config.toml MCP entry (live-verified keys on Codex 0.169.0, CX-1). `--host codex` and SHARDS_HOST mark the
// host for runtime/session/correlate.js (the server env is scrubbed, so env sniffing cannot see Codex).
function codexMcpToml(serverPath) {
  const tools = CODEX_PROMPT_TOOLS.map((t) => `[mcp_servers.shards.tools.${t}]\napproval_mode = "prompt"\n`).join('\n');
  return `[mcp_servers.shards]\ncommand = "node"\nargs = [${tomlStr(serverPath)}, "--host", "codex"]\nenv = { SHARDS_HOST = "codex" }\ndefault_tools_approval_mode = "approve"\n\n${tools}`;
}

// Profiles v2 (Codex 0.169: `[profiles.<n>] developer_instructions` is rejected; a profile is the file
// $CODEX_HOME/<name>.config.toml, used with `codex -p <name>`). PROFILE_MARK lets the installer recognise its files.
const CODEX_PROFILE_MARK = '# shards:generated codex profile v1';
function codexProfileToml(id, prefix) {
  const di = `You are the Shards agent ${id}. Before anything else call \`${prefix}activate\`(agent="${id}", mode="switch"), adopt the returned persona_summary, then read content/agents/${id}/AGENT.md and follow it. Load phases with \`${prefix}load_phase\`; leave with \`${prefix}return\`.`;
  return `${CODEX_PROFILE_MARK} (shards install --codex copies it to $CODEX_HOME; use: codex -p shards-${id})\ndeveloper_instructions = ${tomlStr(di)}\n`;
}

// Local Codex marketplace (`shards build --target codex --marketplace`): <out>/.agents/plugins/marketplace.json with
// the plugin at <out>/plugins/shards. Shape verified with `codex plugin marketplace add` on Codex 0.169.0.
const CODEX_MARKETPLACE = 'shards-local';
function codexMarketplaceManifest() {
  return {
    name: CODEX_MARKETPLACE,
    interface: { displayName: 'Shards (local)' },
    plugins: [{ name: 'shards', source: { source: 'local', path: './plugins/shards' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }],
  };
}

function codexReleaseReadme() {
  return `# Shards (Codex)

${pkg.description}.

Checked against Codex CLI 0.169.0 (docs/compat.md CX-1 to CX-7). Requires Node.js 18 or newer.

Install:
1. \`codex plugin marketplace add <dir>\` where <dir> holds \`.agents/plugins/marketplace.json\` listing this plugin (\`shards build --target codex --marketplace\` writes one), then \`codex plugin add shards@${CODEX_MARKETPLACE}\`.
2. Register the MCP server: \`shards install --codex\` (writes \`[mcp_servers.shards]\` into $CODEX_HOME/config.toml pointing at this plugin's runtime/server.js, plus the \`shards-<agent>\` profile files). Rerun it after a plugin upgrade; \`--remove\` undoes it.
3. Trust the hooks: Codex skips untrusted plugin hooks silently. Approve them when Codex asks (or set \`[hooks.state."<key>"] trusted_hash\` in config.toml).

Contents: \`.codex-plugin/plugin.json\` (skills ./skills/), \`hooks/hooks.json\` (hook shims, \`node "\${PLUGIN_ROOT}/hooks/<shim>.js" --host codex\`), \`.codex/config.toml\` (agents.max_depth/max_threads guidance), \`.codex/shards-<agent>.config.toml\` (profiles), \`.codex/agents/*.toml\` (consult subagents), \`runtime/\` (the MCP server). Optional: \`shards install --agents-md\` adds the Shards section to AGENTS.md. Source and docs: ${REPOSITORY}
`;
}

// E9.2: Agent Plugins 1.0 manifest for the generic `skills` target (UNVERIFIED schema; docs-only).
function agentPluginManifest() {
  return {
    name: 'shards',
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    repository: REPOSITORY,
    keywords: KEYWORDS.slice(),
    skills: './skills/',
    mcp: './mcp.json',
  };
}

// E9.2: generic MCP entry. No host env var is assumed; the runtime defaults to the working directory.
function agentPluginMcp() {
  return { mcpServers: { shards: { command: 'npx', args: ['-y', '@proflandrigan/shards-mcp@next'] } } };
}

function releaseReadme() {
  return `# Shards

${pkg.description}.

A suite of data-focused agents (Syn the orchestrator plus data analyst, data scientist, ML engineer, AI engineer, data engineer, data modeller, analytics engineer and more) delivered as a Claude Code plugin. Skills (\`/shards:syn\`, \`/shards:agents\`, ...) switch the session to an agent, consult subagents give reviews, and a bundled MCP server (\`shards\`) provides gates, sessions and phase loading. Hooks record gate state under \`.shards/state/\` in your project.

Setup: requires Node.js 18 or newer on PATH. The plugin is self-contained (the runtime and its dependencies are bundled), so no install step is needed. Source and docs: ${REPOSITORY}

Install: \`/plugin marketplace add proflandrigan/shards\` then \`/plugin install shards@shards\`.
`;
}

// E10.3: the single source of generated release package.json files. Both derive from the root manifest
// (version, license, author, dependencies, engines) so they cannot drift.
//   'plugin': private manifest inside the Claude/Codex release plugin (dependencies only).
//   'mcp':    the publishable @proflandrigan/shards-mcp package staged by scripts/stage-runtime-package.js.
const MCP_FILES = ['runtime/', 'core/', 'bindings/', 'hooks/lib/', 'build/', 'scripts/validate-agents.js'];
function releasePackageJson(kind) {
  if (kind === 'plugin') return { name: 'shards', version: pkg.version, private: true, dependencies: pkg.dependencies };
  if (kind === 'mcp') {
    return {
      name: '@proflandrigan/shards-mcp',
      version: pkg.version,
      description: 'Shards MCP runtime (gates, sessions, agent loading) for Claude Code and Codex',
      license: pkg.license,
      author: pkg.author,
      bin: { 'shards-mcp': 'runtime/server.js' },
      files: MCP_FILES.slice(),
      dependencies: pkg.dependencies,
      engines: pkg.engines,
      publishConfig: { access: 'public', tag: pkg.publishConfig && pkg.publishConfig.tag },
    };
  }
  throw new Error(`unknown release package kind '${kind}'`);
}

// Locate a package directory the way node would, starting from the requiring package's dir.
function resolvePkgDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const cand = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Bundle destination for a package dir found by resolvePkgDir from `root`: node_modules/<path below the deepest
// node_modules whose parent is root or one of its ancestors>. In a repo checkout that is just the path relative to
// root; in an npm install (root = <proj>/node_modules/@proflandrigan/shards) hoisted deps live at <proj>/node_modules/x
// and must land at node_modules/x, not ../../x. Nested node_modules (version conflicts) are kept as they are. A dir
// outside root's lookup chain (symlinked node_modules, reached via a dependency's real path) maps from its first
// node_modules; depClosure rejects two packages mapping to the same destination.
function bundleRel(root, dir) {
  const r = path.resolve(root);
  const isAncestorOrSelf = (b) => b === r || r.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
  const segs = path.resolve(dir).split(path.sep);
  let best = -1; let first = -1;
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i] !== 'node_modules') continue;
    if (first < 0) first = i;
    const base = segs.slice(0, i).join(path.sep) || path.sep;
    if (isAncestorOrSelf(base)) best = i;
  }
  if (best < 0) best = first;
  if (best < 0) throw new Error(`dependency ${dir} is not under a node_modules directory visible from ${root}`);
  return path.join('node_modules', ...segs.slice(best + 1));
}

// Production dependency closure from package.json `dependencies` (no network). Sorted [{ name, dir, rel }];
// dir is the real directory, rel its bundle destination inside the package (always node_modules/..., see bundleRel).
function depClosure(root = REPO) {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const realRoot = fs.realpathSync(root); // transitive deps are resolved from real dirs
  const seen = new Map();
  const missing = [];
  const walk = (name, fromDir, optional) => {
    const dir = resolvePkgDir(name, fromDir);
    if (!dir) { if (!optional) missing.push(name); return; }
    const real = fs.realpathSync(dir);
    if (seen.has(real)) return;
    seen.set(real, { name, dir: real, rel: bundleRel(realRoot, fs.realpathSync(path.dirname(dir)) + path.sep + path.basename(dir)) });
    const p = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
    for (const d of Object.keys(p.dependencies || {})) walk(d, real, false);
    for (const d of Object.keys(p.optionalDependencies || {})) walk(d, real, true);
  };
  for (const d of Object.keys(rootPkg.dependencies || {})) walk(d, root, false);
  if (missing.length) throw new Error(`missing production dependencies in node_modules: ${[...new Set(missing)].sort().join(', ')}`);
  const byRel = new Map();
  for (const d of seen.values()) {
    const prev = byRel.get(d.rel);
    if (prev) throw new Error(`cannot bundle dependencies: ${prev.dir} and ${d.dir} both map to ${d.rel} (conflicting versions outside the package); run npm install inside the package or use --no-bundle-deps`);
    byRel.set(d.rel, d);
  }
  return [...seen.values()].sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

// Copies the self-contained runtime tree into out. Layout mirrors the repo so relative requires resolve.
function copyRuntime(out, { bundleDeps = true, depRoot = REPO } = {}) {
  for (const d of ['runtime', 'core', 'bindings', 'build']) fs.cpSync(path.join(REPO, d), path.join(out, d), { recursive: true });
  fs.mkdirSync(path.join(out, 'hooks'), { recursive: true });
  fs.cpSync(path.join(REPO, 'hooks', 'lib'), path.join(out, 'hooks', 'lib'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'hooks')).filter((x) => x.endsWith('.js')).sort()) {
    fs.copyFileSync(path.join(REPO, 'hooks', f), path.join(out, 'hooks', f));
  }
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.copyFileSync(ICON_SRC, path.join(out, ICON_PATH));
  fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'scripts', 'validate-agents.js'), path.join(out, 'scripts', 'validate-agents.js'));
  fs.writeFileSync(path.join(out, 'package.json'), jsonText(releasePackageJson('plugin')));
  if (bundleDeps) {
    const nm = path.resolve(out, 'node_modules') + path.sep;
    for (const { dir, rel } of depClosure(depRoot)) {
      const dest = path.resolve(out, rel);
      if (!dest.startsWith(nm)) throw new Error(`refusing to bundle ${dir} outside ${nm}: ${dest}`);
      fs.cpSync(dir, dest, { recursive: true, dereference: true });
    }
  }
}

// E7.6/E10.4: marketplace manifest. Two variants of the plugin `source`:
//   published (default; the committed repo-root .claude-plugin/marketplace.json): the generated plugin lives at the
//     root of the `marketplace` branch (pushed by .github/workflows/release.yml, see docs/adr/0012), so
//     `/plugin marketplace add proflandrigan/shards` resolves it from the default branch via a github source + ref.
//   local (`shards build --marketplace --out <root>`): relative `./plugins/shards`, for offline `claude plugin validate`.
const MARKETPLACE_BRANCH = 'marketplace';
function marketplaceManifest({ local = false } = {}) {
  const source = local ? './plugins/shards' : { source: 'github', repo: 'proflandrigan/shards', ref: MARKETPLACE_BRANCH };
  return {
    name: 'shards',
    owner: { name: 'proflandrigan' },
    description: pkg.description,
    plugins: [{
      name: 'shards',
      source,
      description: pkg.description,
      version: pkg.version,
      category: 'productivity',
      keywords: KEYWORDS.slice(),
    }],
  };
}
const marketplaceText = (opts) => jsonText(marketplaceManifest(opts));

module.exports = { bundleRel, MARKETPLACE_BRANCH, releasePackageJson, MCP_FILES, ICON_PATH, ICON_SRC, codexPluginManifest, codexReleaseReadme, codexHooksJson, CODEX_HOOKS_ROOT, codexMcpToml, CODEX_PROMPT_TOOLS, codexProfileToml, CODEX_PROFILE_MARK, codexMarketplaceManifest, CODEX_MARKETPLACE, agentPluginManifest, agentPluginMcp, releaseReadme, pluginManifest, releaseMcp, depClosure, copyRuntime, marketplaceManifest, marketplaceText, REPOSITORY };
