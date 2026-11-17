'use strict';
// `shards install --permissions | --claude-md` (E7.8 / E7.9): opt-in, removable project config.
//   --permissions  merge build/assets/permissions.preset.json into <root>/.claude/settings.json.
//                  Rules actually ADDED are recorded in the sidecar <root>/.claude/.shards-permissions.json
//                  (a sidecar rather than a marker key inside settings.json: Claude Code validates
//                  settings.json and unknown top-level keys are not guaranteed to be tolerated).
//   --claude-md    insert/replace a marker-delimited conventions block in <root>/CLAUDE.md.
//   --agents-md    (E8.5) same for the Codex fragment in <root>/AGENTS.md (build/assets/agents-md.md).
// All support --remove (exact unmerge) and --dry-run (writes nothing).
const fs = require('fs');
const path = require('path');
const { ruleCoversGateTools } = require('./doctor');
const { conventionsBody } = require('../../build/conventions');

const AGENTS_ASSET = path.join(__dirname, '..', '..', 'build', 'assets', 'agents-md.md');

const PRESET_FILE = path.join(__dirname, '..', '..', 'build', 'assets', 'permissions.preset.json');
const SIDECAR = '.shards-permissions.json';
const KINDS = ['allow', 'deny', 'ask'];
const BEGIN = '<!-- shards:begin conventions v1 -->';
const END = '<!-- shards:end conventions -->';
const BLOCK_RE = /<!-- shards:begin conventions[^>]*-->[\s\S]*?<!-- shards:end conventions -->\n?/;
const AGENTS_BEGIN = '<!-- shards:begin agents-md v1 -->';
const AGENTS_END = '<!-- shards:end agents-md -->';
const AGENTS_BLOCK_RE = /<!-- shards:begin agents-md[^>]*-->[\s\S]*?<!-- shards:end agents-md -->\n?/;

function usage() {
  return [
    'Usage: shards install (--project | --permissions | --claude-md | --agents-md) [--root <dir>] [--remove] [--dry-run] [--force]',
    '  --project      copy the generated skills into <root>/.claude/skills and <root>/.agents/skills (content under .shards/content); manifest-tracked',
    '  --permissions  merge the narrow permission preset into <root>/.claude/settings.json (never allows gate tools)',
    '  --claude-md    insert the Shards tool-call conventions block into <root>/CLAUDE.md (marker-delimited)',
    '  --agents-md    insert the Shards Codex fragment into <root>/AGENTS.md (marker-delimited)',
    '  --remove       exact unmerge: remove only what this command added',
    '  --dry-run      print what would change; write nothing',
    '  --force        allow running inside the shards source repo',
    '  --preset <f>   use another preset JSON file (testing)',
  ].join('\n');
}

function parse(argv) {
  const o = { project: false, permissions: false, claudeMd: false, agentsMd: false, remove: false, dryRun: false, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--project') o.project = true;
    else if (a === '--permissions') o.permissions = true;
    else if (a === '--claude-md') o.claudeMd = true;
    else if (a === '--agents-md') o.agentsMd = true;
    else if (a === '--remove') o.remove = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else if (a === '--root') o.root = val();
    else if (a === '--preset') o.preset = val();
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option '${a}'`);
  }
  if (!o.help && !o.project && !o.permissions && !o.claudeMd && !o.agentsMd) throw new Error('one of --project, --permissions, --claude-md or --agents-md is required');
  return o;
}

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
function isSourceRepo(root) {
  return fs.existsSync(path.join(root, 'core', 'agents')) && fs.existsSync(path.join(root, 'cli', 'shards.js'));
}
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

// `Bash(cmd:*)`, `Bash(cmd *)` and `Bash(cmd*)` match the same set; compare in canonical form.
function canon(p) {
  if (typeof p !== 'string' || !/^Bash\(/.test(p)) return p;
  return p.replace(/(?:\s*:\*|(?<!\*)\s*\*)\)\s*$/, ')');
}

function loadPreset(file) {
  const j = JSON.parse(fs.readFileSync(file || PRESET_FILE, 'utf8'));
  const out = {};
  for (const k of KINDS) out[k] = Array.isArray(j[k]) ? j[k].filter((x) => typeof x === 'string') : [];
  return out;
}

function readSettings(file) {
  const t = readText(file);
  if (t === null) return { settings: null, text: null };
  let settings;
  try { settings = JSON.parse(t); } catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${file} is not a JSON object`);
  return { settings, text: t };
}

