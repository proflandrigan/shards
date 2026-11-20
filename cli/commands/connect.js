'use strict';
// `shards connect` (E6.10, CLI half): report which MCP servers for the in-scope integrations (Atlassian, Google
// Drive/Slides, GitHub) are already registered for Claude Code / Codex, and print the official `mcp add` commands
// for the missing ones. Strictly read-only: it reads the host config files, never writes them, never runs the
// commands, makes no network calls and handles no credentials (the user authenticates in the host, e.g. /mcp).
// The /shards:connect skill (pick cloudId / space / project, backfill) needs live bindings and is not built here.
const fs = require('fs');
const os = require('os');
const path = require('path');

// `match` is tested against a server's name, url, command and args. Commands are the vendors' documented
// registration commands (verified 2026-11 against code.claude.com/docs/en/mcp, Atlassian's Rovo MCP v2 upgrade
// guide and github/github-mcp-server docs/installation-guides); they carry only placeholders or env-var names,
// never credentials. `claude: null` = no CLI command exists (connector UI).
const INTEGRATIONS = [
  {
    id: 'atlassian', label: 'Atlassian (Confluence + Jira)', match: /atlassian|confluence|jira/i,
    claude: 'claude mcp add --transport http atlassian https://mcp.atlassian.com/v2/mcp',
    codex: 'codex mcp add atlassian --url https://mcp.atlassian.com/v2/mcp',
    note: 'OAuth sign-in after adding: Claude Code: /mcp (or `claude mcp login atlassian`); Codex: complete the browser sign-in `codex mcp add` opens (or `codex mcp login atlassian`). Choose the Atlassian site when /shards:connect runs.',
    // Atlassian's v1 endpoints (/v1/sse, /v1/mcp) are deprecated (removal announced for 2027-03-01) in favour of /v2/mcp.
    deprecated: {
      match: /mcp\.atlassian\.com\/v1\b/i,
      message: 'registered against the deprecated Atlassian MCP v1 endpoint (mcp.atlassian.com/v1/...); Atlassian is removing it. Re-register on https://mcp.atlassian.com/v2/mcp and sign in again.',
      claude: (name, scope) => { const sc = scope ? ` -s ${scope}` : ''; return `claude mcp remove${sc} ${name} && claude mcp add${sc} --transport http ${name} https://mcp.atlassian.com/v2/mcp`; },
      codex: (name) => `codex mcp remove ${name} && codex mcp add ${name} --url https://mcp.atlassian.com/v2/mcp`,
    },
  },
  {
    id: 'drive', label: 'Google Drive / Slides', match: /google.?(drive|slides|docs|workspace)|gdrive/i,
    claude: null,
    codex: null,
    note: 'Claude Code: enable the Google Drive connector at claude.ai > Settings > Connectors (it then appears in /mcp). Codex: no official Drive MCP server is known; register one you trust with `codex mcp add <name> ...`.',
  },
  {
    id: 'github', label: 'GitHub', match: /github/i,
    claude: 'claude mcp add --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer YOUR_GITHUB_PAT"',
    codex: 'codex mcp add github --url https://api.githubcopilot.com/mcp/ --bearer-token-env-var GITHUB_PAT_TOKEN',
    note: 'GitHub\'s remote server is set up with a GitHub personal access token in GitHub\'s Claude Code and Codex guides (fine-grained, least privilege). Claude Code: replace YOUR_GITHUB_PAT before running. Codex: export GITHUB_PAT_TOKEN in the environment Codex runs in. Shards never sees or stores the token.',
  },
];
const HOSTS = ['claude', 'codex'];