// ---- permissions ----
function mergePermissions(root, fragment, opts = {}) {
  const bad = (fragment.allow || []).filter(ruleCoversGateTools);
  if (bad.length) throw new Error(`refusing to merge: allow rule(s) cover gate tools: ${bad.join(', ')}`);
  const sFile = path.join(root, '.claude', 'settings.json');
  const sidecar = path.join(root, '.claude', SIDECAR);
  const { settings: existing } = readSettings(sFile);
  const created = [];
  const settings = existing || {};
  if (!existing) created.push('file');
  if (!settings.permissions || typeof settings.permissions !== 'object') {
    if (settings.permissions === undefined) created.push('permissions');
    else throw new Error(`${sFile}: "permissions" is not an object`);
    settings.permissions = {};
  }
  const added = { allow: [], deny: [], ask: [] };
  for (const k of KINDS) {
    const rules = fragment[k] || [];
    if (!rules.length) continue;
    if (settings.permissions[k] === undefined) { settings.permissions[k] = []; created.push(k); }
    else if (!Array.isArray(settings.permissions[k])) throw new Error(`${sFile}: permissions.${k} is not an array`);
    const have = new Set(settings.permissions[k].map(canon));
    for (const r of rules) {
      if (have.has(canon(r))) continue;
      have.add(canon(r));
      settings.permissions[k].push(r);
      added[k].push(r);
    }
  }
  const total = KINDS.reduce((n, k) => n + added[k].length, 0);
  if (total === 0 && !created.length) return { changed: false, added, settingsFile: sFile };
  if (!opts.dryRun) {
    // Settings first, then the record. A crash in between leaves rules without a record (not removable by us), never the reverse.
    let prev = { added: { allow: [], deny: [], ask: [] }, created: [] };
    const pt = readText(sidecar);
    if (pt) { try { prev = JSON.parse(pt); } catch (_) { /* overwrite corrupt record */ } }
    const rec = { version: 1, added: {}, created: [...new Set([...(prev.created || []), ...created])] };
    for (const k of KINDS) rec.added[k] = [...(prev.added && prev.added[k] || []), ...added[k]];
    writeAtomic(sFile, JSON.stringify(settings, null, 2) + '\n');
    writeAtomic(sidecar, JSON.stringify(rec, null, 2) + '\n');
  }
  return { changed: true, added, settingsFile: sFile };
}

function removePermissions(root, opts = {}) {
  const sFile = path.join(root, '.claude', 'settings.json');
  const sidecar = path.join(root, '.claude', SIDECAR);
  const st = readText(sidecar);
  if (st === null) return { changed: false, removed: { allow: [], deny: [], ask: [] }, settingsFile: sFile };
  let rec;
  try { rec = JSON.parse(st); } catch (e) { throw new Error(`${sidecar} is not valid JSON: ${e.message}`); }
  const { settings } = readSettings(sFile);
  const removed = { allow: [], deny: [], ask: [] };
  const created = rec.created || [];
  if (settings && settings.permissions && typeof settings.permissions === 'object') {
    for (const k of KINDS) {
      const arr = settings.permissions[k];
      if (!Array.isArray(arr)) continue;
      for (const r of (rec.added && rec.added[k]) || []) {
        const i = arr.indexOf(r);
        if (i >= 0) { arr.splice(i, 1); removed[k].push(r); }
      }
      if (!arr.length && created.includes(k)) delete settings.permissions[k];
    }
    if (!Object.keys(settings.permissions).length && created.includes('permissions')) delete settings.permissions;
  }
  if (!opts.dryRun) {
    if (settings) {
      if (created.includes('file') && !Object.keys(settings).length) fs.rmSync(sFile, { force: true });
      else writeAtomic(sFile, JSON.stringify(settings, null, 2) + '\n');
    }
    fs.rmSync(sidecar, { force: true });
  }
  return { changed: true, removed, settingsFile: sFile };
}

// ---- marker-delimited blocks (CLAUDE.md, AGENTS.md) ----
function applyBlock(file, block, re, heading, opts = {}) {
  const cur = readText(file);
  let next;
  if (cur === null) next = `${heading}${block}`;
  else if (re.test(cur)) next = cur.replace(re, () => block);
  else {
    const sep = cur.length === 0 ? '' : cur.endsWith('\n\n') ? '' : cur.endsWith('\n') ? '\n' : '\n\n';
    next = cur + sep + block;
  }
  if (next === cur) return { changed: false, file };
  if (!opts.dryRun) writeAtomic(file, next);
  return { changed: true, file, created: cur === null };
}

function removeBlock(file, re, heading, opts = {}) {
  const cur = readText(file);
  if (cur === null || !re.test(cur)) return { changed: false, file };
  let next = cur.replace(re, '');
  next = next.replace(/\n\n$/, '\n'); // the blank separator insert added before the block
  const remove = !next.trim() || next.trim() === heading.trim();
  if (!opts.dryRun) { if (remove) fs.rmSync(file, { force: true }); else writeAtomic(file, next); }
  return { changed: true, file, deleted: remove };
}

function blockText() { return `${BEGIN}\n${conventionsBody()}${END}\n`; }
const applyClaudeMd = (root, opts) => applyBlock(path.join(root, 'CLAUDE.md'), blockText(), BLOCK_RE, '# Project\n\n', opts);
const removeClaudeMd = (root, opts) => removeBlock(path.join(root, 'CLAUDE.md'), BLOCK_RE, '# Project', opts);

function agentsBlockText() { return `${AGENTS_BEGIN}\n${fs.readFileSync(AGENTS_ASSET, 'utf8').replace(/\s+$/, '')}\n${AGENTS_END}\n`; }
const applyAgentsMd = (root, opts) => applyBlock(path.join(root, 'AGENTS.md'), agentsBlockText(), AGENTS_BLOCK_RE, '# Project\n\n', opts);
const removeAgentsMd = (root, opts) => removeBlock(path.join(root, 'AGENTS.md'), AGENTS_BLOCK_RE, '# Project', opts);

function summary(label, r, remove) {
  const sets = remove ? r.removed : r.added;
  const n = sets ? KINDS.reduce((a, k) => a + sets[k].length, 0) : 0;
  return `${label}: ${r.changed ? (remove ? `removed ${n} rule(s)` : `added ${n} rule(s)`) : 'no change'} (${r.settingsFile})`;
}

function run(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`shards install: ${e.message}\n\n${usage()}`); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  const root = path.resolve(o.root || process.cwd());
  if (isSourceRepo(root) && !o.force) {
    console.error(`shards install: ${root} is the shards source repo; refusing (use --force to override)`);
    return 1;
  }
  const dry = o.dryRun ? ' [dry-run]' : '';
  try {
    if (o.project) {
      const P = require('./install-project');
      if (o.remove) {
        const r = P.removeProject(root, { dryRun: o.dryRun });
        console.log(`project: ${r.changed ? `removed ${r.removed} file(s)` : 'no change'}${r.kept.length ? `; kept ${r.kept.length} edited file(s): ${r.kept.join(', ')}` : ''}${dry}`);
      } else {
        const r = P.installProject(root, { dryRun: o.dryRun });
        console.log(`project: wrote ${r.written}, unchanged ${r.unchanged} of ${r.total} file(s) (.claude/skills, .agents/skills, .shards/content)${dry}`);
        if (r.conflicts.length) console.log(`project: skipped ${r.conflicts.length} existing file(s) not installed by shards: ${r.conflicts.join(', ')}`);
        console.log('project: skills call the shards MCP tools; register the server (e.g. `claude mcp add shards -- npx -y @proflandrigan/shards-mcp@next`).');
      }
    }
    if (o.permissions) {
      if (o.remove) console.log(summary('permissions', removePermissions(root, { dryRun: o.dryRun }), true) + dry);
      else console.log(summary('permissions', mergePermissions(root, loadPreset(o.preset), { dryRun: o.dryRun }), false) + dry);
    }
    if (o.agentsMd) {
      const r = o.remove ? removeAgentsMd(root, { dryRun: o.dryRun }) : applyAgentsMd(root, { dryRun: o.dryRun });
      console.log(`agents-md: ${r.changed ? (o.remove ? (r.deleted ? 'removed block and deleted file' : 'removed block') : 'Shards fragment written') : 'no change'} (${r.file})${dry}`);
    }
    if (o.claudeMd) {
      const r = o.remove ? removeClaudeMd(root, { dryRun: o.dryRun }) : applyClaudeMd(root, { dryRun: o.dryRun });
      console.log(`claude-md: ${r.changed ? (o.remove ? (r.deleted ? 'removed block and deleted file' : 'removed block') : 'conventions block written') : 'no change'} (${r.file})${dry}`);
    }
  } catch (e) { console.error(`shards install: ${e.message}`); return 1; }
  return 0;
}

module.exports = { run, usage, parse, loadPreset, mergePermissions, removePermissions, applyClaudeMd, removeClaudeMd, applyAgentsMd, removeAgentsMd, AGENTS_BEGIN, AGENTS_END, BEGIN, END, PRESET_FILE };