function usage() {
  return 'Usage: shards connect [--host claude|codex] [--only atlassian,drive,github] [--json] [--root <dir>] [--home <dir>]\n  Checks which MCP servers are registered and prints the official `mcp add` commands for the missing ones. Read-only: nothing is written or run.';
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--host') o.host = val();
    else if (a === '--only') o.only = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--root') o.root = val();
    else if (a === '--home') o.home = val();
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option '${a}'`);
  }
  if (o.host && !HOSTS.includes(o.host)) throw new Error('--host must be claude or codex');
  if (o.only) for (const id of o.only) if (!INTEGRATIONS.some((x) => x.id === id)) throw new Error(`unknown integration '${id}' (atlassian, drive, github)`);
  return o;
}

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
function readJson(p) { const t = readText(p); if (t === null) return null; try { return JSON.parse(t); } catch (_) { return null; } }

const flat = (name, def) => [name, def && def.url, def && def.command, ...(def && Array.isArray(def.args) ? def.args : [])].filter((x) => typeof x === 'string').join(' ');

// -> [{name, file, text}] for Claude Code: project .mcp.json, ~/.claude.json (top level + this project's entry).
function claudeServers(root, home) {
  const out = [];
  // scope = the `claude mcp -s` scope the entry lives in (undefined when not a CLI-managed file).
  const add = (file, map, scope) => { if (map && typeof map === 'object') for (const [n, d] of Object.entries(map)) out.push({ name: n, file, text: flat(n, d), scope }); };
  add(path.join(root, '.mcp.json'), (readJson(path.join(root, '.mcp.json')) || {}).mcpServers, 'project');
  for (const f of [path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json'), path.join(home, '.claude', 'settings.json')]) add(f, (readJson(f) || {}).mcpServers);
  const cj = readJson(path.join(home, '.claude.json')) || {};
  const cjFile = path.join(home, '.claude.json');
  add(cjFile, cj.mcpServers, 'user');
  if (cj.projects && typeof cj.projects === 'object') {
    const hit = Object.entries(cj.projects).find(([p]) => path.resolve(p) === root);
    if (hit) add(cjFile, hit[1] && hit[1].mcpServers, 'local');
  }
  return out;
}

// Codex config.toml: `[mcp_servers.<name>]` tables with url / command / args. Minimal line-based read.
function codexServers(root, codexHome) {
  const out = [];
  for (const file of [path.join(root, '.codex', 'config.toml'), path.join(codexHome, 'config.toml')]) {
    const t = readText(file);
    if (t === null) continue;
    let cur = null;
    for (const line of t.split(/\r?\n/)) {
      const h = /^\s*\[mcp_servers\.("?)([^\]"]+)\1(?:\.[^\]]*)?\]\s*$/.exec(line);
      if (h) { cur = { name: h[2], file, text: h[2] }; if (!/^\s*\[mcp_servers\.[^\]]+\.[^\]]+\]/.test(line)) out.push(cur); continue; }
      if (/^\s*\[/.test(line)) { cur = null; continue; }
      if (cur && /^\s*(url|command|args)\s*=/.test(line)) cur.text += ` ${line}`;
    }
  }
  return out;
}

function check({ root, home, codexHome, host, only }) {
  const servers = { claude: claudeServers(root, home), codex: codexServers(root, codexHome || path.join(home, '.codex')) };
  const hosts = host ? [host] : HOSTS;
  const rows = [];
  for (const integ of INTEGRATIONS) {
    if (only && !only.includes(integ.id)) continue;
    for (const h of hosts) {
      const hits = servers[h].filter((s) => integ.match.test(s.text));
      const dep = integ.deprecated;
      const isDep = (s) => !!(dep && dep.match.test(s.text));
      const hit = hits.find((s) => !isDep(s)) || hits[0];
      const warnings = hits.filter(isDep).map((s) => ({
        code: 'deprecated-endpoint', server: s.name, file: s.file,
        message: `'${s.name}' is ${dep.message}`, command: dep[h](s.name, s.scope),
      }));
      rows.push({
        integration: integ.id, label: integ.label, host: h,
        registered: !!hit, ...(hit ? { server: hit.name, file: hit.file } : { command: integ[h] }),
        note: integ.note,
        ...(warnings.length ? { warnings } : {}),
      });
    }
  }
  return rows;
}

function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards connect: ${e.message}\n\n${usage()}`); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  const root = path.resolve(o.root || process.env.SHARDS_PROJECT_ROOT || process.cwd());
  const home = path.resolve(o.home || process.env.HOME || os.homedir());
  // Codex reads $CODEX_HOME/config.toml (default ~/.codex); an explicit --home pins it to <home>/.codex.
  const codexHome = path.resolve((!o.home && process.env.CODEX_HOME) || path.join(home, '.codex'));
  const rows = check({ root, home, codexHome, host: o.host, only: o.only });
  const missing = rows.filter((r) => !r.registered);
  const warned = rows.filter((r) => r.warnings);
  if (o.json) { console.log(JSON.stringify({ integrations: rows, missing: missing.length, warnings: warned.reduce((n, r) => n + r.warnings.length, 0) }, null, 2)); return 0; }
  for (const r of rows) {
    if (r.registered) {
      console.log(`${r.warnings ? 'WARN    ' : 'OK      '} ${r.host.padEnd(6)} ${r.label}: registered as '${r.server}' (${r.file})`);
      for (const w of r.warnings || []) {
        console.log(`           warning: ${w.message}`);
        console.log(`           run: ${w.command}`);
      }
    } else {
      console.log(`MISSING  ${r.host.padEnd(6)} ${r.label}`);
      if (r.command) console.log(`           run: ${r.command}`);
      console.log(`           ${r.note}`);
    }
  }
  console.log(missing.length
    ? '\nShards prints these commands but never runs them, and never handles credentials. After adding a server, restart the host session, then run /shards:connect (when available) to pick the site, space and project.'
    : `\nAll listed integrations are registered${warned.length ? ', but some need attention (see warnings above)' : ''}. (claude.ai connectors are not visible in config files; they show in /mcp.)`);
  return 0;
}

module.exports = { run, check, INTEGRATIONS };
